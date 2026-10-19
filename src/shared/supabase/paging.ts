// Every row of a PostgREST read, page by page. PostgREST hands at most 1000 rows per request
// and says nothing when it cuts: a round total (1000, 2000) is the cap, not the data. That is how
// July and August once went missing from the DETALLE tab (items-sunat.ts). Pure, so the tests can
// drive it with a fake page source (tests/unit/shared/paging.test.mts).

export const PAGE = 1000;

/** One page: the rows from `from` to `from + size - 1`. Throws on error. */
export type FetchPage<T> = (from: number, size: number) => Promise<T[]>;

/**
 * The first page and, if it came full, the next ones `wave` at a time, until one comes short.
 * The source must order by something unique, or two pages could overlap.
 */
export async function allPages<T>(page: FetchPage<T>, wave = 4, size = PAGE): Promise<T[]> {
    const rows = await page(0, size);
    if (rows.length < size) return rows;
    for (let start = size; ; start += wave * size) {
        const pages = await Promise.all(Array.from({ length: wave }, (_, i) => page(start + i * size, size)));
        for (const p of pages) rows.push(...p);
        if (pages.some((p) => p.length < size)) return rows;
    }
}
