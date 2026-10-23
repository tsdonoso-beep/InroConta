// The invoice ↔ OC links (src/shared/lib/oc/vinculos.ts) against the rules of the old base's
// vinculos_oc(): what was read inside first, the series in the name, a bare number only if unique.
import { describe, expect, it } from 'vitest';
import { sightings } from '../../../src/shared/lib/oc/entradas.ts';
import { alertsOf, linkInvoices, numbersInName, readSerie, type Invoice, type OrderFacts, type Sighting } from '../../../src/shared/lib/oc/vinculos.ts';

const inv = (o: Partial<Invoice>): Invoice => ({
    id: 'i1',
    ruc: '20100000001',
    tipo: '01',
    serie: 'F001',
    numero: '123',
    issuedOn: '2026-05-10',
    total: 100,
    currency: 'PEN',
    ...o,
});
const see = (o: Partial<Sighting>): Sighting => ({
    fileId: 'f1',
    origin: 'CARPETA',
    orderId: 'oc1',
    ocCode: '0200-2026',
    folderId: 'c1',
    name: 'factura.pdf',
    parece: 'FACTURA',
    serieInName: null,
    rucs: [],
    read: null,
    ...o,
});
const facts = (o: Partial<OrderFacts> = {}): OrderFacts => ({ isImport: false, cg: null, approvals: null, folderCcSource: null, ...o });

describe('readSerie and numbersInName', () => {
    it('reads an O in the series as a zero and refuses what is not a series', () => {
        expect(readSerie('F0O1-123')).toBe('F001-123');
        expect(readSerie('X001-1')).toBeNull();
    });
    it('takes 3 to 8 digit numbers of the name, without its extension and leading zeros', () => {
        expect(numbersInName('FACTURA 000123 OC 0200-2026.pdf')).toEqual(['123', '200', '2026']);
    });
});

describe('linkInvoices', () => {
    it('links by the series in the name when the RUC is known or the series is unique', () => {
        const links = linkInvoices([see({ serieInName: 'F001-00123' })], [inv({})], new Map([['oc1', facts()]]));
        expect(links).toHaveLength(1);
        expect(links[0]).toMatchObject({ invoiceId: 'i1', orderId: 'oc1', evidence: 'NOMBRE', fileId: 'f1' });
    });

    it('does not link a series two suppliers share unless the RUC says which', () => {
        const two = [inv({}), inv({ id: 'i2', ruc: '20100000002' })];
        expect(linkInvoices([see({ serieInName: 'F001-123' })], two, new Map())).toHaveLength(0);
        expect(linkInvoices([see({ serieInName: 'F001-123', rucs: ['20100000002'] })], two, new Map())[0].invoiceId).toBe('i2');
    });

    it('prefers what was read inside, then the approvals table over the folder walk', () => {
        const s = [see({ fileId: 'a', serieInName: 'F001-123' }), see({ fileId: 'b', origin: 'LEGAJO', read: { ruc: '20100000001', serie: 'F001-123' } })];
        const [l] = linkInvoices(s, [inv({})], new Map());
        expect(l).toMatchObject({ evidence: 'LECTURA', fileId: 'b', origin: 'LEGAJO' });
    });

    it('links a bare number only when it is the file’s one match, never the OC’s own number', () => {
        const s = see({ name: 'FACT 123 OC 0200.pdf', rucs: ['20100000001'] });
        expect(linkInvoices([s], [inv({}), inv({ id: 'i2', numero: '200' })], new Map())).toMatchObject([{ invoiceId: 'i1', evidence: 'NUMERO' }]);
        expect(linkInvoices([s], [inv({}), inv({ id: 'i2', serie: 'F002' })], new Map())).toHaveLength(0);
    });
});

describe('alertsOf', () => {
    it('says the OC is not in CG, and why it still has a cost centre', () => {
        expect(alertsOf(inv({}), facts(), 'CARPETA')).toEqual(['OC no está en la base de CG']);
        expect(alertsOf(inv({}), facts({ folderCcSource: 'PROYECTO' }), 'CARPETA')).toEqual([
            'OC no está en la base de CG (centro de costo por la carpeta del proyecto)',
        ]);
    });
    it('compares the invoice with CG and the approvals table', () => {
        const cg = { costCentres: 2, firstDate: '2026-06-01', amount: 50, currency: 'PEN', rucs: ['20100000009'] };
        const approvals = { rows: 1, hasCostCentre: false, paymentStatus: 'ANULADA', buyer: null, area: null };
        expect(alertsOf(inv({ total: 100 }), facts({ cg, approvals }), 'CARPETA')).toEqual([
            'la OC reparte en 2 centros de costo',
            'emisor distinto al proveedor de la OC',
            'factura anterior a la OC',
            'factura mayor que la OC',
            'la OC está anulada en el cuadro de aprobaciones',
        ]);
    });
});

describe('sightings', () => {
    it('gives the retired capture the procedencia of the folder it followed, not the national OC', () => {
        const orders = [
            { id: 'nac', procedencia: 'NACIONAL', numero: '74', anio: 2026, codigo: '0074-2026' },
            { id: 'imp', procedencia: 'IMPORTACION', numero: '74', anio: 2026, codigo: '074-2026' },
        ];
        const folders = [{ drive_id: 'cImp', orden_compra_id: 'imp', procedencia: 'IMPORTACION', visto_carpeta_en: null }];
        const capture = (url: string) => ({
            drive_id: 'f1',
            carpeta_id: null,
            nombre: 'FACTURA FLETE.pdf',
            visto_captura_en: '2026-09-29',
            origenes: [{ origen: 'CAPTURA', oc: '074-2026', carpeta_url: url, nombre: 'FACTURA FLETE.pdf' }],
        });
        expect(sightings([capture('https://drive.google.com/drive/folders/cImp')], folders, orders, []).map((s) => s.orderId)).toEqual(['imp']);
        expect(sightings([capture('https://drive.google.com/drive/folders/otra')], folders, orders, []).map((s) => s.orderId)).toEqual(['nac']);
    });
});
