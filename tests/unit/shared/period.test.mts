import { describe, expect, it } from 'vitest';
import { dateInPeriod, inPeriod, isoOf, parsePeriod, periodCode, periodLabel, previousPeriod, rangeCode } from '../../../src/shared/period.ts';

describe('period', () => {
    it('parses every kind, with its first and last day', () => {
        expect(parsePeriod('m202602')).toMatchObject({ kind: 'month', from: '2026-02-01', to: '2026-02-28', months: ['202602'] });
        expect(parsePeriod('b2026-5')?.months).toEqual(['202609', '202610']);
        expect(parsePeriod('t2026-3')).toMatchObject({ from: '2026-07-01', to: '2026-09-30' });
        expect(parsePeriod('s2026-2')?.months).toHaveLength(6);
        expect(parsePeriod('a2026')).toMatchObject({ from: '2026-01-01', to: '2026-12-31' });
        expect(parsePeriod('d2026-09-12')).toMatchObject({ kind: 'day', months: null });
        expect(parsePeriod('r2026-09-01_2026-09-15')).toMatchObject({ from: '2026-09-01', to: '2026-09-15' });
        expect(parsePeriod('')).toBeNull();
        expect(parsePeriod('t2026-5')).toBeNull();
        expect(parsePeriod('r2026-09-15_2026-09-01')).toBeNull();
    });

    it('builds codes and labels', () => {
        expect(periodCode('quarter', '202608')).toBe('t2026-3');
        expect(periodCode('bimester', '202601')).toBe('b2026-1');
        expect(rangeCode('2026-09-30', '2026-09-01')).toBe('r2026-09-01_2026-09-30');
        expect(periodLabel(parsePeriod('t2026-3'))).toBe('3.er trimestre 2026 (jul–set)');
        expect(periodLabel(parsePeriod('m202609'))).toBe('set 26');
        expect(periodLabel(parsePeriod('r2026-09-01_2026-09-15'))).toBe('01/09/2026 – 15/09/2026');
    });

    it('steps back one period of the same length, across the year', () => {
        expect(previousPeriod(parsePeriod('t2026-1'))?.code).toBe('t2025-4');
        expect(previousPeriod(parsePeriod('m202601'))?.code).toBe('m202512');
        expect(previousPeriod(parsePeriod('b2026-3'))?.code).toBe('b2026-2');
        expect(previousPeriod(parsePeriod('d2026-03-01'))?.code).toBe('d2026-02-28');
        expect(previousPeriod(parsePeriod('r2026-09-01_2026-09-15'))).toBeNull();
    });

    it('filters by SUNAT period for months and by date for days and ranges', () => {
        const q = parsePeriod('t2026-3');
        expect(inPeriod(q, '202608', '2026-07-31')).toBe(true);
        expect(inPeriod(q, '202610', '2026-09-30')).toBe(false);
        const r = parsePeriod('r2026-09-01_2026-09-15');
        expect(inPeriod(r, '202609', '2026-09-15')).toBe(true);
        expect(inPeriod(r, '202609', '')).toBe(false);
        expect(dateInPeriod(q, '2026-09-30T23:00:00Z')).toBe(true);
        expect(isoOf('12/09/2026')).toBe('2026-09-12');
    });
});
