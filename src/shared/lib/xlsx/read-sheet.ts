// Reads the first sheet of an .xlsx file as a grid of cell texts, with no
// library: an .xlsx is a zip (opened with ../sunat/zip.ts) holding XML. Enough
// for the flat lists SUNAT publishes (one header row, then data); it does not
// evaluate formulas or styles. Numbers come back as their raw text, so a date
// arrives as its Excel serial number (see excelSerialToIso).
import { leerZip } from '../sunat/zip.ts';

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Decodes the five XML entities and numeric character references. */
export function decodeXml(text: string): string {
    return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
        e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : XML_ENTITIES[e.toLowerCase()],
    );
}

/** The text of every <t> inside a fragment (a shared string can be split in rich-text runs). */
function textOf(fragment: string): string {
    return [...fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('');
}

/** xl/sharedStrings.xml → the list of shared strings, by index. */
export function parseSharedStrings(xml: string): string[] {
    return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
}

/** «AB12» → 27 (0-based column index). */
export function columnIndex(ref: string): number {
    const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
    return [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
}

/** xl/worksheets/sheetN.xml → rows of cell texts ('' for empty cells), in sheet order. */
export function parseSheet(xml: string, shared: string[]): string[][] {
    const rows: string[][] = [];
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
        const cells: string[] = [];
        for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
            const attrs = cell[1];
            const body = cell[2] ?? '';
            const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
            const type = /\bt="(\w+)"/.exec(attrs)?.[1];
            const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
            const value = type === 's' ? (shared[Number(raw)] ?? '') : type === 'inlineStr' ? textOf(body) : raw === undefined ? '' : decodeXml(raw);
            const at = ref ? columnIndex(ref) : cells.length;
            while (cells.length < at) cells.push('');
            cells[at] = value;
        }
        rows.push(cells);
    }
    return rows;
}

/** An Excel date serial («46294») → «2026-09-30»; '' when it is not a number. */
export function excelSerialToIso(serial: string): string {
    const n = Number(serial);
    if (!serial.trim() || !Number.isFinite(n) || n <= 0) return '';
    // Day 25569 is 1970-01-01 (Excel counts from 1900 with its 29/02/1900 bug).
    return new Date(Math.round((n - 25569) * 86400) * 1000).toISOString().slice(0, 10);
}

/** The first sheet of an .xlsx file as rows of cell texts. */
export function readFirstSheet(file: Buffer): string[][] {
    const entries = new Map(leerZip(file).map((f) => [f.nombre, f.contenido.toString('utf8')]));
    const sheetName = [...entries.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
    if (!sheetName) throw new Error('The file has no worksheet: is it an .xlsx?');
    const shared = entries.has('xl/sharedStrings.xml') ? parseSharedStrings(entries.get('xl/sharedStrings.xml')!) : [];
    return parseSheet(entries.get(sheetName)!, shared);
}
