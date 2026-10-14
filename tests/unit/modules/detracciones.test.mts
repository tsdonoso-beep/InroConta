// The rules of the Detracciones screen (src/modules/detracciones/domain/policies/proofs.ts),
// against what pintarDetr() and its helpers did in the Apps Script view.
import { describe, expect, it } from 'vitest';
import type { Detractions, MissingProof, Proof } from '../../../src/modules/detracciones/domain/entities/Proof.ts';
import {
    byCase,
    caseOf,
    detractionKpis,
    docNumber,
    filterDetractions,
    goodsLabel,
    latestFirst,
    paymentDelay,
    paymentMonths,
    topCounterparts,
} from '../../../src/modules/detracciones/domain/policies/proofs.ts';

const proof = (p: Partial<Proof>): Proof => ({
    case: 'Normal',
    period: '202601',
    direction: 'compra',
    paidOn: '2026-02-05',
    monthsToPay: 1,
    constancia: '1',
    docType: '01',
    series: 'F001',
    number: '1',
    supplierRuc: '20100000001',
    supplierName: 'ACME SAC',
    buyerDoc: '20600000001',
    buyerName: 'INROPRIN',
    goodsCode: '22',
    deposited: 100,
    invoiceDetraction: 100,
    invoiceIn: 'XML',
    invoiceTotal: 1000,
    currency: 'PEN',
    account: '',
    xmlAccount: '',
    operation: '',
    proofPdf: '',
    proofHtml: '',
    invoicePdf: '',
    paidAt: '',
    ...p,
});
const missing = (m: Partial<MissingProof>): MissingProof => ({
    direction: 'compra',
    period: '202602',
    issuedOn: '2026-02-10',
    monthsSinceIssue: 0,
    ruc: '20100000002',
    name: 'BETA SAC',
    docType: '01',
    series: 'F002',
    number: '7',
    total: 500,
    currency: 'PEN',
    detraction: 50,
    source: 'XML',
    invoicePdf: '',
    ...m,
});

const data: Detractions = {
    proofs: [
        proof({}),
        proof({ case: 'Revisar monto', constancia: '2', paidOn: '2026-03-01', period: '202602', deposited: 90, monthsToPay: 1 }),
        proof({
            case: 'Factura de 2025',
            constancia: '3',
            period: '202512',
            paidOn: '2026-02-20',
            monthsToPay: 2,
            supplierName: 'Cámara SAC',
            supplierRuc: '20100000003',
        }),
        proof({ direction: 'venta', constancia: '4', deposited: 300, buyerDoc: '20999', buyerName: 'CLIENTE SA', monthsToPay: null }),
    ],
    missing: [missing({}), missing({ direction: 'venta', monthsSinceIssue: 3, period: '202601' })],
    since: '202601',
    readAt: '2026-10-13T15:00:00Z',
};

describe('cases and labels', () => {
    it('finds the case by prefix, in the base order', () => {
        expect(caseOf('Factura de 2025')).toMatchObject({ name: 'Factura de', color: 'primary', order: 1 });
        expect(caseOf('Algo nuevo')).toMatchObject({ name: 'Algo nuevo', color: 'muted', order: 99 });
    });
    it('names goods codes and documents like the old view', () => {
        expect(goodsLabel('22')).toBe('022 · Otros servicios empresariales');
        expect(goodsLabel('999')).toBe('999 · otro');
        expect(goodsLabel('')).toBe('—');
        expect(docNumber('f001', '000123')).toBe('F001-123');
        expect(docNumber('F001', '0')).toBe('F001-0');
    });
});

describe('filterDetractions', () => {
    const base = { direction: 'compra' as const, period: '', basis: 'pago' as const, case: '', text: '' };
    it('filters by direction, text without accents, month of payment or period, and case', () => {
        expect(filterDetractions(data, base).proofs).toHaveLength(3);
        expect(filterDetractions(data, { ...base, text: 'camara' }).proofs.map((p) => p.constancia)).toEqual(['3']);
        expect(filterDetractions(data, { ...base, period: 'm202602' }).proofs.map((p) => p.constancia)).toEqual(['1', '3']);
        expect(filterDetractions(data, { ...base, period: 'm202602', basis: 'periodo' }).proofs.map((p) => p.constancia)).toEqual(['2']);
        const r = filterDetractions(data, { ...base, case: 'Revisar monto' });
        expect(r.proofs.map((p) => p.constancia)).toEqual(['2']);
        expect(r.cases).toEqual([
            { name: 'Revisar monto', count: 1 },
            { name: 'Factura de 2025', count: 1 },
            { name: 'Normal', count: 1 },
        ]);
    });
    it('applies to the invoices without proof only the period, never the month of payment', () => {
        expect(filterDetractions(data, { ...base, period: 'm202612' }).missing).toHaveLength(1);
        expect(filterDetractions(data, { ...base, direction: '', period: 'm202601', basis: 'periodo' }).missing).toHaveLength(1);
    });
    it('filters a quarter or a range of days by payment date', () => {
        expect(
            filterDetractions(data, { ...base, period: 't2026-1' })
                .proofs.map((p) => p.constancia)
                .sort(),
        ).toEqual(
            filterDetractions(data, { ...base, period: 'r2026-01-01_2026-03-31' })
                .proofs.map((p) => p.constancia)
                .sort(),
        );
    });
    it('keeps a chosen case with no proofs in the list, at 0', () => {
        expect(filterDetractions(data, { ...base, case: 'Sin XML' }).cases.at(-1)).toEqual({ name: 'Sin XML', count: 0 });
    });
});

describe('numbers', () => {
    it('computes the KPIs', () => {
        const k = detractionKpis(data.proofs, data.missing, data.since);
        expect(k).toMatchObject({ deposited: 590, count: 4, parties: 3, purchases: 290, sales: 300, atypical: 2, toCorrect: 1 });
        // Proof 3 is of 202512, before `since`: it does not count for the coverage.
        expect(k.covered).toEqual({ with: 3, of: 5, pct: 60 });
        expect(k.missing).toEqual({ count: 2, amount: 100, old: 1 });
        expect(k.onTime).toEqual({ count: 2, of: 3, pct: 67 });
        expect(k.topCases).toEqual([
            { name: 'Revisar monto', count: 1 },
            { name: 'Factura de', count: 1 },
        ]);
    });
    it('groups by month of payment, case, delay and counterpart', () => {
        expect(paymentMonths(data.proofs)).toEqual([
            { month: '202602', purchases: 200, sales: 300, count: 3, atypical: 1 },
            { month: '202603', purchases: 90, sales: 0, count: 1, atypical: 1 },
        ]);
        expect(byCase(data.proofs).map((c) => c.name)).toEqual(['Revisar monto', 'Factura de 2025', 'Normal']);
        expect(paymentDelay(data.proofs).map((b) => b.count)).toEqual([0, 2, 1, 0]);
        expect(topCounterparts(data.proofs)[0]).toMatchObject({ id: '20999', name: 'CLIENTE SA', amount: 300, pct: 51 });
        expect(latestFirst(data.proofs).map((p) => p.constancia)).toEqual(['2', '3', '1', '4']);
    });
});
