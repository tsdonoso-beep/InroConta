// The v2 base for the OC robots (fuentes-compras.mts, carpetas-oc.mts): the service key, no
// sign-in. Reads are plain table reads paged by 1000 (README «Reglas del diseño» 6); writes go
// through the v2 functions of docs/database/v2/005_escrituras_oc.sql.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type Base = SupabaseClient;

function env(...names: string[]): string {
    for (const n of names) {
        const v = (process.env[n] ?? '').trim();
        if (v) return v;
    }
    throw new Error(`falta ${names.join(' o ')} en el entorno`);
}

export function baseV2(): Base {
    return createClient(env('SUPABASE_URL_V2'), env('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'), {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

// The query type changes with every filter; here it only needs eq/in/order/range.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Query = any;

/** Every row of a table, 1000 at a time, in a fixed order (without it two pages can repeat or skip rows). */
export async function allRows<T>(sb: Base, table: string, columns: string, order: string[], filter: (q: Query) => Query = (q) => q): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += 1000) {
        let q = filter(sb.from(table).select(columns));
        for (const c of order) q = q.order(c);
        const { data, error } = await q.range(from, from + 999);
        if (error) throw new Error(`${table}: ${error.message}`);
        out.push(...(data as T[]));
        if (!data || data.length < 1000) return out;
    }
}

/** A v2 write function; its error is thrown with the function's name. */
export async function call<T = unknown>(sb: Base, fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as T;
}
