// The numbers of the SUNAT screens, from the documents and the filters. The port of pintar(),
// pintarKpis(), kpiIgv(), pintarMeses(), pintarDona() and pintarCalor() of the Apps Script
// view (VistaEjecutivaPagina.html), minus the HTML: the React components draw these.
import { inPeriod, isoOf, monthsTouched, parsePeriod, periodLabel, previousPeriod } from '../../../../shared/period.ts';
import type { Doc, DocKind, Origin } from '../entities/Doc.ts';

/** A currency code, or 'ALL' for every currency in soles (each with its exchange rate). */
export type CurrencyFilter = string;
export const ALL_IN_PEN = 'ALL';

export interface Filters {
    origin: Origin;
    currency: CurrencyFilter;
    /** A period code (shared/period.ts: m202609, t2026-3, r…), or '' for everything. */
    period: string;
    /** Words to find in the supplier (or client), RUC, number, OC or cost center. */
    text: string;
}

const plain = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const searchText = new WeakMap<Doc, string>();
const textOf = (d: Doc) => {
    let t = searchText.get(d);
    if (t === undefined) searchText.set(d, (t = plain([d.name, d.ruc, d.number, d.oc, d.costCenter].join(' '))));
    return t;
};

const sum = (docs: Doc[], pick: (d: Doc) => number | null) => docs.reduce((a, d) => a + (pick(d) ?? 0), 0);

/** «Todo en S/»: the amounts in soles, with base, IGV and untaxed by its exchange rate. */
function inPen(d: Doc): Doc | null {
    if (d.totalPen == null) return null;
    const rate = d.exchangeRate || 1;
    const conv = (n: number | null) => (n == null ? null : Math.round(n * rate * 100) / 100);
    return { ...d, total: d.totalPen, taxBase: conv(d.taxBase), igv: conv(d.igv), untaxed: conv(d.untaxed) };
}

/** The documents of the origin, currency and search, every month. */
export function scope(docs: Doc[], f: Filters): Doc[] {
    const words = plain(f.text ?? '')
        .split(/\s+/)
        .filter((w) => w.length >= 2);
    const ofOrigin = docs.filter((d) => d.origin === f.origin && (!words.length || words.every((w) => textOf(d).includes(w))));
    if (f.currency === ALL_IN_PEN) return ofOrigin.map(inPen).filter((d): d is Doc => d !== null);
    return ofOrigin.filter((d) => d.currency === f.currency);
}

/** The documents of a period (month-shaped by SUNAT period, a day or a range by date of issue). */
export function ofPeriod(docs: Doc[], code: string): Doc[] {
    const p = parsePeriod(code);
    return p ? docs.filter((d) => inPeriod(p, d.period, isoOf(d.issuedOn))) : docs;
}

/** The months (YYYYMM) a period touches, to light them in the charts; [] = everything. */
export const periodMonths = (code: string): string[] => monthsTouched(parsePeriod(code));

/** The currencies present, the most used first: the default filter is the first one. */
export function currencies(docs: Doc[]): string[] {
    const n = new Map<string, number>();
    for (const d of docs) n.set(d.currency, (n.get(d.currency) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

export interface Kpis {
    net: number;
    count: number;
    /** One value per month of `months`, for the sparkline. */
    perMonth: number[];
    /** % against the previous period of the same length, when there is one with data. */
    change: { pct: number; previous: string } | null;
    parties: number;
    notes: { total: number; count: number };
    detraction: { total: number; count: number; toReview: number; withProof: number; missingProof: number };
    igv: { igv: number; base: number; untaxed: number; rate: number; withoutBreakdown: number } | null;
    withOc: number;
    withCostCenter: number;
    imports: number;
}

export function kpis(all: Doc[], docs: Doc[], months: string[], period: string): Kpis {
    const perMonth = months.map((m) =>
        sum(
            all.filter((d) => d.period === m),
            (d) => d.total,
        ),
    );
    let change: Kpis['change'] = null;
    const before = previousPeriod(parsePeriod(period));
    if (before) {
        const was = sum(ofPeriod(all, before.code), (d) => d.total);
        const now = sum(docs, (d) => d.total);
        if (was) change = { pct: Math.round((100 * (now - was)) / Math.abs(was)), previous: periodLabel(before) };
    }

    const notes = docs.filter((d) => d.kind === 'C');
    const det = docs.filter((d) => d.detraction > 0);
    const withBreakdown = docs.filter((d) => d.igv != null);
    const igv = sum(withBreakdown, (d) => d.igv);
    const base = sum(withBreakdown, (d) => d.taxBase);
    return {
        net: sum(docs, (d) => d.total),
        count: docs.length,
        perMonth,
        change,
        parties: new Set(docs.map((d) => d.ruc)).size,
        notes: { total: sum(notes, (d) => d.total), count: notes.length },
        detraction: {
            total: sum(det, (d) => d.detraction),
            count: det.length,
            toReview: docs.filter((d) => d.detractionIssue).length,
            withProof: det.filter((d) => d.detractionProof?.constancia).length,
            missingProof: det.filter((d) => d.detractionProof?.status === 'Falta constancia').length,
        },
        igv: withBreakdown.length
            ? {
                  igv,
                  base,
                  untaxed: sum(withBreakdown, (d) => d.untaxed),
                  rate: base ? Math.round((1000 * igv) / base) / 10 : 0,
                  withoutBreakdown: docs.length - withBreakdown.length,
              }
            : null,
        withOc: docs.filter((d) => d.oc).length,
        withCostCenter: docs.filter((d) => d.costCenter).length,
        imports: sum(
            docs.filter((d) => d.isImport),
            (d) => d.total,
        ),
    };
}

export interface MonthBar {
    month: string;
    total: number;
    count: number;
}
export const monthBars = (all: Doc[], months: string[]): MonthBar[] =>
    months.map((m) => {
        const l = all.filter((d) => d.period === m);
        return { month: m, total: sum(l, (d) => d.total), count: l.length };
    });

export interface KindSlice {
    kind: DocKind;
    count: number;
    /** Without sign: a credit note counts by its size. */
    total: number;
}
export function kindSlices(docs: Doc[]): KindSlice[] {
    const g = new Map<DocKind, KindSlice>();
    for (const d of docs) {
        const s = g.get(d.kind) ?? { kind: d.kind, count: 0, total: 0 };
        s.count++;
        s.total += Math.abs(d.total);
        g.set(d.kind, s);
    }
    return [...g.values()].sort((a, b) => b.total - a.total);
}

export interface HeatRow {
    ruc: string;
    name: string;
    total: number;
    byMonth: Record<string, number>;
}
/** The 12 biggest suppliers (or clients) of the last 6 months, month by month. */
export function heatMap(all: Doc[], months: string[]): { months: string[]; rows: HeatRow[] } {
    const last = months.slice(-6);
    const rows = new Map<string, HeatRow>();
    for (const d of all) {
        if (!last.includes(d.period)) continue;
        const r = rows.get(d.ruc) ?? { ruc: d.ruc, name: d.name || d.ruc, total: 0, byMonth: {} };
        r.total += d.total;
        r.byMonth[d.period] = (r.byMonth[d.period] ?? 0) + d.total;
        rows.set(d.ruc, r);
    }
    return { months: last, rows: [...rows.values()].sort((a, b) => b.total - a.total).slice(0, 12) };
}
