// The list of every RUC with us in Consulta RUC, searched by RUC or name, filtered and sorted:
// suppliers or customers, companies or people, what SUNAT says of it (good taxpayer, agents,
// state, SSCO) and the order (the last or the first document with us, how many, how much, the name).
import type { SscoEntry, TaxpayerCard } from './entities/Taxpayer.ts';
import { byWords, isNaturalPerson, isOdd } from './policies.ts';

/** What the list needs of a RUC with us (comprobantes' Party). */
export interface PartyLike {
    ruc: string;
    name: string;
    /** dateKey (yyyymmdd) of its newest and oldest documents. */
    lastKey: string;
    firstKey: string;
    docs: number;
    purchases: number;
    sales: number;
    totalPen: number;
}

export type PartyRole = '' | 'supplier' | 'customer';
export type PartyType = '' | 'company' | 'person';
export type PartyFlag = '' | 'good' | 'withholding' | 'perception' | 'odd' | 'ssco' | 'no-card';
export type PartySort = 'last-desc' | 'last-asc' | 'first-asc' | 'first-desc' | 'docs-desc' | 'amount-desc' | 'name';

export interface PartyFilter {
    role: PartyRole;
    type: PartyType;
    flag: PartyFlag;
    sort: PartySort;
}

/** The order the screen always had: the one we dealt with last, first. */
export const PARTY_FILTER_DEFAULT: PartyFilter = { role: '', type: '', flag: '', sort: 'last-desc' };

export const isPartyFiltered = (f: PartyFilter) => !!(f.role || f.type || f.flag);

/** The flags read SUNAT's cards and the SSCO list: without them they cannot answer yet. */
export const flagNeedsLists = (f: PartyFilter) => !!f.flag;

export interface PartyLookup {
    card: (ruc: string) => TaxpayerCard | null;
    ssco: (ruc: string) => SscoEntry | null | undefined;
}

function hasFlag(flag: PartyFlag, ruc: string, at: PartyLookup): boolean {
    const card = at.card(ruc);
    switch (flag) {
        case 'good':
            return !!card?.goodTaxpayer;
        case 'withholding':
            return !!card?.withholdingAgent;
        case 'perception':
            return !!card?.perceptionAgent;
        case 'odd':
            return !!card && isOdd(card);
        case 'ssco':
            return !!at.ssco(ruc);
        case 'no-card':
            return !card;
        default:
            return true;
    }
}

const byText = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' });
const desc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

const ORDER: Record<PartySort, (a: PartyLike, b: PartyLike) => number> = {
    'last-desc': (a, b) => desc(a.lastKey, b.lastKey),
    'last-asc': (a, b) => desc(b.lastKey, a.lastKey),
    'first-asc': (a, b) => desc(b.firstKey, a.firstKey),
    'first-desc': (a, b) => desc(a.firstKey, b.firstKey),
    'docs-desc': (a, b) => b.docs - a.docs || desc(a.lastKey, b.lastKey),
    'amount-desc': (a, b) => b.totalPen - a.totalPen,
    name: (a, b) => byText(a.name || a.ruc, b.name || b.ruc),
};

/** The RUCs that pass, in the chosen order (a new array: `parties` is not touched). `query`: words of the RUC or the name. */
export function listParties<P extends PartyLike>(parties: P[], f: PartyFilter, at: PartyLookup, query = ''): P[] {
    const words = byWords(query);
    return parties
        .filter(
            (p) =>
                words(p.ruc, p.name) &&
                (!f.role || (f.role === 'supplier' ? p.purchases > 0 : p.sales > 0)) &&
                (!f.type || isNaturalPerson(p.ruc) === (f.type === 'person')) &&
                hasFlag(f.flag, p.ruc, at),
        )
        .sort(ORDER[f.sort]);
}

/** SSCO subjects the query names that we have no document with: SUNAT's list covers the whole country. */
export function sscoByName(query: string, ssco: SscoEntry[] | null, withUs: (ruc: string) => boolean): SscoEntry[] {
    const words = byWords(query);
    return (ssco ?? []).filter((s) => !withUs(s.ruc) && words(s.ruc, s.name));
}
