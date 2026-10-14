// The purchase screens: the main suppliers of the period (Proveedores), the imports by PO and
// where the spend goes by cost centre (OC y centros de costo), and the «¿Cuánto pagamos por…?»
// finder (Precios). Ports of pintarTop(), pintarImpo(), pintarCentros(), pintarBuscador() and
// the product preparation in arrancar() of the Apps Script view (VistaEjecutivaPagina.html).
import { inPeriod, isoOf, parsePeriod } from '../../../../shared/period.ts';
import type { Doc } from '../entities/Doc.ts';
import type { Product } from './products.ts';
import { ALL_IN_PEN, type CurrencyFilter } from './summary.ts';

const plain = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

export interface TopParty {
    ruc: string;
    name: string;
    total: number;
}

/** The 8 biggest suppliers (or clients) of the documents shown, and what they all add up to. */
export function topParties(docs: Doc[], limit = 8): { rows: TopParty[]; total: number } {
    const g = new Map<string, TopParty>();
    let total = 0;
    for (const d of docs) {
        const r = g.get(d.ruc) ?? { ruc: d.ruc, name: d.name || d.ruc, total: 0 };
        r.total += d.total;
        total += d.total;
        g.set(d.ruc, r);
    }
    return { rows: [...g.values()].sort((a, b) => b.total - a.total).slice(0, limit), total };
}

export interface ImportPo {
    oc: string;
    legajo: string;
    /** The situation of the PO payment (ocPayment). */
    status: string;
    docs: number;
    /** Each currency in its own: currency → total. */
    byCurrency: Record<string, number>;
    suppliers: string[];
    /** What orders the list: the chosen currency, or everything in soles with «Todo en S/». */
    sortValue: number;
}

/**
 * The local expenses (freight, customs, courier…) tied to an import PO, one row per PO. Every
 * purchase of every currency counts (the amounts are shown per currency); only the period filters.
 * A document tied to several POs («A / B») counts in each.
 */
export function importsByPo(all: Doc[], period: string, currency: CurrencyFilter): ImportPo[] {
    const p = parsePeriod(period);
    const g = new Map<string, ImportPo & { names: Set<string> }>();
    for (const d of all) {
        if (d.origin !== 'compra' || !d.isImport || !d.oc || !inPeriod(p, d.period, isoOf(d.issuedOn))) continue;
        for (const raw of d.oc.split(' / ')) {
            const oc = raw.trim();
            if (!oc) continue;
            let o = g.get(oc);
            if (!o) g.set(oc, (o = { oc, legajo: d.ocLegajo, status: d.ocPayment, docs: 0, byCurrency: {}, suppliers: [], sortValue: 0, names: new Set() }));
            o.docs++;
            o.byCurrency[d.currency] = (o.byCurrency[d.currency] ?? 0) + d.total;
            o.names.add(d.name);
            if (currency === ALL_IN_PEN ? d.totalPen != null : d.currency === currency) o.sortValue += currency === ALL_IN_PEN ? (d.totalPen ?? 0) : d.total;
        }
    }
    return [...g.values()].map(({ names, ...o }) => ({ ...o, suppliers: [...names] })).sort((a, b) => b.sortValue - a.sortValue);
}

/** The tone of the legajo chip: complete, something missing, or anything else. */
export const legajoTone = (legajo: string): 'ok' | 'warn' | 'muted' => (/^Completo/.test(legajo) ? 'ok' : /^Falta/.test(legajo) ? 'warn' : 'muted');

/** The 9 cost centres with most spend, and how many documents already have one. */
export function costCenters(docs: Doc[], limit = 9): { rows: { name: string; total: number }[]; withCostCenter: number } {
    const g = new Map<string, number>();
    let withCostCenter = 0;
    for (const d of docs) {
        if (!d.costCenter) continue;
        withCostCenter++;
        g.set(d.costCenter, (g.get(d.costCenter) ?? 0) + d.total);
    }
    const rows = [...g.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
    return { rows: rows.slice(0, limit), withCostCenter };
}

// ── The price finder ──

export interface PricedProduct extends Product {
    /** plain() of description, supplier and RUC: what the words are looked for in. */
    text: string;
    /** % change from the first month to the last, one decimal; null with a single month. */
    change: number | null;
    /** The last month bought (YYYYMM). */
    last: string;
}

export function preparePrices(products: Product[]): PricedProduct[] {
    return products.map((p) => {
        const s = p.prices;
        const first = s.length ? s[0][1] : 0,
            end = s.length ? s[s.length - 1][1] : 0;
        return {
            ...p,
            text: plain(`${p.description} ${p.supplier} ${p.ruc}`),
            change: s.length > 1 && first > 0 ? Math.round((1000 * (end - first)) / first) / 10 : null,
            last: s.length ? s[s.length - 1][0] : '',
        };
    });
}

/** «todo»: everything bought · «repite»: bought in 2+ months. */
export type PriceMode = 'todo' | 'repite';
export type PriceOrder = 'gasto' | 'sube' | 'baja' | 'reciente';

/** The words of the search: 3+ letters each, without accents. */
export const priceWords = (q: string) =>
    plain(q)
        .split(/\s+/)
        .filter((w) => w.length > 2);

/** The products that have every word, in the mode and the order chosen. They come by spend. */
export function findPrices(products: PricedProduct[], query: string, mode: PriceMode, order: PriceOrder): PricedProduct[] {
    const ws = priceWords(query);
    let list = products.filter((p) => (mode !== 'repite' || p.prices.length >= 2) && ws.every((w) => p.text.includes(w)));
    if (order === 'sube' || order === 'baja') {
        list = list.filter((p) => p.change !== null);
        list.sort((a, b) => (order === 'sube' ? b.change! - a.change! : a.change! - b.change!));
    } else if (order === 'reciente') list.sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : b.spent - a.spent));
    return list;
}
