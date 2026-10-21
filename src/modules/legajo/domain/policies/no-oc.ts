// The SUNAT invoices that look like they lack an OC: the filters and the KPIs of the «Facturas sin
// OC» section. Port of pintarSinOc() in apps-script/inroconta/VistaEjecutivaPagina.html.
import { dateInPeriod, parsePeriod } from '../../../../shared/period.ts';
import type { NoOcInvoice } from '../entities/Folder.ts';

/** The old view's rough exchange rate: the KPIs add dollars as soles at this rate (it says so on screen). */
export const USD_TO_PEN = 3.75;

/** ALTA (the default), MEDIA, or '' = every signal. */
export type NoOcSignal = 'ALTA' | 'MEDIA' | '';
/** '' = every area, '-' = the area is still unknown, else the area as the base writes it. */
export type NoOcArea = '' | 'Compras nacionales' | 'COMEX (importaciones)' | '-';

export interface NoOcFilter {
    signal: NoOcSignal;
    area: NoOcArea;
    text: string;
    /** A period code (shared/period.ts) over the date of issue; '' = every date. */
    period: string;
}

export const NO_OC_DEFAULT: NoOcFilter = { signal: 'ALTA', area: '', text: '', period: '' };

/** Text without accents, in capitals (the old plano()). */
const plainText = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** True when every word of two letters or more of `query` is in `haystack` (accents and case aside). */
export function matchesAllWords(haystack: string, query: string): boolean {
    const terms = plainText(query)
        .split(/\s+/)
        .filter((w) => w.length > 1);
    if (!terms.length) return true;
    const t = plainText(haystack);
    return terms.every((w) => t.includes(w));
}

/** The invoices of the chosen area and period: what the KPIs count (they ignore the signal and the text). */
export function noOcOfArea(rows: NoOcInvoice[], area: NoOcArea, period = ''): NoOcInvoice[] {
    const p = parsePeriod(period);
    return rows.filter((x) => (area === '' || (area === '-' ? !x.likelyArea : x.likelyArea === area)) && dateInPeriod(p, x.issuedOn));
}

/** The months (YYYYMM) with invoices, for the period picker. */
export const noOcMonths = (rows: NoOcInvoice[]) => [
    ...new Set(rows.map((x) => x.issuedOn.slice(0, 4) + x.issuedOn.slice(5, 7)).filter((m) => /^\d{6}$/.test(m))),
];

/** The table: area, then signal, then the words in supplier, RUC, number, buyer or area. */
export function filterNoOc(rows: NoOcInvoice[], f: NoOcFilter): NoOcInvoice[] {
    return noOcOfArea(rows, f.area, f.period).filter(
        (x) => (!f.signal || x.signal === f.signal) && matchesAllWords([x.ruc, x.name, x.number, x.likelyBuyer, x.likelyArea].join(' '), f.text),
    );
}

/** «priority» is the order the rows come in (ALTA first, then the biggest in soles: SupabaseLegajoAdapter). */
export type NoOcSort = 'priority' | 'date-desc' | 'date-asc' | 'amount-desc' | 'supplier';

export function sortNoOc(rows: NoOcInvoice[], sort: NoOcSort): NoOcInvoice[] {
    if (sort === 'priority') return rows;
    const pen = (x: NoOcInvoice) => x.total * (x.currency === 'USD' ? USD_TO_PEN : 1);
    const by: Record<Exclude<NoOcSort, 'priority'>, (a: NoOcInvoice, b: NoOcInvoice) => number> = {
        'date-desc': (a, b) => b.issuedOn.localeCompare(a.issuedOn),
        'date-asc': (a, b) => a.issuedOn.localeCompare(b.issuedOn),
        'amount-desc': (a, b) => pen(b) - pen(a),
        supplier: (a, b) => a.name.localeCompare(b.name, 'es') || b.issuedOn.localeCompare(a.issuedOn),
    };
    return [...rows].sort(by[sort]);
}

/** The sum in soles, dollars at USD_TO_PEN (any other currency counts as soles, as in the old view). */
export const roughPen = (rows: NoOcInvoice[]) => rows.reduce((a, x) => a + x.total * (x.currency === 'USD' ? USD_TO_PEN : 1), 0);

export interface NoOcKpis {
    high: { count: number; pen: number };
    medium: { count: number; pen: number };
    suppliers: number;
}

export function noOcKpis(rows: NoOcInvoice[], area: NoOcArea, period = ''): NoOcKpis {
    const ofArea = noOcOfArea(rows, area, period);
    const high = ofArea.filter((x) => x.signal === 'ALTA');
    const medium = ofArea.filter((x) => x.signal === 'MEDIA');
    return {
        high: { count: high.length, pen: roughPen(high) },
        medium: { count: medium.length, pen: roughPen(medium) },
        suppliers: new Set(ofArea.map((x) => x.ruc)).size,
    };
}

/** «OC del proveedor»: the first four, «…» if there are more. */
export function supplierOcsShort(ocs: string): string {
    if (!ocs) return '';
    const all = ocs.split(', ');
    return all.slice(0, 4).join(', ') + (all.length > 4 ? '…' : '');
}
