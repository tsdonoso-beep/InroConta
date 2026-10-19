// Reading the v2 tables as Results (v2 has no read functions: README «Reglas del diseño» 6). The
// error is logged DISARMED: a PostgrestError printed whole shows {}.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { err, ok, type Result } from 'neverthrow';
import type { SourceError } from '../errors.ts';
import { allPages } from './paging.ts';
import { serviceClient } from './service.ts';

type Answer = PromiseLike<{ data: unknown; error: unknown }>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any;

function failed(what: string, e: unknown): Result<never, SourceError> {
    if (e && typeof e === 'object' && 'code' in e) {
        const p = e as { code?: string; message?: string; details?: string; hint?: string };
        console.error(`[db] ${what} failed`, { code: p.code, message: p.message, details: p.details, hint: p.hint });
        return err({ kind: 'source-failed', message: `${what}: ${p.message ?? p.code}` });
    }
    console.error(`[db] ${what} threw`, e);
    return err({ kind: 'source-failed', message: `${what}: ${e instanceof Error ? e.message : String(e)}` });
}

/** One request (`query` builds it: from, select, filters, limit). */
export async function one<T>(what: string, query: (c: SupabaseClient) => Answer): Promise<Result<T[], SourceError>> {
    try {
        const { data, error } = await query(serviceClient());
        if (error) return failed(what, error);
        return ok((data ?? []) as T[]);
    } catch (e) {
        return failed(what, e);
    }
}

/** Every row, page by page (allPages). `query` must order by something unique, or two pages could overlap. */
export async function all<T>(what: string, query: (c: SupabaseClient) => Query): Promise<Result<T[], SourceError>> {
    try {
        return ok(
            await allPages<T>(async (from, size) => {
                const { data, error } = await query(serviceClient()).range(from, from + size - 1);
                if (error) throw error;
                return (data ?? []) as T[];
            }),
        );
    } catch (e) {
        return failed(what, e);
    }
}

/** yyyy-mm-dd of an instant in Lima (what Contabilidad reads), '' when there is none. */
export function limaDate(at: unknown): string {
    if (!at) return '';
    const d = new Date(String(at));
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}
