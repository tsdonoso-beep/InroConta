// The Kardex screen rules (src/modules/kardex/domain/policies/kardex.ts).
import { describe, expect, it } from 'vitest';
import type { KardexChange, KardexMonth } from '../../../src/modules/kardex/domain/entities/Kardex.ts';
import { changeText, filterKardexChanges, KARDEX_FILTER_DEFAULT, kardexKpis, postClosingByMonth } from '../../../src/modules/kardex/domain/policies/kardex.ts';

const ch = (p: Partial<KardexChange>): KardexChange => ({
    id: 1,
    key: 'K1',
    type: 'CAMBIO',
    field: 'salida',
    before: '4',
    after: '5',
    month: '2026-09',
    closedMonth: true,
    voucher: 'VA-001',
    movement: 'SALIDA',
    sku: 'SKU-1',
    product: 'PINTURA ESMALTE',
    project: 'PRONIED',
    responsible: 'JOSÉ',
    at: '2026-10-27T15:00:00.000Z',
    ...p,
});

const CHANGES = [
    ch({}),
    ch({ id: 2, field: 'fechaOperacion', before: '2026-09-30', after: '2026-10-01' }),
    ch({ id: 3, key: 'K2', type: 'NUEVO', month: '2026-08', at: '2026-10-01T15:00:00.000Z' }),
    ch({ id: 4, key: 'K3', type: 'NUEVO', month: '2026-10', closedMonth: false, product: 'CLAVO' }),
];

describe('filterKardexChanges', () => {
    it('shows only what moved a closed month by default', () => {
        expect(filterKardexChanges(CHANGES, KARDEX_FILTER_DEFAULT).map((c) => c.id)).toEqual([1, 2, 3]);
        expect(filterKardexChanges(CHANGES, { ...KARDEX_FILTER_DEFAULT, closedOnly: false }).length).toBe(4);
    });
    it('filters by month, kind and words without accents', () => {
        expect(filterKardexChanges(CHANGES, { ...KARDEX_FILTER_DEFAULT, month: '2026-08' }).map((c) => c.id)).toEqual([3]);
        expect(filterKardexChanges(CHANGES, { ...KARDEX_FILTER_DEFAULT, type: 'NUEVO' }).map((c) => c.id)).toEqual([3]);
        expect(filterKardexChanges(CHANGES, { ...KARDEX_FILTER_DEFAULT, closedOnly: false, text: 'jose clavo' }).map((c) => c.id)).toEqual([4]);
    });
});

describe('kardexKpis and postClosingByMonth', () => {
    const months: KardexMonth[] = [{ month: '2026-10', movements: 120, vouchers: 30, inQty: 10, outQty: 20, voided: 1 }];
    it('counts the changes to closed months, the movements and months they touched, and this month', () => {
        const k = kardexKpis(months, CHANGES, new Date('2026-10-28T15:00:00.000Z'));
        expect([k.closedChanges, k.closedMovements, k.closedMonths, k.lastWeek, k.current?.movements]).toEqual([3, 2, 2, 3, 120]);
        expect([...postClosingByMonth(CHANGES)]).toEqual([
            ['2026-09', 2],
            ['2026-08', 1],
        ]);
    });
    it('says what changed in words', () => {
        expect(CHANGES.map(changeText)).toEqual(['Salida: 4 → 5', 'Fecha de operación: 2026-09-30 → 2026-10-01', 'Movimiento nuevo', 'Movimiento nuevo']);
        expect(changeText(ch({ type: 'ELIMINADO' }))).toBe('Se borró del kardex');
        expect(changeText(ch({ before: '' }))).toBe('Salida: (vacío) → 5');
    });
});
