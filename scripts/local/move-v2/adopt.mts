// While the robots write to both bases (22/10/2026), a document can already be in v2 with the id
// its write function gave it (gen_random_uuid) when the move arrives with the id it derives from
// the natural key. Upserting by id would refuse the row (same natural key, other id) and the
// clean-up would delete the robot's one. So before writing, the move adopts the id v2 already
// has for that natural key, in the row and in every row that points to it.

import type { SupabaseClient } from '@supabase/supabase-js';
import { retry } from './pool.mts';
import type { Row } from './helpers.mts';

/** The tables whose id v2 generates, their natural key and the column that points to them. */
const ADOPTED: { table: string; natural: string[]; ref: string | null }[] = [
    { table: 'comprobante', natural: ['empresa_ruc', 'emisor_ruc', 'tipo', 'serie', 'numero'], ref: 'comprobante_id' },
    { table: 'registro_compras', natural: ['empresa_ruc', 'periodo', 'llave'], ref: null },
    { table: 'retencion_comprobante', natural: ['empresa_ruc', 'emisor_ruc', 'serie', 'numero'], ref: 'retencion_id' },
];

const PAGE = 1000;
const keyOf = (r: Row, cols: string[]) => cols.map((c) => String(r[c] ?? '')).join('|');

/** id and natural key of every row v2 has, by id cursor. */
async function existing(db: SupabaseClient, table: string, natural: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    let last: string | null = null;
    for (;;) {
        const page: Row[] = await retry(`${table} ids de la v2`, async () => {
            let q = db
                .from(table)
                .select(['id', ...natural].join(','))
                .order('id')
                .limit(PAGE);
            if (last) q = q.gt('id', last);
            const { data, error } = await q;
            if (error) throw error;
            return (data ?? []) as unknown as Row[];
        });
        for (const r of page) out.set(keyOf(r, natural), String(r.id));
        if (page.length < PAGE) return out;
        last = String(page[page.length - 1].id);
    }
}

/** Rewrites `data` in place; per table, how many rows v2 already had and how many ids changed. */
export async function adoptIds(db: SupabaseClient, data: Record<string, Row[]>): Promise<Record<string, { found: number; adopted: number }>> {
    const adopted: Record<string, { found: number; adopted: number }> = {};
    for (const { table, natural, ref } of ADOPTED) {
        const there = await existing(db, table, natural);
        const moved = new Map<string, string>();
        let found = 0;
        for (const r of data[table] ?? []) {
            const id = there.get(keyOf(r, natural));
            if (id) found++;
            if (id && id !== r.id) {
                moved.set(String(r.id), id);
                r.id = id;
            }
        }
        adopted[table] = { found, adopted: moved.size };
        if (!ref || !moved.size) continue;
        for (const rows of Object.values(data))
            for (const r of rows) {
                const to = r[ref] === null || r[ref] === undefined ? undefined : moved.get(String(r[ref]));
                if (to) r[ref] = to;
            }
    }
    return adopted;
}
