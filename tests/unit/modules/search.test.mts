// Buscar factura and Consulta RUC rules (src/modules/comprobantes/domain/policies/search.ts and
// src/modules/ruc/domain/policies.ts), against what buscarFacturas, nameMatches and
// paintSscoWarning of the Apps Script view did.
import { describe, expect, it } from 'vitest';
import type { Doc } from '../../../src/modules/comprobantes/domain/entities/Doc.ts';
import { docsOfRuc, partiesByLastDoc, searchDocs, splitNumber } from '../../../src/modules/comprobantes/domain/policies/search.ts';
import type { SscoEntry, TaxpayerCard } from '../../../src/modules/ruc/domain/entities/Taxpayer.ts';
import { isNaturalPerson, isOdd, placeOf, rucsByName, sscoHits } from '../../../src/modules/ruc/domain/policies.ts';

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
    doc({ number: 'F216-777773', ruc: '20101128777', name: 'DHL EXPRESS PERÚ', issuedOn: '05/09/2026', total: 43.64 }),
    doc({ number: 'F216-12', ruc: '20101128777', name: 'DHL EXPRESS PERÚ', issuedOn: '', period: '202610' }),
    doc({ number: 'E001-12', ruc: '20555555555', name: 'CÁMARA DE COMERCIO', issuedOn: '20/08/2026', total: -43.64, kind: 'C' }),
    doc({ number: 'B001-9', ruc: '10444444444', name: 'JUAN PEREZ', origin: 'venta', issuedOn: '01/10/2026' }),
];

describe('searchDocs (buscarFacturas)', () => {
    it('finds by series-number, ignoring zeros and case', () => {
        expect(searchDocs(DOCS, 'f216-0777773').found.map((d) => d.number)).toEqual(['F216-777773']);
        expect(searchDocs(DOCS, 'F216 777773').total).toBe(1);
    });
    it('finds by RUC and puts its card on top', () => {
        const r = searchDocs(DOCS, '20101128777');
        expect(r.total).toBe(2);
        expect(r.single).toEqual({ ruc: '20101128777', name: 'DHL EXPRESS PERÚ' });
        // No issue date: its month + '00' (202610 00) is newer than 05/09/2026.
        expect(r.found.map((d) => d.number)).toEqual(['F216-12', 'F216-777773']);
    });
    it('finds by the number alone, across series', () => {
        expect(
            searchDocs(DOCS, '0012')
                .found.map((d) => d.number)
                .sort(),
        ).toEqual(['E001-12', 'F216-12']);
    });
    it('finds by amount, credit notes too', () => {
        const r = searchDocs(DOCS, 'S/ 43.64');
        expect(r.total).toBe(2);
        expect(r.single).toBeNull();
    });
    it('finds by words without accents', () => {
        expect(searchDocs(DOCS, 'camara').found.map((d) => d.number)).toEqual(['E001-12']);
        expect(searchDocs(DOCS, 'dhl peru').total).toBe(2);
        expect(searchDocs(DOCS, 'nadie').total).toBe(0);
    });
    it('gives every document for an empty search and every match (the screen pages them)', () => {
        expect(searchDocs(DOCS, '  ').found.map((d) => d.number)).toEqual(['B001-9', 'F216-12', 'F216-777773', 'E001-12']);
        const many = Array.from({ length: 40 }, (_, i) => doc({ number: `F001-${i + 1}` }));
        const r = searchDocs(many, 'ACME');
        expect([r.total, r.found.length]).toEqual([40, 40]);
    });
    it('splits the number as the lines store keys it', () => {
        expect(splitNumber('F001-123')).toEqual({ series: 'F001', num: '123' });
        expect(splitNumber('E-001-7')).toEqual({ series: 'E-001', num: '7' });
    });
    it('lists every RUC once, the one we dealt with last first', () => {
        expect(partiesByLastDoc(DOCS).map((p) => [p.ruc, p.docs, p.lastOn])).toEqual([
            ['10444444444', 1, '01/10/2026'],
            ['20101128777', 2, ''],
            ['20555555555', 1, '20/08/2026'],
        ]);
    });
    it('lists the documents of a RUC, newest first', () => {
        expect(docsOfRuc(DOCS, '20101128777').map((d) => d.number)).toEqual(['F216-777773', 'F216-12']);
    });
});

const card = (p: Partial<TaxpayerCard>): TaxpayerCard => ({
    ruc: '20100000001',
    goodTaxpayer: false,
    withholdingAgent: false,
    perceptionAgent: false,
    state: 'ACTIVO',
    condition: 'HABIDO',
    address: '',
    district: 'LIMA',
    province: 'LIMA',
    department: 'LIMA',
    checkedOn: '',
    ...p,
});
const ssco = (ruc: string, finalDate: string): SscoEntry => ({
    ruc,
    name: 'FANTASMA SAC',
    resolution: 'R-1',
    resolutionDate: '2026-01-01',
    finalDate,
    publishedOn: '2026-02-01',
    representative: '',
});

describe('RUC rules', () => {
    it('place, odd state and natural person', () => {
        expect(placeOf(card({ district: 'MIRAFLORES' }))).toBe('MIRAFLORES, LIMA');
        expect(placeOf(null)).toBe('');
        expect([
            isOdd(card({})),
            isOdd(card({ condition: 'NO HALLADO' })),
            isOdd(card({ state: 'BAJA DE OFICIO' })),
            isOdd(card({ state: '', condition: '' })),
        ]).toEqual([false, true, true, false]);
        expect(['10444444444', '15444444444', '17444444444', '20444444444'].map(isNaturalPerson)).toEqual([true, true, true, false]);
    });
    it('searches names in our parties first, then the SSCO list, one per RUC', () => {
        const list = [ssco('20555555555', '2026-01-15'), ssco('20999999999', '2026-01-15')];
        const found = rucsByName('comercio', DOCS, list);
        expect(found).toEqual([{ ruc: '20555555555', name: 'CÁMARA DE COMERCIO', inSsco: false }]);
        expect(rucsByName('fantasma', DOCS, list).map((f) => [f.ruc, f.inSsco])).toEqual([
            ['20555555555', true],
            ['20999999999', true],
        ]);
        expect(
            rucsByName(
                'a',
                Array.from({ length: 30 }, (_, i) => ({ ruc: String(i), name: 'A' })),
                null,
            ),
        ).toHaveLength(15);
    });
    it('counts the received invoices from SSCO suppliers', () => {
        const list = new Map([['20101128777', ssco('20101128777', '2026-09-01')]]);
        const hits = sscoHits(DOCS, (r) => list.get(r));
        // The one without an issue date counts, but not as «after it became final».
        expect([hits.docs.length, hits.suppliers, hits.afterFinal]).toEqual([2, 1, 1]);
    });
});
