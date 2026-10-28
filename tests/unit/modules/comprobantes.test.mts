// The web app's documents (src/modules/comprobantes): from the DETALLE tab to the numbers of
// the SUNAT screens, and the wire format.
import { describe, expect, it } from 'vitest';
import { detailGrid } from '../../fixtures/detail-sheet.mts';
import { monthsOf, type Doc } from '../../../src/modules/comprobantes/domain/entities/Doc.ts';
import { documentsFromLines } from '../../../src/modules/comprobantes/domain/policies/documents-from-lines.ts';
import type { FilaDetalleCpe } from '../../../src/shared/lib/export/items-sunat.ts';
import { ALL_IN_PEN, currencies, kindSlices, kpis, ofPeriod, periodMonths, scope } from '../../../src/modules/comprobantes/domain/policies/summary.ts';
import { decodeDocs, encodeDocs } from '../../../src/modules/comprobantes/application/wire.ts';
import { detailFromSheet, isoDate } from '../../../src/modules/comprobantes/infrastructure/detail-sheet.ts';

/** The grid as the Sheets API returns it (UNFORMATTED_VALUE, dates as dd/mm/yyyy). */
function asSheetsApi(grid: unknown[][]): unknown[][] {
    const lima = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
    return grid.map((row) => row.map((c) => (c instanceof Date ? lima(c) : c)));
}

const appDocs = () => documentsFromLines(detailFromSheet(asSheetsApi(detailGrid())));
const byNumber = (docs: Doc[], n: string) => docs.find((d) => d.number === n)!;

describe('documentsFromLines', () => {
    // Until 13/10/2026 this compared field by field with datosCompactosVista_ of the Apps Script
    // view; the view is gone, so the values it gave on this fixture are pinned here.
    it('gives one document per invoice, with the credit note subtracting', () => {
        const docs = appDocs();
        expect(docs.map((d) => d.number).sort()).toEqual([...new Set(docs.map((d) => d.number))].sort());
        const note = docs.find((d) => d.kind === 'C')!;
        expect(note.total).toBeLessThan(0);
        const f = byNumber(docs, 'F001-123');
        expect([f.period, f.origin, f.kind, f.total]).toEqual(['202608', 'compra', 'F', 1180]);
        expect(byNumber(docs, 'E001-45').totalPen).toBe(3750);
    });
});

describe('detailFromSheet', () => {
    it('reads dates as the sheet shows them and tells a missing column from an empty cell', () => {
        expect(isoDate('14/08/2026')).toBe('2026-08-14');
        expect(isoDate('2026-08-14')).toBe('2026-08-14');
        expect(isoDate('')).toBeNull();
        const [line] = detailFromSheet([
            ['Serie', 'Total del comprobante', 'Origen'],
            ['F001', 100, 'Recibido'],
        ]);
        expect(line).toMatchObject({ serie: 'F001', totalComprobante: 100, origen: 'RECIBIDO' });
        expect(line.fechaEmision).toBeUndefined();
    });

    it('refuses a tab without the columns it cannot do without', () => {
        expect(() => detailFromSheet([['Período'], ['202609']])).toThrow(/Serie/);
    });
});

describe('summary', () => {
    const docs = appDocs();
    const months = monthsOf(docs);

    it('filters by origin, currency and month, and nets the credit note', () => {
        const pen = scope(docs, { origin: 'compra', currency: 'PEN', period: '', text: '' });
        expect(pen.map((d) => d.number).sort()).toEqual(['F001-123', 'F002-9', 'FC01-7']);
        const k = kpis(pen, pen, months, '');
        expect(k.net).toBe(1180 - 118 + 590);
        expect(k.notes).toEqual({ total: -118, count: 1 });
        expect(ofPeriod(pen, 'm202608').map((d) => d.number)).toEqual(['F001-123']);
    });

    it('puts every currency in soles with its exchange rate', () => {
        const all = scope(docs, { origin: 'compra', currency: ALL_IN_PEN, period: '', text: '' });
        expect(byNumber(all, 'E001-45').total).toBe(3750);
        expect(currencies(docs)[0]).toBe('PEN');
    });

    it('compares a month with the previous one', () => {
        const pen = scope(docs, { origin: 'compra', currency: 'PEN', period: '', text: '' });
        const k = kpis(pen, ofPeriod(pen, 'm202609'), months, 'm202609');
        expect(k.change).toEqual({ pct: Math.round((100 * (472 - 1180)) / 1180), previous: 'ago 26' });
    });

    it('filters a quarter by SUNAT period and a range by date of issue', () => {
        const pen = scope(docs, { origin: 'compra', currency: 'PEN', period: '', text: '' });
        expect(ofPeriod(pen, 't2026-3').length).toBe(pen.filter((d) => ['202607', '202608', '202609'].includes(d.period)).length);
        const f = byNumber(pen, 'F001-123');
        const [d, m, y] = f.issuedOn.split('/');
        expect(ofPeriod(pen, `r${y}-${m}-${d}_${y}-${m}-${d}`).map((x) => x.number)).toContain('F001-123');
        expect(periodMonths('r2026-08-20_2026-10-02')).toEqual(['202608', '202609', '202610']);
    });

    it('finds by supplier, RUC or number, without accents or case', () => {
        const name = byNumber(docs, 'F001-123').name;
        const found = scope(docs, { origin: 'compra', currency: 'PEN', period: '', text: name.toLowerCase() });
        expect(found.every((d) => d.name === name)).toBe(true);
        expect(scope(docs, { origin: 'compra', currency: 'PEN', period: '', text: 'f001-123' }).map((d) => d.number)).toEqual(['F001-123']);
    });

    it('sizes the donut by amount without sign', () => {
        const pen = scope(docs, { origin: 'compra', currency: 'PEN', period: '', text: '' });
        expect(kindSlices(pen)).toEqual([
            { kind: 'F', count: 2, total: 1770 },
            { kind: 'C', count: 1, total: 118 },
        ]);
    });
});

describe('the wire format', () => {
    it('gives back exactly the documents it was given', () => {
        const snapshot = { docs: appDocs(), lines: 7, readAt: '2026-10-13T16:00:00.000Z' };
        expect(decodeDocs(JSON.parse(JSON.stringify(encodeDocs(snapshot))))).toEqual(snapshot);
    });

    it('sends each repeated text once', () => {
        const w = encodeDocs({ docs: appDocs(), lines: 7, readAt: '' });
        expect(w.dict.filter((t) => t === 'Toner Peru SAC')).toHaveLength(1);
    });
});

describe('documentsFromLines: plate and fuel', () => {
    const line = (p: Partial<FilaDetalleCpe>): FilaDetalleCpe =>
        ({ origen: 'RECIBIDO', proveedorRuc: '20100000001', tipoComprobante: '01', serie: 'F001', numero: '7', totalComprobante: 100, ...p }) as FilaDetalleCpe;
    it('takes the plate of the tab and calls it fuel when ANY of its lines is', () => {
        const [d] = documentsFromLines([
            line({ linea: 1, descripcion: 'LAVADO', placa: 'ABC123' }),
            line({ linea: 2, descripcion: 'DIESEL B5', unidad: 'GLL', placa: 'ABC123' }),
        ]);
        expect([d.plate, d.fuel]).toEqual(['ABC123', true]);
        const [other] = documentsFromLines([line({ numero: '8', descripcion: 'TONER' })]);
        expect([other.plate, other.fuel]).toEqual(['', false]);
    });
});
