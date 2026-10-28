// Buscar factura and Consulta RUC rules (src/modules/comprobantes/domain/policies/search.ts and
// src/modules/ruc/domain/policies.ts), against what buscarFacturas, nameMatches and
// paintSscoWarning of the Apps Script view did.
import { describe, expect, it } from 'vitest';
import type { Doc } from '../../../src/modules/comprobantes/domain/entities/Doc.ts';
import { docsOfRuc, partiesByLastDoc, searchDocs, splitNumber } from '../../../src/modules/comprobantes/domain/policies/search.ts';
import type { SscoEntry, TaxpayerCard } from '../../../src/modules/ruc/domain/entities/Taxpayer.ts';
import { byWords, isNaturalPerson, isOdd, placeOf, sscoHits } from '../../../src/modules/ruc/domain/policies.ts';
import { docHasFlag, listParties, PARTY_FILTER_DEFAULT, sscoByName, type DocFlag, type PartyFilter } from '../../../src/modules/ruc/domain/parties.ts';

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
    plate: '',
    fuel: false,
    ...p,
});

const DOCS = [
    doc({ number: 'F216-777773', ruc: '20101128777', name: 'DHL EXPRESS PERÚ', issuedOn: '05/09/2026', total: 43.64 }),
    doc({ number: 'F216-12', ruc: '20101128777', name: 'DHL EXPRESS PERÚ', issuedOn: '', period: '202610' }),
    doc({ number: 'E001-12', ruc: '20555555555', name: 'CÁMARA DE COMERCIO', issuedOn: '20/08/2026', total: -43.64, kind: 'C' }),
    doc({ number: 'B001-9', ruc: '10444444444', name: 'JUAN PEREZ', origin: 'venta', issuedOn: '01/10/2026' }),
];

describe('searchDocs (buscarFacturas)', () => {
    it('finds by vehicle plate, with or without the dash, and falls back to the series when no plate matches', () => {
        const withPlates = [...DOCS, doc({ number: 'F777-1', name: 'GRIFO SAC', plate: 'ABC123 / D4E567', fuel: true })];
        expect(searchDocs(withPlates, 'abc-123').found.map((d) => d.number)).toEqual(['F777-1']);
        expect(searchDocs(withPlates, 'D4E567').total).toBe(1);
        expect(searchDocs(withPlates, 'grifo d4e567').total).toBe(1);
        expect(searchDocs(withPlates, 'F216-777773').found.map((d) => d.number)).toEqual(['F216-777773']);
    });
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
    it('keeps the first document, the roles and the sum in soles of every RUC', () => {
        const [juan, dhl] = partiesByLastDoc(DOCS);
        expect([dhl.firstOn, dhl.lastOn, dhl.purchases, dhl.sales, dhl.totalPen]).toEqual(['05/09/2026', '', 2, 0, 200]);
        expect([juan.purchases, juan.sales]).toEqual([0, 1]);
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
    it('matches every word in the RUC or the name, accents and case aside', () => {
        const m = byWords('camara  COMERCIO');
        expect([m('20555555555', 'CÁMARA DE COMERCIO'), m('20555555555', 'CÁMARA'), byWords('2055')('20555555555', ''), byWords('')('1', '')]).toEqual([
            true,
            false,
            true,
            true,
        ]);
    });
    it('counts the received invoices from SSCO suppliers', () => {
        const list = new Map([['20101128777', ssco('20101128777', '2026-09-01')]]);
        const hits = sscoHits(DOCS, (r) => list.get(r));
        // The one without an issue date counts, but not as «after it became final».
        expect([hits.docs.length, hits.suppliers, hits.afterFinal]).toEqual([2, 1, 1]);
    });
});

describe('listParties (the RUCs with us in Consulta RUC)', () => {
    const parties = partiesByLastDoc(DOCS);
    const cards = new Map([
        ['20101128777', card({ ruc: '20101128777', goodTaxpayer: true, withholdingAgent: true })],
        ['20555555555', card({ ruc: '20555555555', condition: 'NO HALLADO', perceptionAgent: true })],
    ]);
    const list = new Map([['20555555555', ssco('20555555555', '2026-01-15')]]);
    const at = { card: (r: string) => cards.get(r) ?? null, ssco: (r: string) => list.get(r) };
    const rucs = (f: Partial<PartyFilter>) => listParties(parties, { ...PARTY_FILTER_DEFAULT, ...f }, at).map((p) => p.ruc);

    it('keeps the order the screen had by default', () => {
        expect(rucs({})).toEqual(['10444444444', '20101128777', '20555555555']);
    });
    it('filters suppliers, customers, companies and people', () => {
        expect(rucs({ role: 'customer' })).toEqual(['10444444444']);
        expect(rucs({ role: 'supplier' })).toEqual(['20101128777', '20555555555']);
        expect(rucs({ type: 'person' })).toEqual(['10444444444']);
        expect(rucs({ type: 'company', role: 'customer' })).toEqual([]);
    });
    it('filters by what SUNAT says', () => {
        expect(rucs({ flag: 'good' })).toEqual(['20101128777']);
        expect(rucs({ flag: 'withholding' })).toEqual(['20101128777']);
        expect(rucs({ flag: 'perception' })).toEqual(['20555555555']);
        expect(rucs({ flag: 'odd' })).toEqual(['20555555555']);
        expect(rucs({ flag: 'ssco' })).toEqual(['20555555555']);
        expect(rucs({ flag: 'no-card' })).toEqual(['10444444444']);
    });
    it('sorts by the first and last document, the count, the amount and the name', () => {
        expect(rucs({ sort: 'last-asc' })).toEqual(['20555555555', '20101128777', '10444444444']);
        expect(rucs({ sort: 'first-asc' })).toEqual(['20555555555', '20101128777', '10444444444']);
        expect(rucs({ sort: 'first-desc' })).toEqual(['10444444444', '20101128777', '20555555555']);
        expect(rucs({ sort: 'docs-desc' })[0]).toBe('20101128777');
        expect(rucs({ sort: 'amount-desc' })).toEqual(['20101128777', '10444444444', '20555555555']);
        expect(rucs({ sort: 'name' })).toEqual(['20555555555', '20101128777', '10444444444']);
    });
    it('searches by words of the RUC or the name, with the filters on', () => {
        const q = (text: string, f: Partial<PartyFilter> = {}) => listParties(parties, { ...PARTY_FILTER_DEFAULT, ...f }, at, text).map((p) => p.ruc);
        expect(q('dhl peru')).toEqual(['20101128777']);
        expect(q('20')).toEqual(['20101128777', '20555555555']);
        expect(q('20', { flag: 'ssco' })).toEqual(['20555555555']);
        expect(q('nadie')).toEqual([]);
    });
    it('offers the SSCO subjects the search names that we never dealt with', () => {
        const country = [ssco('20555555555', '2026-01-15'), ssco('20999999999', '2026-01-15')];
        const withUs = (r: string) => parties.some((p) => p.ruc === r);
        expect(sscoByName('fantasma', country, withUs).map((s) => s.ruc)).toEqual(['20999999999']);
        expect(sscoByName('fantasma', null, withUs)).toEqual([]);
    });
});

describe('docHasFlag (the operations with SSCO or odd RUCs in Buscar factura)', () => {
    const cards = new Map([
        ['20101128777', card({ ruc: '20101128777' })],
        ['20555555555', card({ ruc: '20555555555', condition: 'NO HALLADO' })],
    ]);
    const list = new Map([['20666666666', ssco('20666666666', '2026-09-15')]]);
    const at = { card: (r: string) => cards.get(r) ?? null, ssco: (r: string) => list.get(r) };
    const ops = [
        { ruc: '20101128777', issuedOn: '01/10/2026' },
        { ruc: '20555555555', issuedOn: '01/10/2026' },
        { ruc: '20666666666', issuedOn: '14/09/2026' },
        { ruc: '20666666666', issuedOn: '15/09/2026' },
        { ruc: '20666666666', issuedOn: '' },
    ];
    const hits = (flag: DocFlag) => ops.map((d) => docHasFlag(flag, d, at));

    it('lets everything through without a flag', () => {
        expect(hits('')).toEqual([true, true, true, true, true]);
    });
    it('keeps the SSCO ones, and from the day their attribution became final', () => {
        expect(hits('ssco')).toEqual([false, false, true, true, true]);
        expect(hits('ssco-final')).toEqual([false, false, false, true, false]);
    });
    it('keeps the not active or not found ones, and both together', () => {
        expect(hits('odd')).toEqual([false, true, false, false, false]);
        expect(hits('observed')).toEqual([false, true, true, true, true]);
    });
});
