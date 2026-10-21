// The documents list of Consulta RUC (src/modules/comprobantes/domain/policies/doc-list.ts):
// filters, order and sums.
import { describe, expect, it } from 'vitest';
import type { Doc } from '../../../src/modules/comprobantes/domain/entities/Doc.ts';
import { DOC_LIST_DEFAULT, filterDocs, isFiltered, issueMonths, listDocs, sumsByCurrency } from '../../../src/modules/comprobantes/domain/policies/doc-list.ts';

const doc = (p: Partial<Doc>): Doc => ({
    period: '202609',
    origin: 'compra',
    ruc: '20100000001',
    name: 'ACME SAC',
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
    issuedOn: '01/09/2026',
    pdf: '',
    xml: '',
    totalPen: 100,
    taxBase: null,
    igv: null,
    untaxed: null,
    detractionIssue: '',
    exchangeRate: 1,
    detractionProof: null,
    ...p,
});

const DOCS = [
    doc({ number: 'F001-2', issuedOn: '14/10/2026', total: 2 }),
    doc({ number: 'F001-10', issuedOn: '01/10/2026', total: 250, currency: 'USD' }),
    doc({ number: 'F001-3', issuedOn: '30/09/2026', total: 50 }),
    doc({ number: 'FC01-1', kind: 'C', issuedOn: '30/09/2026', total: -50 }),
    doc({ number: 'B001-7', kind: 'B', origin: 'venta', issuedOn: '05/08/2026', total: 4 }),
];
const numbers = (ds: Doc[]) => ds.map((d) => d.number);

describe('listDocs', () => {
    it('sorts newest first by default, the higher number first on the same day', () => {
        expect(numbers(listDocs(DOCS, DOC_LIST_DEFAULT))).toEqual(['F001-2', 'F001-10', 'FC01-1', 'F001-3', 'B001-7']);
    });

    it('sorts by amount without the sign and by number in natural order', () => {
        expect(numbers(listDocs(DOCS, { ...DOC_LIST_DEFAULT, sort: 'amount-desc' })).slice(0, 1)).toEqual(['F001-10']);
        expect(numbers(listDocs(DOCS, { ...DOC_LIST_DEFAULT, sort: 'number' }))).toEqual(['B001-7', 'F001-2', 'F001-3', 'F001-10', 'FC01-1']);
    });

    it('adds up per currency, PEN first and the credit note subtracting', () => {
        expect(sumsByCurrency(DOCS)).toEqual([
            { currency: 'PEN', amount: 6 },
            { currency: 'USD', amount: 250 },
        ]);
    });
});

describe('filterDocs', () => {
    it('filters by date of issue with any period code', () => {
        expect(numbers(filterDocs(DOCS, { ...DOC_LIST_DEFAULT, period: 'm202609' }))).toEqual(['F001-3', 'FC01-1']);
        expect(numbers(filterDocs(DOCS, { ...DOC_LIST_DEFAULT, period: 'r2026-09-30_2026-10-01' }))).toEqual(['F001-10', 'F001-3', 'FC01-1']);
    });

    it('filters by kind, origin, currency and amount bounds (sign aside)', () => {
        expect(numbers(filterDocs(DOCS, { ...DOC_LIST_DEFAULT, kind: 'C' }))).toEqual(['FC01-1']);
        expect(numbers(filterDocs(DOCS, { ...DOC_LIST_DEFAULT, origin: 'venta' }))).toEqual(['B001-7']);
        expect(numbers(filterDocs(DOCS, { ...DOC_LIST_DEFAULT, currency: 'USD' }))).toEqual(['F001-10']);
        expect(numbers(filterDocs(DOCS, { ...DOC_LIST_DEFAULT, min: 50, max: 50 }))).toEqual(['F001-3', 'FC01-1']);
    });

    it('knows when something is filtered, and the months of issue', () => {
        expect(isFiltered(DOC_LIST_DEFAULT)).toBe(false);
        expect(isFiltered({ ...DOC_LIST_DEFAULT, min: 0 })).toBe(true);
        expect(issueMonths(DOCS).sort()).toEqual(['202608', '202609', '202610']);
    });
});
