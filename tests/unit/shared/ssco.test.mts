// The SSCO list parser (src/shared/lib/sunat/ssco.ts), on rows shaped like SUNAT's file.
import { describe, expect, it } from 'vitest';
import { parseSsco } from '../../../src/shared/lib/sunat/ssco.ts';

const HEADER = [
    'RUC',
    'Razón social',
    'Domicilio fiscal',
    'Resolución de atribución como SSCO',
    'Fecha de emisión de la resolución de atribución',
    'Fecha en la que la resolución de atribución quedó firme',
    'RUC o documento de identidad del representante legal (1)',
    'Apellidos y nombres del representante legal',
    'Fecha de publicación (2)',
];
// 46260 = 2026-08-26 · 46275 = 2026-09-10 · 46295 = 2026-09-30 · 46264 = 2026-08-30
const ROW = [
    '10002179496',
    'RUIZ CRUZ  FIDEL',
    'CAL. TRUJILLO 310',
    'R.I. N.º 254-024-0001296/SUNAT',
    '46260',
    '46275',
    '10002179496',
    'RUIZ CRUZ FIDEL',
    '46295',
];

describe('parseSsco', () => {
    it('reads each column by its header, with dates as yyyy-mm-dd and spaces collapsed', () => {
        expect(parseSsco([HEADER, ROW])).toEqual({
            rows: [
                {
                    representativeDocument: '10002179496',
                    ruc: '10002179496',
                    businessName: 'RUIZ CRUZ FIDEL',
                    taxAddress: 'CAL. TRUJILLO 310',
                    resolution: 'R.I. N.º 254-024-0001296/SUNAT',
                    resolutionDate: '2026-08-26',
                    finalDate: '2026-09-10',
                    representativeName: 'RUIZ CRUZ FIDEL',
                    publishedOn: '2026-09-30',
                },
            ],
            skipped: [],
        });
    });

    it('does not mistake «RUC o documento del representante» for the RUC column, whatever the order', () => {
        const order = [6, 0, 1, 3, 8];
        const { rows } = parseSsco([order.map((i) => HEADER[i]), order.map((i) => ROW[i])]);
        expect(rows[0].ruc).toBe('10002179496');
        expect(rows[0].representativeDocument).toBe('10002179496');
        expect(rows[0].publishedOn).toBe('2026-09-30');
    });

    it('finds the header below title rows and ignores blank rows', () => {
        const { rows } = parseSsco([['Relación de sujetos sin capacidad operativa'], [], HEADER, ROW, ['', '']]);
        expect(rows.map((r) => r.ruc)).toEqual(['10002179496']);
    });

    it('keeps the latest publication of a repeated RUC and says so', () => {
        const older = [...ROW.slice(0, 8), '46264'];
        const { rows, skipped } = parseSsco([HEADER, older, ROW]);
        expect(rows).toHaveLength(1);
        expect(rows[0].publishedOn).toBe('2026-09-30');
        expect(skipped).toEqual(['line 3: RUC 10002179496 repeated (the latest publication is kept)']);
    });

    it('skips rows without a valid RUC, name or resolution, with their Excel line', () => {
        const { rows, skipped } = parseSsco([HEADER, ['1234', ...ROW.slice(1)], ['20512201611', '', '', 'R.I.'], ROW]);
        expect(rows).toHaveLength(1);
        expect(skipped).toEqual(['line 2: «1234» is not an 11-digit RUC', 'line 3: RUC 20512201611 without name or resolution']);
    });

    it('stops with the name of a required column that is missing', () => {
        expect(() => parseSsco([HEADER.filter((h) => !h.startsWith('Resolución')), ROW])).toThrow('«RESOLUCION DE ATRIBUCION…»');
        expect(() => parseSsco([['Nombre'], ['x']])).toThrow(/RUC/);
    });
});
