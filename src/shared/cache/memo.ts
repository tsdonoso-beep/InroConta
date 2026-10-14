// A read kept in this server instance's memory for `maxAgeMs`, shared by concurrent requests.
// A failed read is not kept, so the next request tries again. What GetDocuments and GetSalesTax
// do by hand, for the reads that came after them.
import type { Result } from 'neverthrow';

export function memoResult<T, E>(read: () => Promise<Result<T, E>>, maxAgeMs: number): (fresh?: boolean) => Promise<Result<T, E>> {
    let cached: { at: number; value: Promise<Result<T, E>> } | null = null;
    return (fresh = false) => {
        if (!cached || fresh || Date.now() - cached.at > maxAgeMs) {
            const value = read().then(
                (r) => {
                    if (r.isErr()) cached = null;
                    return r;
                },
                (e: unknown) => {
                    cached = null;
                    throw e;
                },
            );
            cached = { at: Date.now(), value };
        }
        return cached.value;
    };
}

/** The same, one entry per key (a folder, a RUC), with at most `max` entries kept. */
export function memoByKey<T, E>(read: (key: string) => Promise<Result<T, E>>, maxAgeMs: number, max = 500): (key: string) => Promise<Result<T, E>> {
    const cache = new Map<string, { at: number; value: Promise<Result<T, E>> }>();
    return (key) => {
        const hit = cache.get(key);
        if (hit && Date.now() - hit.at <= maxAgeMs) return hit.value;
        if (cache.size >= max) cache.delete(cache.keys().next().value as string);
        const value = read(key).then((r) => {
            if (r.isErr()) cache.delete(key);
            return r;
        });
        cache.set(key, { at: Date.now(), value });
        return value;
    };
}
