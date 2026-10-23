// Reading by pages must bring EVERY row. PostgREST cuts each answer at 1000 rows without saying
// so: that is how July and August once went missing from the DETALLE tab. These drive the app's
// page reader (allPages) with fake sources.
import { describe, expect, it } from 'vitest';
import { allPages, PAGE } from '../../../src/shared/supabase/paging.ts';

/** A table of `n` rows that, like PostgREST, never hands more than 1000 per request. */
function table(n: number) {
    const calls: number[] = [];
    const page = async (from: number, size: number) => {
        calls.push(from);
        const to = Math.min(from + Math.min(size, PAGE), n);
        return Array.from({ length: Math.max(0, to - from) }, (_, i) => ({ id: from + i }));
    };
    return { page, calls };
}

describe('allPages', () => {
    for (const n of [0, 1, 999, 1000, 1001, 2000, 4000, 4001, 5000, 9999, 27_463]) {
        it(`brings all ${n} rows, in order, none twice`, async () => {
            const rows = await allPages(table(n).page);
            expect(rows).toHaveLength(n);
            expect(rows.map((r) => r.id)).toEqual(Array.from({ length: n }, (_, i) => i));
        });
    }

    it('asks one page when the first comes short, and stops at the first short page after', async () => {
        const small = table(10);
        await allPages(small.page);
        expect(small.calls).toEqual([0]);
        const big = table(4500);
        await allPages(big.page, 4);
        expect(big.calls).toEqual([0, 1000, 2000, 3000, 4000]);
    });

    it('fails instead of returning half the rows', async () => {
        const broken = async (from: number) => {
            if (from >= 2000) throw new Error('canceling statement due to statement timeout');
            return Array.from({ length: 1000 }, (_, i) => ({ id: from + i }));
        };
        await expect(allPages(broken)).rejects.toThrow(/statement timeout/);
    });
});
