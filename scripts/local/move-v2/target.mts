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

/** Each table the move writes, its primary key, and the tables it points to (written first). */
export const TABLES: { table: string; key: string[]; after: string[]; principal?: boolean }[] = [
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
];

const BATCH = 500;

type PgError = { message: string; code?: string; details?: string | null; hint?: string | null };
const raw = (e: PgError) => `${e.code ?? ''} ${e.message}${e.details ? ` · ${e.details}` : ''}${e.hint ? ` · ${e.hint}` : ''}`;

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
            if (error && transient(error)) throw error;
            return error;
        });
        if (!error) return;
        if (batch.length === 1) {
            console.error(`  ✗ ${table}: ${raw(error)}\n    fila: ${JSON.stringify(batch[0]).slice(0, 400)}`);
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
                    if (error) throw Object.assign(new Error(`${table} (limpiar): ${raw(error)}`), { code: error.code });
                }),
            ),
        ),
    );
    return stale.length;
}

/**
 * corrida and cambio have generated ids: each moved row carries `mudanza` (old table:id) inside
 * its JSON, and only the ones not moved before are inserted.
 */
export async function append(db: SupabaseClient, p: Pool, table: 'corrida' | 'cambio', json: 'resumen' | 'detalle', rows: Row[]): Promise<number> {
    const seen = new Set<string>();
    for (let from = 0; ; from += 1000) {
        const page = await retry(`${table} marcas`, async () => {
            const { data, error } = await db
                .from(table)
                .select(`m:${json}->>mudanza`)
                .not(`${json}->>mudanza`, 'is', null)
                .order('id', { ascending: true })
                .range(from, from + 999);
            if (error) throw error;
            return (data ?? []) as unknown as { m: string }[];
        });
        for (const r of page) seen.add(r.m);
        if (page.length < 1000) break;
    }
    const fresh = rows.filter((r) => !seen.has(r[json].mudanza));
    // No retry here: an insert whose answer was lost may have gone in, and a second one would
    // duplicate it. If a batch fails, running the move again inserts only what is missing.
    await Promise.all(
        chunks(fresh, BATCH).map((batch, i) =>
            p.run(async () => {
                const { error } = await db.from(table).insert(batch, { defaultToNull: false });
                if (error) throw Object.assign(new Error(`${table} lote ${i + 1}: ${raw(error)}`), { code: error.code });
            }),
        ),
    );
    return fresh.length;
}
