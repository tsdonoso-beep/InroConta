// The base's functions and tables as Results, with the error logged DISARMED (a PostgrestError
// printed whole shows {}). The adapters of every context read through here.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { err, ok, type Result } from 'neverthrow';
import type { SourceError } from '../errors.ts';
import { robotClient } from './robot.ts';

export type DbError = SourceError;

const PAGE = 1000;

function failed(what: string, e: unknown): Result<never, DbError> {
    if (e && typeof e === 'object' && 'code' in e) {
        const p = e as { code?: string; message?: string; details?: string; hint?: string };
        console.error(`[db] ${what} failed`, { code: p.code, message: p.message, details: p.details, hint: p.hint });
        return err({ kind: 'source-failed', message: `${what}: ${p.message ?? p.code}` });
    }
    console.error(`[db] ${what} threw`, e);
    return err({ kind: 'source-failed', message: `${what}: ${e instanceof Error ? e.message : String(e)}` });
}

/** A function of the base (RPC) that answers in one call (the *_json ones, migration 058). */
export async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<Result<T, DbError>> {
    try {
        const { data, error } = await (await robotClient()).rpc(name, args);
        if (error) return failed(name, error);
        return ok(data as T);
    } catch (e) {
        return failed(name, e);
    }
}

/**
 * A set-returning function, page by page: PostgREST hands at most 1000 rows per request, so a
 * round total would be a cap, not the data. The function must order its rows in a fixed way.
 */
export async function rpcAllRows<T>(name: string, args: Record<string, unknown> = {}): Promise<Result<T[], DbError>> {
    try {
        const c = await robotClient();
        const rows: T[] = [];
        for (let from = 0; ; from += PAGE) {
            const { data, error } = await c.rpc(name, args).range(from, from + PAGE - 1);
            if (error) return failed(name, error);
            const page = (data ?? []) as T[];
            rows.push(...page);
            if (page.length < PAGE) return ok(rows);
        }
    } catch (e) {
        return failed(name, e);
    }
}

/** Rows of a table or view: `query` builds the request on the client (from, select, filters). */
export async function select<T>(table: string, query: (c: SupabaseClient) => PromiseLike<{ data: unknown; error: unknown }>): Promise<Result<T[], DbError>> {
    try {
        const { data, error } = await query(await robotClient());
        if (error) return failed(table, error);
        return ok((data ?? []) as T[]);
    } catch (e) {
        return failed(table, e);
    }
}
