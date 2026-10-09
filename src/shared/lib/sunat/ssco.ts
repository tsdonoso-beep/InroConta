// The SUNAT list of «sujetos sin capacidad operativa» (SSCO), from the rows of
// the Excel file SUNAT publishes (one header row, then one row per RUC).
//
// Columns are found by their header, not by position, so a reordered or
// widened file still loads; a missing required column stops the load with its
// name. The rows end in the «SSCO» tab of the INROCONTA book (scripts/load-ssco.mts).
import { excelSerialToIso } from '../xlsx/read-sheet.ts';

export interface SscoRow {
    ruc: string;
    businessName: string;
    taxAddress: string;
    resolution: string;
    resolutionDate: string; // yyyy-mm-dd or ''
    finalDate: string;
    representativeDocument: string;
    representativeName: string;
    publishedOn: string;
}

/** Uppercase, no accents, single spaces: how headers are compared. */
const plain = (s: string) =>
    s
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();

// Field → how its header starts in SUNAT's file. Order matters: «RUC O DOCUMENTO…»
// also starts with «RUC», so the representative is matched before the RUC.
const HEADERS: [keyof SscoRow, string, boolean][] = [
    ['representativeDocument', 'RUC O DOCUMENTO', false],
    ['ruc', 'RUC', true],
    ['businessName', 'RAZON SOCIAL', true],
    ['taxAddress', 'DOMICILIO FISCAL', false],
    ['resolution', 'RESOLUCION DE ATRIBUCION', true],
    ['resolutionDate', 'FECHA DE EMISION', false],
    ['finalDate', 'FECHA EN LA QUE', false],
    ['representativeName', 'APELLIDOS Y NOMBRES', false],
    ['publishedOn', 'FECHA DE PUBLICACION', false],
];
const DATES = new Set<keyof SscoRow>(['resolutionDate', 'finalDate', 'publishedOn']);

/** The tab of the INROCONTA book that holds the list (read by VistaEjecutiva.gs → sscoVista_). */
export const SSCO_TAB = 'SSCO';

/** The tab's header; the view reads the columns by these names. */
export const SSCO_TAB_HEADER = [
    'RUC',
    'Razón social',
    'Resolución de atribución',
    'Fecha de la resolución',
    'Fecha en que quedó firme',
    'Fecha de publicación',
    'Representante legal',
    'Domicilio fiscal',
];

/** The rows written to the tab: the header, then one row per RUC (dates as yyyy-mm-dd). */
export function sscoTabRows(rows: SscoRow[]): string[][] {
    return [
        SSCO_TAB_HEADER,
        ...rows.map((r) => [r.ruc, r.businessName, r.resolution, r.resolutionDate, r.finalDate, r.publishedOn, r.representativeName, r.taxAddress]),
    ];
}

export interface ParsedSsco {
    rows: SscoRow[];
    /** Rows that were skipped, with the reason (line numbers as in Excel). */
    skipped: string[];
}

/** Turns the sheet rows (first one = headers) into SSCO rows, one per RUC. */
export function parseSsco(sheet: string[][]): ParsedSsco {
    const headerRow = sheet.findIndex((r) => r.some((c) => plain(c) === 'RUC'));
    if (headerRow < 0) throw new Error('No header row with a «RUC» column: is this the SSCO list?');
    const headers = sheet[headerRow].map(plain);

    const columns = new Map<keyof SscoRow, number>();
    for (const [field, start, required] of HEADERS) {
        const i = headers.findIndex((h, j) => h.startsWith(start) && ![...columns.values()].includes(j));
        if (i >= 0) columns.set(field, i);
        else if (required) throw new Error(`The file has no «${start}…» column.`);
    }

    const byRuc = new Map<string, SscoRow>();
    const skipped: string[] = [];
    sheet.slice(headerRow + 1).forEach((cells, k) => {
        const line = headerRow + k + 2;
        if (cells.every((c) => !c.trim())) return;
        const row = {} as SscoRow;
        for (const [field] of HEADERS) {
            const i = columns.get(field);
            const value = i === undefined ? '' : (cells[i] ?? '').replace(/\s+/g, ' ').trim();
            row[field] = DATES.has(field) ? excelSerialToIso(value) : value;
        }
        if (!/^\d{11}$/.test(row.ruc)) return void skipped.push(`line ${line}: «${row.ruc}» is not an 11-digit RUC`);
        if (!row.businessName || !row.resolution) return void skipped.push(`line ${line}: RUC ${row.ruc} without name or resolution`);
        const seen = byRuc.get(row.ruc);
        // The same RUC twice: the one SUNAT published last wins.
        if (!seen || row.publishedOn > seen.publishedOn) byRuc.set(row.ruc, row);
        if (seen) skipped.push(`line ${line}: RUC ${row.ruc} repeated (the latest publication is kept)`);
    });
    return { rows: [...byRuc.values()], skipped };
}
