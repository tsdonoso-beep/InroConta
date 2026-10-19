// Reading by pages must bring EVERY row. PostgREST cuts each answer at 1000 rows without saying
// so: that is how July and August once went missing from the DETALLE tab. These drive the two
// page readers (the app's allPages and the robot's detalleCpeCompleto) with fake sources.
import { describe, expect, it } from 'vitest';
import { allPages, PAGE } from '../../../src/shared/supabase/paging.ts';
import { detalleCpeCompleto } from '../../../src/shared/lib/export/items-sunat.ts';

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

describe('detalleCpeCompleto (what the robots publish in the DETALLE tab)', () => {
    /** A fake base: periods with more than 1000 item lines each, served 1000 at a time. */
    function base(perPeriod: Record<string, number>) {
        return {
            rpc(fn: string, args: Record<string, unknown>) {
                return {
                    async range(from: number, to: number) {
                        let rows: Record<string, unknown>[];
                        if (fn === 'periodos_detalle_cpe') rows = Object.keys(perPeriod).map((periodo) => ({ periodo }));
                        else {
                            const p = String(args.p_periodo);
                            rows = Array.from({ length: perPeriod[p] }, (_, i) => ({
                                periodo: p,
                                fecha_emision: `${p.slice(0, 4)}-${p.slice(4)}-${String((i % 28) + 1).padStart(2, '0')}`,
                                serie: 'F001',
                                numero: String(Math.floor(i / 3) + 1),
                                linea: (i % 3) + 1,
                            }));
                        }
                        return { data: rows.slice(from, Math.min(to + 1, from + PAGE)), error: null };
                    },
                };
            },
        };
    }

    it('brings every line of every period, even past 1000 per period', async () => {
        const rows = await detalleCpeCompleto(base({ '202607': 2828, '202608': 3220, '202609': 1000 }), null);
        expect(rows).toHaveLength(2828 + 3220 + 1000);
        expect(new Set(rows.map((r) => `${r.periodo}|${r.numero}|${r.linea}`)).size).toBe(rows.length);
    });

    it('orders by issue date, as the tab is read', async () => {
        const rows = await detalleCpeCompleto(base({ '202608': 1500, '202607': 1500 }), null);
        const dates = rows.map((r) => String(r.fecha_emision));
        expect(dates).toEqual([...dates].sort());
    });
});
