// The old database (vqabgnynidehfqueupki), read as the robot user the scripts use today
// (SUPABASE_URL + SUPABASE_ANON_KEY + ROBOT_*). Read only: nothing here writes.
//
// Every table is read by pages of 1000 (PostgREST's cap) ordered by its primary key, several
// pages at a time. The robot's row rules make some pages slow; a page that hits the 8 s
// statement timeout (57014) is split in two and read again, down to 50 rows.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { pedir } from '../comun/config.mts';
import { pool, retry, type Pool } from './pool.mts';
import { COMPANY, type Row } from './helpers.mts';

const PAGE = 1000;
const WAVE = 3; // pages of one table in flight at once

/**
 * The old project's service_role key (SUPABASE_SERVICE_ROLE_KEY_V1, 21/10/2026), for the `optional`
 * tables only: no row rule applies to it, so the two whose rule recurses can be read. Everything
 * else stays with the robot: the derived functions answer a signed-in user, and with this key
 * vinculos_oc() came back empty (1 699 → 0 links in a dry run).
 */
export function serviceDb(): SupabaseClient | null {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY_V1?.trim();
    return key ? createClient(pedir('SUPABASE_URL'), key, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
}

export async function oldDb(): Promise<SupabaseClient> {
    const c = createClient(pedir('SUPABASE_URL'), pedir('SUPABASE_ANON_KEY'), {
        auth: { autoRefreshToken: true, persistSession: false },
    });
    await retry('entrar a la base vieja', async () => {
        const { error } = await c.auth.signInWithPassword({ email: pedir('ROBOT_CORREO'), password: pedir('ROBOT_CLAVE') });
        if (error) throw error;
    });
    // In Actions the runner's clock can be seconds ahead of the base's: the token just signed in is
    // «issued at future» (PGRST303) until the base catches up (21/10/2026). One small read waits
    // for it, so the parallel pages below do not each spend their two tries on it.
    await retry('esperar a que la base acepte la sesión', async () => {
        const { error } = await c.from('centros_costo').select('id').limit(1);
        if (error) throw error;
    });
    return c;
}

/**
 * What to read: the table, its primary key (for a stable order) and an optional filter.
 * `optional`: a table the robot may not be able to read (a broken row rule in the old base); its
 * failure is reported and the move goes on without it, instead of stopping everything.
 */
export type Source = { table: string; key: string[]; company?: boolean; where?: (q: Query) => Query; optional?: boolean };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any;

export const SOURCES: Source[] = [
    { table: 'centros_costo', key: ['id'] },
    { table: 'equivalencia_centro_costo', key: ['cc_clave'] },
    { table: 'consultas_sunat', key: ['id'], company: true },
    { table: 'fuente_copia', key: ['empresa_ruc', 'pestana'], company: true },
    { table: 'comprobantes_sunat', key: ['id'], company: true },
    { table: 'cambios_comprobante_sunat', key: ['id'] },
    { table: 'cpe_comprobante', key: ['id'], company: true },
    { table: 'cpe_item', key: ['id'] },
    { table: 'cpe_cuota', key: ['id'] },
    { table: 'padron_ruc', key: ['ruc'] },
    { table: 'ruc_domicilio', key: ['ruc'] },
    { table: 'ruc_ssco', key: ['ruc'] },
    { table: 'detraccion_constancia', key: ['id'], company: true },
    { table: 'retencion_comprobante', key: ['id'], company: true },
    { table: 'retencion_documento', key: ['id'], company: true },
    { table: 'fuente_compra_oc', key: ['empresa_ruc', 'procedencia', 'oc'], company: true },
    { table: 'fuente_comex_oc', key: ['empresa_ruc', 'oc'], company: true },
    { table: 'oc_legajo', key: ['empresa_ruc', 'oc', 'carpeta_url'], company: true },
    { table: 'oc_base_cg', key: ['empresa_ruc', 'oc', 'cc_codigo', 'cc_nombre'], company: true },
    { table: 'kardex_vale', key: ['empresa_ruc', 'id'], company: true },
    { table: 'oc_carpeta', key: ['empresa_ruc', 'oc', 'carpeta_url'], company: true },
    // CAPTURA is retired, but what it saw is kept (v2 012: archivo.visto_captura_en).
    { table: 'oc_archivo', key: ['empresa_ruc', 'origen', 'oc', 'url'], company: true },
    { table: 'lectura_archivo', key: ['archivo_id'] },
    { table: 'proyecto_centro_costo', key: ['empresa_ruc', 'procedencia', 'proyecto_carpeta'], company: true },
    { table: 'proveedor_sin_oc', key: ['empresa_ruc', 'proveedor_ruc'], company: true },
    { table: 'carpeta_cambio', key: ['id'], company: true },
    { table: 'fuente_cambio', key: ['id'], company: true },
    // Viáticos (006): the whole pilot. Empty ones are read too, so a row that appears is not lost.
    { table: 'areas', key: ['id'] },
    { table: 'usuarios', key: ['id'] },
    { table: 'roles_usuario', key: ['usuario_id', 'rol'] },
    { table: 'datos_bancarios', key: ['usuario_id'] },
    { table: 'parametros', key: ['clave'] },
    { table: 'cajas_chicas', key: ['id'] },
    { table: 'memos', key: ['id'] },
    { table: 'memo_asignados', key: ['memo_id', 'usuario_id'] },
    { table: 'memo_secuencias', key: ['empresa_id', 'anio', 'tipo'] },
    { table: 'autorizaciones_memo', key: ['id'] },
    { table: 'planillas_movilidad', key: ['id'] },
    { table: 'gastos', key: ['id'] },
    { table: 'liquidaciones', key: ['id'] },
    { table: 'liquidacion_memos', key: ['liquidacion_id', 'memo_id'] },
    { table: 'pagos', key: ['id'] },
    { table: 'pago_lineas', key: ['id'] },
    { table: 'devoluciones', key: ['id'] },
    { table: 'eventos', key: ['id'] },
    // Their row rule recurses on itself in the old base («infinite recursion detected in policy»):
    // the robot cannot read them. They need the old project's service_role key.
    { table: 'solicitudes_memo', key: ['id'], optional: true },
    { table: 'solicitud_personas', key: ['solicitud_id', 'usuario_id'], optional: true },
];

/**
 * The two old read functions whose result is moved once (v2 stores it; the scripts will
 * recalculate it). Their output has no order of its own: it is ordered by what makes a row unique,
 * or two pages computed apart could overlap.
 */
export const DERIVED: { fn: string; key: string[]; where?: (q: Query) => Query }[] = [
    { fn: 'vinculos_oc', key: ['oc', 'proveedor_ruc', 'tipo_comprobante', 'serie', 'numero'] },
    // ~12 400 rows, ~1 200 with a signal: only those are stored, and each page costs ~6 s.
    { fn: 'facturas_sin_oc', key: ['proveedor_ruc', 'serie', 'numero', 'periodo'], where: (q) => q.in('senal', ['ALTA', 'MEDIA']) },
];

type Fetch = (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string; code?: string } | null }>;

/** One range; on a statement timeout, the two halves. */
async function range(label: string, fetch: Fetch, from: number, size: number): Promise<Row[]> {
    try {
        return await retry(
            `${label} [${from}]`,
            async () => {
                const { data, error } = await fetch(from, from + size - 1);
                if (error) throw error;
                return data ?? [];
            },
            size > 50 ? 2 : 6,
        );
    } catch (e) {
        if ((e as { code?: string }).code !== '57014' || size <= 50) throw e;
        const half = Math.ceil(size / 2);
        const a = await range(label, fetch, from, half);
        return a.length < half ? a : a.concat(await range(label, fetch, from + half, size - half));
    }
}

/** All the rows, WAVE pages at a time through `p`, until a page comes back short. */
async function all(label: string, fetch: Fetch, p: Pool, wave = WAVE): Promise<Row[]> {
    const rows: Row[] = [];
    for (let start = 0; ; start += wave * PAGE) {
        const pages = await Promise.all(Array.from({ length: wave }, (_, i) => p.run(() => range(label, fetch, start + i * PAGE, PAGE))));
        for (const pg of pages) rows.push(...pg);
        if (pages.some((pg) => pg.length < PAGE)) return rows;
    }
}

/**
 * A table with a one-column key, by cursor (key > the last one seen): every page costs the same,
 * where an offset makes the base walk all the previous ones (padron_ruc and ruc_domicilio,
 * evaluating the robot's row rule on each, took 4.5 min by offset).
 */
async function byCursor(label: string, key: string, base: () => Query, p: Pool): Promise<Row[]> {
    const rows: Row[] = [];
    let last: unknown = null;
    let size = PAGE;
    for (;;) {
        const page: Row[] = await p.run(() =>
            retry(
                `${label} [${rows.length}]`,
                async () => {
                    let q = base().order(key, { ascending: true });
                    if (last !== null) q = q.gt(key, last);
                    const { data, error } = await q.limit(size);
                    if (error?.code === '57014' && size > 50) size = Math.max(50, Math.floor(size / 2));
                    if (error) throw error;
                    return data ?? [];
                },
                8,
            ),
        );
        rows.push(...page);
        if (page.length < size) return rows;
        last = page[page.length - 1][key];
    }
}

export type OldData = Record<string, Row[]>;

/** Reads every source and the two derived functions, in parallel. */
export async function readOld(robot: SupabaseClient, onDone: (what: string, n: number, ms: number) => void): Promise<OldData> {
    const service = serviceDb();
    const tables = pool(6);
    const slow = pool(2); // the derived functions recalculate everything on every page (~6 s each)
    const out: OldData = {};
    const unreadable: Row[] = [];
    out._unreadable = unreadable;
    const jobs = SOURCES.map(async (s) => {
        const t0 = Date.now();
        const c = s.optional && service ? service : robot;
        const base = () => {
            let q = c.from(s.table).select('*');
            if (s.company) q = q.eq('empresa_ruc', COMPANY);
            return s.where ? s.where(q) : q;
        };
        const read = () =>
            s.key.length === 1
                ? byCursor(s.table, s.key[0], base, tables)
                : all(
                      s.table,
                      (from, to) => {
                          let q = base();
                          for (const k of s.key) q = q.order(k, { ascending: true });
                          return q.range(from, to);
                      },
                      tables,
                  );
        try {
            out[s.table] = await read();
        } catch (e) {
            if (!s.optional) throw e;
            out[s.table] = [];
            unreadable.push({ table: s.table, error: (e as Error).message });
            console.log(`  ✗ ${s.table.padEnd(28)} no se pudo leer: ${(e as Error).message}`);
            return;
        }
        onDone(s.table, out[s.table].length, Date.now() - t0);
    });
    const derived = DERIVED.map(async ({ fn, key, where }) => {
        const t0 = Date.now();
        out[fn] = await all(
            fn,
            (from, to) => {
                let q = robot.rpc(fn, { p_empresa_ruc: COMPANY });
                if (where) q = where(q);
                for (const k of key) q = q.order(k, { ascending: true });
                return q.range(from, to);
            },
            slow,
            2,
        );
        onDone(`${fn}()`, out[fn].length, Date.now() - t0);
    });
    await Promise.all([...jobs, ...derived]);
    return out;
}
