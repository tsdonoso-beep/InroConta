// What the INROCONTA view sends to the page (src/VistaEjecutiva.gs →
// datosCompactosVista_), run against the fixture DETALLE tab.
import { describe, expect, it } from 'vitest';
import { callFromPage, loadAppsScript } from '../../helpers/apps-script.mts';
import { DETAIL_ROWS, DETAIL_TAB, detailGrid } from '../../fixtures/detail-sheet.mts';
import type { CompactDoc, ViewData } from '../../fixtures/view-data.mts';

const VIEW = ['src/VistaEjecutiva.gs'];

// Positions inside each compact document row (see the comment of datosCompactosVista_).
const DOC = { period: 0, origin: 1, provider: 2, type: 3, currency: 4, net: 5, detraction: 6, oc: 7, imported: 9, number: 10, date: 11, pdf: 12 };
const DOC_SOLES = 14;
const DOC_RATE = 19;
const DOC_DEPOSIT = 20;

function viewData(grid = detailGrid()) {
    const scope = loadAppsScript(VIEW, { sheets: { [DETAIL_TAB]: grid } });
    return callFromPage<ViewData>(scope, 'datosCompactosVista_');
}

const byNumber = (docs: CompactDoc[], number: string) => docs.find((d) => d[DOC.number] === number)!;

describe('datosCompactosVista_', () => {
    it('sends one row per document, not per item line', () => {
        const data = viewData();
        expect(data.error).toBeNull();
        expect(data.lineas).toBe(DETAIL_ROWS.length);
        expect(data.docs.map((d) => d[DOC.number]).sort()).toEqual(['E001-45', 'F001-123', 'F001-880', 'F002-9', 'FC01-7']);
    });

    it('drops the leading zeros of the number and formats the issue date in Lima time', () => {
        const invoice = byNumber(viewData().docs, 'F001-123');
        expect(invoice[DOC.date]).toBe('14/08/2026');
        expect(invoice[DOC.pdf]).toBe('pdf000000000000000000001');
        expect(invoice[DOC.net]).toBe(1180);
        expect(invoice[DOC.type]).toBe('F');
    });

    it('makes a credit note subtract', () => {
        const note = byNumber(viewData().docs, 'FC01-7');
        expect(note[DOC.type]).toBe('C');
        expect(note[DOC.net]).toBe(-118);
        expect(note[DOC_SOLES]).toBe(-118);
    });

    it('keeps the soles amount, the exchange rate and the detraction deposit of a dollar invoice', () => {
        const data = viewData();
        const usd = byNumber(data.docs, 'E001-45');
        expect(data.dic.moneda[usd[DOC.currency] as number]).toBe('USD');
        expect(usd[DOC.detraction]).toBe(40);
        expect(usd[DOC_SOLES]).toBe(3750);
        expect(usd[DOC_RATE]).toBe(3.75);
        expect(usd[DOC_DEPOSIT]).toEqual(['123456789', '20/09/2026', 150, '', '', 'Con constancia']);
    });

    it('flags an order with a three-digit number as an import, and tells sales from purchases', () => {
        const docs = viewData().docs;
        expect(byNumber(docs, 'F002-9')[DOC.imported]).toBe(1);
        expect(byNumber(docs, 'F001-123')[DOC.imported]).toBe(0);
        expect(byNumber(docs, 'F001-880')[DOC.origin]).toBe(1);
        expect(byNumber(docs, 'F001-123')[DOC.origin]).toBe(0);
    });

    it('lists purchased products by spend, without sales or credit notes', () => {
        const data = viewData();
        const names = data.productos.map((p) => p[0]);
        expect(names).toEqual(['SERVICIO DE TRANSPORTE', 'TONER HP 85A', 'PAPEL BOND A4', 'AGENCIAMIENTO']);
        expect(data.totalProductos).toBe(4);
        const toner = data.productos.find((p) => p[0] === 'TONER HP 85A')!;
        // [period, unit price]: amount / quantity when both are there.
        expect(toner[6]).toEqual([['202608', 250]]);
    });

    it('fails with the name of a required column the tab does not have', () => {
        const grid = detailGrid(
            DETAIL_ROWS,
            Object.keys(DETAIL_ROWS[0]).filter((c) => c !== 'Moneda'),
        );
        const scope = loadAppsScript(VIEW, { sheets: { [DETAIL_TAB]: grid } });
        expect(callFromPage(scope, 'datosDeLaVistaEjecutiva')).toEqual({ error: 'La hoja no trae la columna "Moneda".' });
    });
});
