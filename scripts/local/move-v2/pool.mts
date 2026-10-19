// Concurrency for the move: a queue with a fixed number of workers, retries with backoff and
// deterministic ids. The move is I/O bound (HTTP to two Supabase projects), so threads would not
// help: what limits it is how many requests each database takes at once, and that is the pool size.

import { createHash } from 'node:crypto';

export type Task<T> = () => Promise<T>;

/** A queue that runs at most `size` tasks at a time; `run` resolves with the task's result. */
export function pool(size: number) {
    let active = 0;
    const queue: { task: Task<unknown>; ok: (v: unknown) => void; fail: (e: unknown) => void }[] = [];
    const next = () => {
        while (active < size && queue.length) {
            const { task, ok, fail } = queue.shift()!;
            active++;
            task()
                .then(ok, fail)
                .finally(() => {
                    active--;
                    next();
                });
        }
    };
    return {
        run<T>(task: Task<T>): Promise<T> {
            return new Promise<T>((ok, fail) => {
                queue.push({ task, ok: ok as (v: unknown) => void, fail });
                next();
            });
        },
        get pending() {
            return queue.length + active;
        },
    };
}

export type Pool = ReturnType<typeof pool>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** What PostgREST or the network say when trying again can work. */
export function transient(e: { message?: string; code?: string; status?: number } | null | undefined): boolean {
    if (!e) return false;
    if (e.code === '57014') return true; // statement timeout
    if (e.status && e.status >= 500) return true;
    return /fetch failed|network|timeout|ECONNRESET|ETIMEDOUT|socket hang up|502|503|504|520|522/i.test(e.message ?? '');
}

/** Runs `task` until it works, up to `tries` times, waiting longer each time on transient errors. */
export async function retry<T>(label: string, task: Task<T>, tries = 6): Promise<T> {
    for (let i = 1; ; i++) {
        try {
            return await task();
        } catch (e) {
            const err = e as { message?: string; code?: string; status?: number };
            if (i >= tries || !transient(err)) throw e;
            console.log(`  ⚠ ${label}: ${err.code ?? ''} ${err.message ?? e} (reintento ${i}/${tries - 1})`);
            await sleep(800 * i * i);
        }
    }
}

/**
 * A UUID that always comes out the same for the same natural key (v5-style, SHA-1).
 * Running the move twice upserts the same rows instead of duplicating them, and the children can
 * point to their parent without asking the database for its id.
 */
export function uuidFor(kind: string, key: string): string {
    const h = createHash('sha1').update(`inroconta-v2|${kind}|${key}`).digest();
    h[6] = (h[6] & 0x0f) | 0x50;
    h[8] = (h[8] & 0x3f) | 0x80;
    const x = h.subarray(0, 16).toString('hex');
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/** Splits a list into chunks of `size`. */
export function chunks<T>(list: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
}
