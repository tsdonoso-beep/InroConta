// Retenciones rules (src/modules/retenciones/domain/policies/retentions.ts): filter, KPIs without
// the reverted CRE, retained per month, what to review and the orders.
import { describe, expect, it } from 'vitest';
import type { Retention, RetentionDoc } from '../../../src/modules/retenciones/domain/entities/Retention.ts';
import {
    DEFAULT_RETENTION_FILTERS,
    filterRetentions,
    retainedByMonth,
    retentionKpis,
    retentionMonths,
    unreadInvoices,
    wrongRetentions,
    sortRetentions,
} from '../../../src/modules/retenciones/domain/policies/retentions.ts';

const doc = (p: Partial<RetentionDoc>): RetentionDoc => ({
    number: 'E001-1',
    issuedOn: '2026-09-01',
    total: 1000,
    currency: 'PEN',
    paidOn: '2026-09-10',
    paid: 970,
    retained: 30,
    found: true,
    detraction: null,
    invoicePdf: '',
    ...p,
});

const cre = (p: Partial<Retention>): Retention => ({
    cre: 'E001-100',
    issuedOn: '2026-09-10',
    period: '202609',
    supplierRuc: '20100000001',
    supplierName: 'Acme SAC',
    base: 1000,
    retained: 30,
    paid: 970,
    status: 'EMITIDO',
    revertedOn: '',
    revertReason: '',
    pdf: '',
    xml: '',
    docs: [doc({})],
    ...p,
});

const LIST = [
    cre({}),
    cre({ cre: 'E001-101', issuedOn: '2026-10-02', period: '202610', supplierRuc: '20100000002', supplierName: 'Beta EIRL', retained: 60, paid: 1940 }),
    cre({ cre: 'E001-102', issuedOn: '2026-10-05', period: '202610', status: 'REVERTIDO', retained: 90 }),
    cre({
        cre: 'E001-103',
        issuedOn: '2026-08-20',
        period: '202608',
        docs: [doc({ number: 'F001-9', detraction: 120 }), doc({ number: 'F001-10', found: false })],
    }),
];
const cres = (xs: Retention[]) => xs.map((r) => r.cre);

describe('filterRetentions', () => {
    it('keeps the issued ones by default', () => {
        expect(cres(filterRetentions(LIST, DEFAULT_RETENTION_FILTERS))).toEqual(['E001-100', 'E001-101', 'E001-103']);
    });

    it('filters by period of issue and by words in the supplier, the CRE or an invoice', () => {
        expect(cres(filterRetentions(LIST, { ...DEFAULT_RETENTION_FILTERS, period: 'm202610' }))).toEqual(['E001-101']);
        expect(cres(filterRetentions(LIST, { ...DEFAULT_RETENTION_FILTERS, text: 'beta' }))).toEqual(['E001-101']);
        expect(cres(filterRetentions(LIST, { ...DEFAULT_RETENTION_FILTERS, text: 'f001-9' }))).toEqual(['E001-103']);
        expect(cres(filterRetentions(LIST, { ...DEFAULT_RETENTION_FILTERS, status: 'REVERTIDO' }))).toEqual(['E001-102']);
    });
});

describe('retentionKpis and retainedByMonth', () => {
    it('leaves the reverted CRE out of what was retained, and counts them apart', () => {
        expect(retentionKpis(LIST)).toEqual({ retained: 120, issued: 3, suppliers: 2, paid: 3880, reverted: 1, wrong: 1, unread: 1 });
    });

    it('adds the retained amount per month of issue, oldest first', () => {
        expect(retainedByMonth(LIST)).toEqual([
            { month: '202608', retained: 30, count: 1 },
            { month: '202609', retained: 30, count: 1 },
            { month: '202610', retained: 60, count: 1 },
        ]);
        expect(retentionMonths(LIST).sort()).toEqual(['202608', '202609', '202610']);
    });
});

describe('wrongRetentions and unreadInvoices', () => {
    it('tells the error (a detraction too) from the invoice the base has not read yet', () => {
        expect(wrongRetentions(LIST).map((x) => x.doc.number)).toEqual(['F001-9']);
        expect(unreadInvoices(LIST).map((x) => x.doc.number)).toEqual(['F001-10']);
    });
});

describe('sortRetentions', () => {
    it('sorts by date, amount, supplier and number', () => {
        expect(cres(sortRetentions(LIST, 'issued-desc'))).toEqual(['E001-102', 'E001-101', 'E001-100', 'E001-103']);
        expect(cres(sortRetentions(LIST, 'retained-desc')).slice(0, 1)).toEqual(['E001-102']);
        expect(cres(sortRetentions(LIST, 'supplier'))[0]).not.toBe('E001-101');
        expect(cres(sortRetentions(LIST, 'cre'))).toEqual(['E001-100', 'E001-101', 'E001-102', 'E001-103']);
    });
});
