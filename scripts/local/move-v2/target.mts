// The new database (SUPABASE_URL_V2), written with the secret key (service_role: over the RLS,
// see docs/database/v2/009_acceso.sql). Upserts by primary key, so running the move again
// updates the same rows; and `prune` deletes what the new base has and this run did not produce
// (a row deleted in the old base, or one this script no longer makes).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { pedir } from '../comun/config.mts';
import { chunks, retry, transient, type Pool } from './pool.mts';
import type { Row } from './helpers.mts';

export function newDb(): SupabaseClient {
    return createClient(pedir('SUPABASE_URL_V2'), pedir('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'), {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

/**
 * Each table the move writes, its primary key, and the steps it points to (written first). `as`:
 * a second step on the same table (area goes once without its head, who is a usuario, and again
 * after them). `keep`: v2 seeded rows of its own there, so what this run did not write is not pruned.
 */
export type Step = { table: string; key: string[]; after: string[]; principal?: boolean; as?: string; keep?: boolean };
export const stepName = (t: Step) => t.as ?? t.table;

export const TABLES: Step[] = [
    { table: 'contribuyente', key: ['ruc'], after: [] },
    { table: 'lista_ssco', key: ['ruc'], after: [] },
    { table: 'centro_costo', key: ['id'], after: [] },
    { table: 'comprobante', key: ['id'], after: ['contribuyente'] },
    { table: 'registro_compras', key: ['id'], after: ['comprobante'] },
    { table: 'comprobante_item', key: ['comprobante_id', 'linea'], after: ['comprobante'] },
    { table: 'comprobante_cuota', key: ['comprobante_id', 'numero'], after: ['comprobante'] },
    { table: 'detraccion_constancia', key: ['numero_constancia'], after: ['comprobante'] },
    { table: 'retencion_comprobante', key: ['id'], after: ['contribuyente'] },
    { table: 'retencion_documento', key: ['retencion_id', 'tipo', 'serie', 'numero', 'numero_pago'], after: ['retencion_comprobante', 'comprobante'] },
    { table: 'orden_compra', key: ['id'], after: ['contribuyente', 'centro_costo'] },
    { table: 'orden_compra_centro_costo', key: ['orden_compra_id', 'centro_costo_id'], after: ['orden_compra'], principal: true },
    { table: 'orden_compra_dua', key: ['orden_compra_id', 'dua'], after: ['orden_compra'] },
    { table: 'vale_almacen', key: ['id'], after: ['orden_compra'] },
    { table: 'carpeta_oc', key: ['drive_id'], after: ['orden_compra'] },
    { table: 'archivo', key: ['drive_id'], after: ['carpeta_oc'] },
    { table: 'comprobante_oc', key: ['comprobante_id', 'orden_compra_id'], after: ['comprobante', 'orden_compra', 'archivo'], principal: true },
    { table: 'regla_centro_costo', key: ['empresa_ruc', 'procedencia', 'proyecto_carpeta'], after: ['centro_costo'] },
    { table: 'proveedor_sin_oc', key: ['empresa_ruc', 'proveedor_ruc'], after: ['contribuyente'] },
    { table: 'orden_compra_legajo', key: ['orden_compra_id', 'carpeta_id'], after: ['orden_compra'] },
    // Viáticos (006).
    { table: 'area', as: 'area_base', key: ['id'], after: [], keep: true },
    { table: 'usuario', key: ['id'], after: ['area_base'] },
    { table: 'area', key: ['id'], after: ['usuario'] },
    { table: 'usuario_rol', key: ['usuario_id', 'rol'], after: ['usuario'] },
    { table: 'usuario_banco', key: ['usuario_id'], after: ['usuario'] },
    { table: 'parametro', key: ['clave'], after: ['usuario'], keep: true },
    { table: 'caja_chica', key: ['id'], after: ['usuario'] },
    { table: 'memo', key: ['id'], after: ['usuario', 'centro_costo', 'caja_chica'] },
    { table: 'memo_persona', key: ['memo_id', 'usuario_id'], after: ['memo'] },
    { table: 'memo_correlativo', key: ['empresa_ruc', 'anio', 'tipo'], after: [] },
    { table: 'memo_autorizacion', key: ['id'], after: ['memo'] },
    { table: 'planilla_movilidad', key: ['id'], after: ['memo'] },
    { table: 'gasto', key: ['id'], after: ['planilla_movilidad', 'contribuyente', 'comprobante'] },
    { table: 'liquidacion', key: ['id'], after: ['usuario'] },
    { table: 'liquidacion_memo', key: ['liquidacion_id', 'memo_id'], after: ['liquidacion', 'memo'] },
    { table: 'pago', key: ['id'], after: ['memo'] },
    { table: 'pago_linea', key: ['pago_id', 'usuario_id'], after: ['pago'] },
    { table: 'devolucion', key: ['id'], after: ['memo'] },
];

const BATCH = 500;

type PgError = { message: string; code?: string; details?: string | null; hint?: string | null };
const raw = (e: PgError) => `${e.code ?? ''} ${e.message}${e.details ? ` · ${e.details}` : ''}${e.hint ? ` · ${e.hint}` : ''}`;
// What the console gets: in Actions the log of this public repository is public, and Postgres puts
// the refused row in `details` («Failing row contains (…)», names and amounts: 21/10/2026). The
// whole error stays in v2's dato_sin_ubicar.
const shown = (e: PgError) => (process.env.CI ? raw({ ...e, details: null }) : raw(e));

/**
 * Upserts every row, BATCH at a time through `p`. With a «principal» flag (one per parent, a
 * unique index), the rows that stop being principal go first, then the principal ones: a batch
 * that sets the new one before clearing the old would hit the index.
 */
export async function write(db: SupabaseClient, p: Pool, table: string, key: string[], rows: Row[], principal = false) {
    const rejected: { row: Row; error: string }[] = [];
    // One bad row makes Postgres refuse its whole batch: the batch is split in halves until the
    // bad rows are alone; the rest goes in and they are reported.
    const send = async (batch: Row[]): Promise<void> => {
        const error = await retry(`${table} (${batch.length} filas)`, async () => {
            const { error } = await db.from(table).upsert(batch, { onConflict: key.join(','), defaultToNull: false });
            // A batch past the base's statement timeout is split below, not sent again the same size
            // (archivo, with every walk in jsonb, did not fit 500 rows in 8 s on 21/10/2026).
            if (error?.code === '57014' && batch.length > 25) return error;
            if (error && transient(error)) throw error;
            return error;
        });
        if (!error) return;
        if (error.code === '57014' && batch.length > 25) {
            const half = Math.ceil(batch.length / 2);
            await send(batch.slice(0, half));
            await send(batch.slice(half));
            return;
        }
        if (batch.length === 1) {
            // Same reason as shown(): in Actions the row stays in dato_sin_ubicar, not in the log.
            const row = process.env.CI ? '' : `\n    fila: ${JSON.stringify(batch[0]).slice(0, 400)}`;
            console.error(`  ✗ ${table}: ${shown(error)}${row}`);
            rejected.push({ row: batch[0], error: raw(error) });
            return;
        }
        const half = Math.ceil(batch.length / 2);
        await send(batch.slice(0, half));
        await send(batch.slice(half));
    };
    const phases = principal ? [rows.filter((r) => !r.principal), rows.filter((r) => r.principal)] : [rows];
    for (const phase of phases) await Promise.all(chunks(phase, BATCH).map((batch) => p.run(() => send(batch))));
    return rejected;
}

/** Every primary key the new base has for `table`, page by page. */
async function keysOf(db: SupabaseClient, table: string, key: string[]): Promise<Row[]> {
    const out: Row[] = [];
    for (let from = 0; ; from += 1000) {
        const page = await retry(`${table} llaves`, async () => {
            let q = db.from(table).select(key.join(','));
            for (const k of key) q = q.order(k, { ascending: true });
            const { data, error } = await q.range(from, from + 999);
            if (error) throw error;
            return (data ?? []) as unknown as Row[];
        });
        out.push(...page);
        if (page.length < 1000) return out;
    }
}

const quote = (v: unknown) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const id = (r: Row, key: string[]) => key.map((k) => String(r[k])).join('\u0001');

/**
 * Deletes what the new base has and this run did not write. Refuses when the run wrote less than
 * half of what is there: that is a read that failed, not half the company gone.
 */
export async function prune(db: SupabaseClient, p: Pool, table: string, key: string[], rows: Row[]): Promise<number | string> {
    const made = new Set(rows.map((r) => id(r, key)));
    const there = await keysOf(db, table, key);
    const stale = there.filter((r) => !made.has(id(r, key)));
    if (!stale.length) return 0;
    if (made.size < there.length / 2) return `no se limpia: esta corrida trae ${made.size} y la base tiene ${there.length}`;
    const size = key.length === 1 ? 200 : 50;
    await Promise.all(
        chunks(stale, size).map((batch) =>
            p.run(() =>
                retry(`${table} limpiar`, async () => {
                    let q = db.from(table).delete();
                    q =
                        key.length === 1
                            ? q.in(
                                  key[0],
                                  batch.map((r) => r[key[0]]),
                              )
                            : q.or(batch.map((r) => `and(${key.map((k) => `${k}.eq.${quote(r[k])}`).join(',')})`).join(','));
                    const { error } = await q;
                    if (error) throw Object.assign(new Error(`${table} (limpiar): ${shown(error)}`), { code: error.code });
                }),
            ),
        ),
    );
    return stale.length;
}

/**
 * corrida and cambio have generated ids, so they cannot be upserted: each moved row carries
 * `mudanza` (old table:id) inside its JSON, and every run deletes the rows it moved before and
 * inserts them again, as the old base has them now. What the v2 workflows write carries no mark
 * and is not touched. A cambio that points to a moved corrida would block its delete: the moved
 * ones point to none.
 */
export async function replaceMoved(
    db: SupabaseClient,
    p: Pool,
    table: 'corrida' | 'cambio' | 'dato_sin_ubicar',
    json: 'resumen' | 'detalle',
    rows: Row[],
): Promise<number> {
    const { error } = await db.from(table).delete().not(`${json}->>mudanza`, 'is', null);
    if (error) throw Object.assign(new Error(`${table} (borrar lo mudado antes): ${shown(error)}`), { code: error.code });
    // No retry here: an insert whose answer was lost may have gone in, and a second one would
    // duplicate it. If a batch fails, running the move again starts this table over.
    await Promise.all(
        chunks(rows, BATCH).map((batch, i) =>
            p.run(async () => {
                const { error } = await db.from(table).insert(batch, { defaultToNull: false });
                if (error) throw Object.assign(new Error(`${table} lote ${i + 1}: ${shown(error)}`), { code: error.code });
            }),
        ),
    );
    return rows.length;
}
