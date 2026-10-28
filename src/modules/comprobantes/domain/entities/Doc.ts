// A comprobante (invoice, receipt, note) as the app shows it: one per document, not per item.

export type Origin = 'compra' | 'venta' | 'otro';
/** F factura · B boleta · C nota de crédito · D nota de débito · O otro. */
export type DocKind = 'F' | 'B' | 'C' | 'D' | 'O';

export interface DetractionProof {
    constancia: string;
    paidOn: string;
    deposited: number | null;
    pdf: string;
    html: string;
    status: string;
}

export interface Doc {
    period: string;
    origin: Origin;
    ruc: string;
    name: string;
    kind: DocKind;
    currency: string;
    /** In its own currency; a credit note is negative (it subtracts). */
    total: number;
    detraction: number;
    oc: string;
    ocLegajo: string;
    ocPayment: string;
    ocFolder: string;
    costCenter: string;
    /** A local expense tied to an import PO (COMEX area, or an OC like 123-2026). */
    isImport: boolean;
    /** «F001-123», without the zeros on the left of the number. */
    number: string;
    issuedOn: string;
    pdf: string;
    xml: string;
    /** Everything in soles (null when there is no exchange rate); signed like `total`. */
    totalPen: number | null;
    taxBase: number | null;
    igv: number | null;
    untaxed: number | null;
    /** What is wrong with its detraction, empty when nothing. */
    detractionIssue: string;
    exchangeRate: number | null;
    detractionProof: DetractionProof | null;
    /** The vehicle plate(s) the invoice names, without the dash («ABC123 / D4E567»); '' when none. */
    plate: string;
    /** Some item is fuel (gallons, diesel, gasohol…): without a plate it does not support the expense. */
    fuel: boolean;
}

/** The documents of the book and when they were read. */
export interface DocsSnapshot {
    docs: Doc[];
    /** Detail lines (items) they came from. */
    lines: number;
    /** ISO instant they were read. */
    readAt: string;
}

export function kindOf(typeName: string): DocKind {
    if (/cr[eé]dito/i.test(typeName)) return 'C';
    if (/d[eé]bito/i.test(typeName)) return 'D';
    if (/boleta/i.test(typeName)) return 'B';
    if (/factura/i.test(typeName)) return 'F';
    return 'O';
}

/** The id of a Drive link (…/file/d/ID/…, …?id=ID), or '' if it is not one. */
export function driveId(url: string | null | undefined): string {
    const u = url ?? '';
    const m = /\/d\/([\w-]{20,})/.exec(u) || /[?&]id=([\w-]{20,})/.exec(u);
    return m ? m[1] : '';
}

/** The months with documents, oldest first (YYYYMM). */
export function monthsOf(docs: Doc[]): string[] {
    return [...new Set(docs.map((d) => d.period))].filter((p) => /^\d{6}$/.test(p)).sort();
}
