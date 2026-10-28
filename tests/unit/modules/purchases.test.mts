// The purchase screens' rules (Precios, Proveedores, OC) against what the Apps Script view did.
import { describe, expect, it } from 'vitest';
import type { Doc } from '../../../src/modules/comprobantes/domain/entities/Doc.ts';
import type { Product } from '../../../src/modules/comprobantes/domain/policies/products.ts';
import {
    costCenters,
    findPrices,
    importsByPo,
    legajoTone,
    preparePrices,
    priceWords,
    topParties,
} from '../../../src/modules/comprobantes/domain/policies/purchases.ts';
import { ALL_IN_PEN } from '../../../src/modules/comprobantes/domain/policies/summary.ts';

const doc = (d: Partial<Doc>): Doc => ({
    period: '202609',
    origin: 'compra',
    ruc: '20100000001',
    name: 'ACME',
    kind: 'F',
    currency: 'PEN',
    total: 100,
    detraction: 0,
    oc: '',
    ocLegajo: '',
    ocPayment: '',
    ocFolder: '',
    costCenter: '',
    isImport: false,
    number: 'F001-1',
    issuedOn: '2026-09-01',
    pdf: '',
    xml: '',
    totalPen: 100,
    taxBase: null,
    igv: null,
    untaxed: null,
    detractionIssue: '',
    exchangeRate: null,
    detractionProof: null,
    plate: '',
    fuel: false,
    ...d,
});

const product = (p: Partial<Product>): Product => ({
    description: 'TONER HP',
    unit: 'UND',
    currency: 'PEN',
    ruc: '20100000001',
    supplier: 'ACME',
    times: 1,
    spent: 10,
    prices: [['202609', 10]],
    pdf: '',
    ...p,
});

describe('topParties', () => {
    it('adds by RUC, biggest first, 8 at most, with the total of every document', () => {
        const docs = [doc({ ruc: 'A', total: 50 }), doc({ ruc: 'B', total: 30 }), doc({ ruc: 'A', total: 20 })];
        for (let i = 0; i < 9; i++) docs.push(doc({ ruc: `X${i}`, total: 1 }));
        const { rows, total } = topParties(docs);
        expect(rows).toHaveLength(8);
        expect(rows[0]).toMatchObject({ ruc: 'A', total: 70 });
        expect(total).toBe(109);
    });
});

describe('importsByPo', () => {
    const docs = [
        doc({ isImport: true, oc: '12-2026 / 13-2026', ocLegajo: 'Completo', total: 100, totalPen: 100 }),
        doc({ isImport: true, oc: '13-2026', currency: 'USD', total: 50, totalPen: 185, name: 'DHL' }),
        doc({ isImport: true, oc: '13-2026', period: '202608', total: 7, totalPen: 7 }),
        doc({ isImport: true, oc: '14-2026', origin: 'venta' }),
        doc({ isImport: false, oc: '15-2026' }),
    ];
    it('counts a document in each of its POs, each currency on its own', () => {
        const l = importsByPo(docs, 'm202609', 'PEN');
        expect(l.map((o) => o.oc)).toEqual(['12-2026', '13-2026']);
        const o13 = l.find((o) => o.oc === '13-2026')!;
        expect(o13.byCurrency).toEqual({ PEN: 100, USD: 50 });
        expect(o13.docs).toBe(2);
        expect(o13.suppliers).toEqual(['ACME', 'DHL']);
    });
    it('orders by the soles with «Todo en S/», and takes every month without one', () => {
        const l = importsByPo(docs, '', ALL_IN_PEN);
        expect(l[0]).toMatchObject({ oc: '13-2026', sortValue: 292 });
    });
    it('tones the legajo', () => {
        expect([legajoTone('Completo'), legajoTone('Falta factura'), legajoTone('Otro')]).toEqual(['ok', 'warn', 'muted']);
    });
});

describe('costCenters', () => {
    it('adds by cost centre and counts the documents with one', () => {
        const r = costCenters([doc({ costCenter: 'OBRA', total: 5 }), doc({ costCenter: 'OBRA', total: 5 }), doc({ costCenter: 'ADM', total: 20 }), doc({})]);
        expect(r.rows).toEqual([
            { name: 'ADM', total: 20 },
            { name: 'OBRA', total: 10 },
        ]);
        expect(r.withCostCenter).toBe(3);
    });
});

describe('the price finder', () => {
    const all = preparePrices([
        product({
            description: 'Cámara IP',
            spent: 90,
            prices: [
                ['202601', 100],
                ['202609', 120],
            ],
        }),
        product({
            description: 'TONER HP 85A',
            spent: 50,
            prices: [
                ['202605', 80],
                ['202607', 60],
            ],
        }),
        product({ description: 'POLLO A LA BRASA', supplier: 'Rokys', spent: 30, prices: [['202610', 40]] }),
    ]);
    it('prepares the change and the last month', () => {
        expect(all[0]).toMatchObject({ change: 20, last: '202609' });
        expect(all[1].change).toBe(-25);
        expect(all[2]).toMatchObject({ change: null, last: '202610' });
    });
    it('looks for words of 3+ letters, without accents, in product, supplier and RUC', () => {
        expect(priceWords('cámara ip')).toEqual(['CAMARA']);
        expect(findPrices(all, 'camara', 'todo', 'gasto').map((p) => p.description)).toEqual(['Cámara IP']);
        expect(findPrices(all, 'rokys', 'todo', 'gasto')).toHaveLength(1);
    });
    it('filters by mode and orders', () => {
        expect(findPrices(all, '', 'repite', 'gasto')).toHaveLength(2);
        expect(findPrices(all, '', 'todo', 'sube').map((p) => p.change)).toEqual([20, -25]);
        expect(findPrices(all, '', 'todo', 'baja').map((p) => p.change)).toEqual([-25, 20]);
        expect(findPrices(all, '', 'todo', 'reciente').map((p) => p.last)).toEqual(['202610', '202609', '202607']);
    });
});
