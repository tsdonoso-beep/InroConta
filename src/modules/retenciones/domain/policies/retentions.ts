// What the Retenciones screen computes from the CRE: the filter (period of issue, status, words),
// the KPIs, the retained amount per month, the two lists to look at and the orders of its tables.
// Pure: the browser runs it.
//
// The two lists are NOT the same kind of thing:
//   Retención indebida   an ERROR. The retention regime does not apply to an operation subject to
//                        the SPOT (R.S. 037-2002/SUNAT, art. 5): an invoice with a detraction must
//                        not have a CRE. Somebody has to correct it.
//   Factura por leer     NOT an error. The CRE names an invoice the base does not have yet (the
//                        SIRE or XML robot has not read it); it fills in by itself.
import { dateInPeriod, parsePeriod } from '../../../../shared/period.ts';
import type { Retention, RetentionDoc, RetentionStatus } from '../entities/Retention.ts';

export interface RetentionFilters {
    /** A period code (shared/period.ts) over the CRE's date of issue; '' = every date. */
    period: string;
    status: RetentionStatus | '';
    text: string;
}

export const DEFAULT_RETENTION_FILTERS: RetentionFilters = { period: '', status: 'EMITIDO', text: '' };

const plain = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** Every word of `text` in the CRE, the supplier (name or RUC) or one of its invoices. */
function matches(r: Retention, text: string): boolean {
    const words = plain(text).split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const hay = plain([r.cre, r.supplierRuc, r.supplierName, ...r.docs.map((d) => d.number)].join(' '));
    return words.every((w) => hay.includes(w));
}

export function filterRetentions(list: Retention[], f: RetentionFilters): Retention[] {
    const p = parsePeriod(f.period);
    return list.filter((r) => (!f.status || r.status === f.status) && dateInPeriod(p, r.issuedOn) && matches(r, f.text));
}

/** The months with a CRE (YYYYMM), for the period picker. */
export const retentionMonths = (list: Retention[]) => [...new Set(list.map((r) => r.issuedOn.slice(0, 7).replace('-', '')).filter(Boolean))];

const sum = (xs: (number | null)[]) => xs.reduce<number>((a, x) => a + (x ?? 0), 0);

export interface RetentionKpis {
    /** Only the issued ones: a reverted CRE is not declared. */
    retained: number;
    issued: number;
    suppliers: number;
    paid: number;
    reverted: number;
    /** Errors: issued CRE over an invoice with a detraction. */
    wrong: number;
    /** Not errors: invoices of issued CRE the base does not have yet. */
    unread: number;
}

/** `list` is the filtered one without the status filter (the reverted count needs them). */
export function retentionKpis(list: Retention[]): RetentionKpis {
    const issued = list.filter((r) => r.status === 'EMITIDO');
    return {
        retained: sum(issued.map((r) => r.retained)),
        issued: issued.length,
        suppliers: new Set(issued.map((r) => r.supplierRuc)).size,
        paid: sum(issued.map((r) => r.paid)),
        reverted: list.length - issued.length,
        wrong: wrongRetentions(issued).length,
        unread: unreadInvoices(issued).length,
    };
}

export interface RetentionMonth {
    /** YYYYMM. */
    month: string;
    retained: number;
    count: number;
}

/** The retained amount per month of issue, oldest first: what is declared each period. */
export function retainedByMonth(list: Retention[]): RetentionMonth[] {
    const g = new Map<string, RetentionMonth>();
    for (const r of list) {
        if (r.status !== 'EMITIDO' || !r.period) continue;
        const m = g.get(r.period) ?? { month: r.period, retained: 0, count: 0 };
        m.retained += r.retained ?? 0;
        m.count++;
        g.set(r.period, m);
    }
    return [...g.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** An invoice of an issued CRE, with the CRE. */
export interface RetentionItem {
    retention: Retention;
    doc: RetentionDoc;
}

const itemsOf = (list: Retention[], keep: (d: RetentionDoc) => boolean): RetentionItem[] =>
    list.filter((r) => r.status === 'EMITIDO').flatMap((r) => r.docs.filter(keep).map((doc) => ({ retention: r, doc })));

/** ERROR: an issued CRE over an invoice that declares a detraction (it gets one or the other). */
export const wrongRetentions = (list: Retention[]) => itemsOf(list, (d) => d.found && (d.detraction ?? 0) > 0);

/** NOT an error: an invoice of an issued CRE that the base does not have yet. */
export const unreadInvoices = (list: Retention[]) => itemsOf(list, (d) => !d.found);

export type RetentionSort = 'issued-desc' | 'issued-asc' | 'retained-desc' | 'supplier' | 'cre';

export function sortRetentions(list: Retention[], sort: RetentionSort): Retention[] {
    const by: Record<RetentionSort, (a: Retention, b: Retention) => number> = {
        'issued-desc': (a, b) => b.issuedOn.localeCompare(a.issuedOn) || b.cre.localeCompare(a.cre, 'es', { numeric: true }),
        'issued-asc': (a, b) => a.issuedOn.localeCompare(b.issuedOn) || a.cre.localeCompare(b.cre, 'es', { numeric: true }),
        'retained-desc': (a, b) => (b.retained ?? 0) - (a.retained ?? 0),
        supplier: (a, b) => a.supplierName.localeCompare(b.supplierName, 'es') || b.issuedOn.localeCompare(a.issuedOn),
        cre: (a, b) => a.cre.localeCompare(b.cre, 'es', { numeric: true }),
    };
    return [...list].sort(by[sort]);
}
