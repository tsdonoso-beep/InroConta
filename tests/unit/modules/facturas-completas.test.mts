// From the DETALLE tab to the invoices of Buscar factura / Resumen: no invoice may be lost or
// doubled on the way. Contabilidad saw invoices missing in the old Apps Script view (19/10/2026);
// the cause was not here (see tests/data/facturas.test.mts), and these keep it that way.
import { describe, expect, it } from 'vitest';
import { documentsFromLines } from '../../../src/modules/comprobantes/domain/policies/documents-from-lines.ts';
import { detailFromSheet } from '../../../src/modules/comprobantes/infrastructure/detail-sheet.ts';

const HEAD = [
    'Período',
    'Origen',
    'RUC proveedor',
    'Proveedor',
    'Tipo',
    'Serie',
    'Número',
    'Fecha de emisión',
    'Moneda',
    'Línea',
    'Descripción',
    'Importe',
    'Total del comprobante',
];

type Inv = { ruc: string; serie: string; numero: string; origen?: string; tipo?: string; lines?: number; total?: number };

/** The tab as the Sheets API gives it: a header and one row per item line. */
function tab(invoices: Inv[], interleave = false): unknown[][] {
    const rows = invoices.flatMap((f) =>
        Array.from({ length: f.lines ?? 1 }, (_, i) => [
            '202608',
            f.origen ?? 'Recibido',
            f.ruc,
            `PROVEEDOR ${f.ruc}`,
            f.tipo ?? 'Factura',
            f.serie,
            f.numero,
            '14/08/2026',
            'PEN',
            i + 1,
            `ITEM ${i + 1}`,
            100,
            f.total ?? 118,
        ]),
    );
    if (interleave) rows.sort((a, z) => Number(a[9]) - Number(z[9])); // line 1 of all, then line 2 of all…
    return [HEAD, ...rows];
}

const docs = (grid: unknown[][]) => documentsFromLines(detailFromSheet(grid));

describe('every invoice of the tab reaches the app', () => {
    it('3 000 invoices with 1 to 4 lines each give 3 000 documents', () => {
        const invoices = Array.from({ length: 3000 }, (_, i) => ({
            ruc: `20${String(100000000 + (i % 250)).padStart(9, '0')}`,
            serie: 'F001',
            numero: String(i + 1),
            lines: (i % 4) + 1,
        }));
        const out = docs(tab(invoices));
        expect(out).toHaveLength(3000);
        expect(new Set(out.map((d) => `${d.ruc}|${d.number}`)).size).toBe(3000);
    });

    it('lines of one invoice that are not together still make one document', () => {
        const invoices = Array.from({ length: 50 }, (_, i) => ({ ruc: '20100000001', serie: 'F001', numero: String(i + 1), lines: 3 }));
        expect(docs(tab(invoices, true))).toHaveLength(50);
    });

    it('the same series and number from two suppliers are two documents', () => {
        const out = docs(
            tab([
                { ruc: '20100000001', serie: 'E001', numero: '45' },
                { ruc: '20100000002', serie: 'E001', numero: '45' },
            ]),
        );
        expect(out.map((d) => d.ruc).sort()).toEqual(['20100000001', '20100000002']);
    });

    it('a purchase and a sale with the same number are two documents', () => {
        const out = docs(
            tab([
                { ruc: '20512201611', serie: 'E001', numero: '9', origen: 'Recibido' },
                { ruc: '20512201611', serie: 'E001', numero: '9', origen: 'Emitido' },
            ]),
        );
        expect(out.map((d) => d.origin).sort()).toEqual(['compra', 'venta']);
    });

    it('an invoice and its credit note with the same number are two documents', () => {
        const out = docs(
            tab([
                { ruc: '20100000001', serie: 'F001', numero: '7' },
                { ruc: '20100000001', serie: 'F001', numero: '7', tipo: 'Nota de crédito' },
            ]),
        );
        expect(out).toHaveLength(2);
        expect(out.find((d) => d.kind === 'C')!.total).toBeLessThan(0);
    });

    it('a number written with and without leading zeros is the same invoice', () => {
        const out = docs(
            tab([
                { ruc: '20100000001', serie: 'F001', numero: '00000123', lines: 2 },
                { ruc: '20100000001', serie: 'F001', numero: '123' },
            ]),
        );
        expect(out.map((d) => d.number)).toEqual(['F001-123']);
    });

    it('a line with a series but no RUC is kept; a fully blank row is not an invoice', () => {
        const grid = tab([{ ruc: '', serie: 'F001', numero: '1' }]);
        grid.push(Array(HEAD.length).fill(''));
        expect(docs(grid)).toHaveLength(1);
    });

    it('reads the columns by their header, in any order', () => {
        const grid = tab([{ ruc: '20100000001', serie: 'F001', numero: '5' }]);
        const order = HEAD.map((_, i) => i).reverse();
        const shuffled = grid.map((row) => order.map((i) => row[i]));
        expect(docs(shuffled).map((d) => d.number)).toEqual(['F001-5']);
    });
});
