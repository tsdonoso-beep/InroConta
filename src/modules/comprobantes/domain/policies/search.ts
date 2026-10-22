// Buscar factura: find documents by series-number, RUC, number alone, amount or words, newest
// first. The port of buscarFacturas and claveFecha (VistaEjecutivaPagina.html) and of docsOfRuc
// (VistaConsultaRuc.html).
import type { Doc } from '../entities/Doc.ts';

const plain = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** «dd/mm/yyyy» → «yyyy-mm-dd»; '' when it is not a date. */
const isoOf = (d: string) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

/** The sort key of claveFecha: the issue date (yyyymmdd) or, without one, its month + '00'. */
export function dateKey(d: Doc): string {
    const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(d.issuedOn);
    return m ? m[3] + m[2] + m[1] : `${d.period}00`;
}

/** Series and number of «F001-123» (series = up to the last '-'), as the lines store keys them. */
export function splitNumber(number: string): { series: string; num: string } {
    const i = number.lastIndexOf('-');
    return i < 0 ? { series: '', num: number } : { series: number.slice(0, i), num: number.slice(i + 1) };
}

export interface DocSearch {
    /** All of them, newest first (the screen cuts them in pages: doc-list.ts). */
    found: Doc[];
    total: number;
    /** When everything found is of one RUC: its card goes on top. */
    single: { ruc: string; name: string } | null;
}

function matches(docs: Doc[], q: string): Doc[] {
    const Q = plain(q);
    const series = /^([A-Z0-9]{3,4})[\s-]+0*(\d+)$/.exec(Q);
    const bare = q.replace(/^S\/\s*|^US\$\s*/i, '');
    const amount = /^-?[\d,]*\.\d{1,2}$/.test(bare) ? Number(q.replace(/[^\d.-]/g, '')) : null;
    if (series) {
        const wanted = `${series[1]}-${series[2]}`;
        return docs.filter((d) => d.number === wanted);
    }
    if (/^\d{11}$/.test(Q)) return docs.filter((d) => d.ruc === Q);
    if (/^\d{1,8}$/.test(Q)) return docs.filter((d) => d.number.split('-').pop() === String(Number(Q)));
    if (amount !== null) return docs.filter((d) => Math.abs(Math.abs(d.total) - Math.abs(amount)) < 0.01);
    const words = Q.split(/\s+/).filter((w) => w.length > 1);
    return docs.filter((d) => {
        const t = plain(`${d.number} ${d.ruc} ${d.name}`);
        return words.every((w) => t.includes(w));
    });
}

const newestFirst = (a: Doc, b: Doc) => {
    const ka = dateKey(a),
        kb = dateKey(b);
    return ka < kb ? 1 : ka > kb ? -1 : 0;
};

/** An empty search gives every document, so the screen opens with the whole year to filter. */
export function searchDocs(docs: Doc[], query: string): DocSearch {
    const q = query.trim();
    if (!q) return { found: [...docs].sort(newestFirst), total: docs.length, single: null };
    const list = matches(docs, q).sort(newestFirst);
    const rucs = new Map(list.map((d) => [d.ruc, d.name]));
    const [only] = rucs.size === 1 ? [...rucs] : [];
    return {
        found: list,
        total: list.length,
        single: only && only[0] ? { ruc: only[0], name: only[1] } : null,
    };
}

/** The documents of a RUC with us, newest issue date first (Consulta RUC). */
export function docsOfRuc(docs: Doc[], ruc: string): Doc[] {
    return docs
        .filter((d) => d.ruc === ruc)
        .sort((a, b) => {
            const ia = isoOf(a.issuedOn),
                ib = isoOf(b.issuedOn);
            return ia < ib ? 1 : ia > ib ? -1 : 0;
        });
}

export interface Party {
    ruc: string;
    name: string;
    /** Issue date (dd/mm/yyyy) of its newest document; '' when that one has none. */
    lastOn: string;
    docs: number;
}

/** Every RUC with documents with us, the one we dealt with last first (Consulta RUC). */
export function partiesByLastDoc(docs: Doc[]): Party[] {
    const by = new Map<string, { party: Party; key: string }>();
    for (const d of docs) {
        const key = dateKey(d);
        const seen = by.get(d.ruc);
        if (!seen) by.set(d.ruc, { party: { ruc: d.ruc, name: d.name, lastOn: d.issuedOn, docs: 1 }, key });
        else {
            seen.party.docs++;
            if (key > seen.key) Object.assign(seen, { key, party: { ...seen.party, name: d.name || seen.party.name, lastOn: d.issuedOn } });
        }
    }
    return [...by.values()].sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0)).map((p) => p.party);
}
