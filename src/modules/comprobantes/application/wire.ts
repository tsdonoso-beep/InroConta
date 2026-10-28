// The documents on the wire, from the server to the browser: one array per document and every
// repeated text (supplier names, periods, OCs, cost centers…) once, in a dictionary — the same
// idea as datosCompactosVista_ in the Apps Script view. 14 475 documents went from 7 MB as plain
// objects to what scripts/perf measures now. Pure: the route handler encodes, the browser decodes,
// and tests/unit/modules checks that decode(encode(x)) is x.
import type { DetractionProof, Doc, DocKind, DocsSnapshot, Origin } from '../domain/entities/Doc.ts';

type Cell = number | null;
export interface WireDocs {
    v: 1;
    lines: number;
    readAt: string;
    dict: string[];
    rows: Cell[][];
}

// The text fields, in the order they travel; the numbers and the proof go after them.
const TEXT = [
    'period',
    'origin',
    'ruc',
    'name',
    'kind',
    'currency',
    'oc',
    'ocLegajo',
    'ocPayment',
    'ocFolder',
    'costCenter',
    'number',
    'issuedOn',
    'pdf',
    'xml',
    'detractionIssue',
] as const;
const NUM = ['total', 'detraction', 'totalPen', 'taxBase', 'igv', 'untaxed', 'exchangeRate'] as const;
const PROOF_TEXT = ['constancia', 'paidOn', 'pdf', 'html', 'status'] as const;

export function encodeDocs(s: DocsSnapshot): WireDocs {
    const dict: string[] = [];
    const index = new Map<string, number>();
    const code = (t: string) => {
        let i = index.get(t);
        if (i === undefined) index.set(t, (i = dict.push(t) - 1));
        return i;
    };
    const rows = s.docs.map((d) => {
        const p = d.detractionProof;
        return [
            ...TEXT.map((k) => code(d[k])),
            ...NUM.map((k) => d[k]),
            d.isImport ? 1 : 0,
            p ? 1 : 0,
            ...(p ? [...PROOF_TEXT.map((k) => code(p[k])), p.deposited] : []),
            // Last, so a row of the version before still reads (without plate, not fuel).
            code(d.plate),
            d.fuel ? 1 : 0,
        ];
    });
    return { v: 1, lines: s.lines, readAt: s.readAt, dict, rows };
}

export function decodeDocs(w: WireDocs): DocsSnapshot {
    const t = (c: Cell) => (c == null ? '' : w.dict[c]);
    const docs = w.rows.map((r) => {
        let i = 0;
        const text = {} as Record<(typeof TEXT)[number], string>;
        for (const k of TEXT) text[k] = t(r[i++]);
        const num = {} as Record<(typeof NUM)[number], number | null>;
        for (const k of NUM) num[k] = r[i++];
        const isImport = r[i++] === 1;
        let detractionProof: DetractionProof | null = null;
        if (r[i++] === 1) {
            const p = {} as Record<(typeof PROOF_TEXT)[number], string>;
            for (const k of PROOF_TEXT) p[k] = t(r[i++]);
            detractionProof = { ...p, deposited: r[i++] };
        }
        const plate = t(r[i++] ?? null);
        const fuel = r[i] === 1;
        return {
            ...text,
            origin: text.origin as Origin,
            kind: text.kind as DocKind,
            total: num.total ?? 0,
            detraction: num.detraction ?? 0,
            totalPen: num.totalPen,
            taxBase: num.taxBase,
            igv: num.igv,
            untaxed: num.untaxed,
            exchangeRate: num.exchangeRate,
            isImport,
            detractionProof,
            plate,
            fuel,
        } satisfies Doc;
    });
    return { docs, lines: w.lines, readAt: w.readAt };
}
