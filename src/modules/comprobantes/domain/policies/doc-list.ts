// A list of documents (Consulta RUC, Buscar factura) filtered by date of issue, kind, origin,
// currency and amount, and sorted. Pure and in memory: the documents are already in the browser
// (the docs store), so a filter answers at once; the screen draws one page (shared/ui/pager.tsx).
import { dateInPeriod, isoOf, parsePeriod } from '../../../../shared/period.ts';
import type { Doc, DocKind, Origin } from '../entities/Doc.ts';

export type DocSort = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc' | 'number';
/** with: names a vehicle plate · fuel: fuel, with or without · fuel-without: fuel that names none (it does not support the expense). */
export type PlateFilter = '' | 'with' | 'fuel' | 'fuel-without';

export interface DocListFilter {
    /** A period code (src/shared/period.ts), applied to the date of issue; '' = every date. */
    period: string;
    kind: DocKind | '';
    origin: Origin | '';
    currency: string;
    /** Bounds of the amount in its own currency, sign aside (a credit note of -50 is 50); null = open. */
    min: number | null;
    max: number | null;
    plate: PlateFilter;
    sort: DocSort;
}

export const DOC_LIST_DEFAULT: DocListFilter = { period: '', kind: '', origin: '', currency: '', min: null, max: null, plate: '', sort: 'date-desc' };

const byNumber = (a: Doc, b: Doc) => a.number.localeCompare(b.number, 'es', { numeric: true });

const COMPARE: Record<DocSort, (a: Doc, b: Doc) => number> = {
    'date-desc': (a, b) => isoOf(b.issuedOn).localeCompare(isoOf(a.issuedOn)) || byNumber(b, a),
    'date-asc': (a, b) => isoOf(a.issuedOn).localeCompare(isoOf(b.issuedOn)) || byNumber(a, b),
    'amount-desc': (a, b) => Math.abs(b.total) - Math.abs(a.total),
    'amount-asc': (a, b) => Math.abs(a.total) - Math.abs(b.total),
    number: byNumber,
};

/** Whether the filter narrows anything (the screen offers «Quitar filtros» then). */
export const isFiltered = (f: DocListFilter) => !!(f.period || f.kind || f.origin || f.currency || f.plate || f.min !== null || f.max !== null);

function plateOk(d: Doc, f: PlateFilter): boolean {
    switch (f) {
        case 'with':
            return !!d.plate;
        case 'fuel':
            return d.fuel;
        case 'fuel-without':
            return d.fuel && !d.plate;
        default:
            return true;
    }
}

export function filterDocs(docs: Doc[], f: DocListFilter): Doc[] {
    const p = parsePeriod(f.period);
    return docs.filter((d) => {
        const amount = Math.abs(d.total);
        return (
            (!f.kind || d.kind === f.kind) &&
            (!f.origin || d.origin === f.origin) &&
            (!f.currency || d.currency === f.currency) &&
            (f.min === null || amount >= f.min - 0.005) &&
            (f.max === null || amount <= f.max + 0.005) &&
            plateOk(d, f.plate) &&
            dateInPeriod(p, isoOf(d.issuedOn))
        );
    });
}

/** The documents that pass the filter, in its order. */
export const listDocs = (docs: Doc[], f: DocListFilter): Doc[] => filterDocs(docs, f).sort(COMPARE[f.sort]);

/** What the documents add up to, per currency (signed: a credit note subtracts), PEN first. */
export function sumsByCurrency(docs: Doc[]): { currency: string; amount: number }[] {
    const sums = new Map<string, number>();
    for (const d of docs) sums.set(d.currency, (sums.get(d.currency) ?? 0) + d.total);
    const order = currenciesOf(docs);
    return order.map((currency) => ({ currency, amount: sums.get(currency) ?? 0 }));
}

/** The months (YYYYMM) of the dates of issue, for the period picker. */
export const issueMonths = (docs: Doc[]) => [...new Set(docs.map((d) => isoOf(d.issuedOn).slice(0, 7).replace('-', '')).filter(Boolean))];

/** The currencies present, PEN first. */
export const currenciesOf = (docs: Doc[]) =>
    [...new Set(docs.map((d) => d.currency))].sort((a, b) => (a === 'PEN' ? -1 : b === 'PEN' ? 1 : a.localeCompare(b)));
