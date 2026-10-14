// The pure rules of a RUC on screen: where its fiscal address is, whether its state is odd,
// whether it is a natural person, the name search of Consulta RUC and the received invoices from
// SSCO suppliers. Ports of lugarDe and fichaProveedor (VistaEjecutivaPagina.html), nameMatches
// and paintSscoWarning (VistaConsultaRuc.html).
import type { SscoEntry, TaxpayerCard } from './entities/Taxpayer.ts';

/** How many RUCs the name search offers. */
export const NAME_MATCH_LIMIT = 15;

const plain = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** «dd/mm/yyyy» → «yyyy-mm-dd»; '' when it is not a date. */
const isoOf = (d: string) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

/** District, province, department, without repeats (Lima, Lima, Lima → Lima). */
export function placeOf(card: TaxpayerCard | null): string {
    if (!card) return '';
    return [...new Set([card.district, card.province, card.department].filter(Boolean))].join(', ');
}

/** Not ACTIVO or not HABIDO: a warning. */
export const isOdd = (card: TaxpayerCard) => (!!card.state && card.state !== 'ACTIVO') || (!!card.condition && card.condition !== 'HABIDO');

/** RUCs 10, 15 and 17 are people: SUNAT does not publish their address. */
export const isNaturalPerson = (ruc: string) => /^(10|15|17)/.test(ruc);

export interface NameMatch {
    ruc: string;
    name: string;
    inSsco: boolean;
}

/** Every word in the RUC or the name; our parties first, then the SSCO list; one per RUC. */
export function rucsByName(query: string, parties: Iterable<{ ruc: string; name: string }>, ssco: SscoEntry[] | null): NameMatch[] {
    const words = plain(query).split(/\s+/).filter(Boolean);
    const found: NameMatch[] = [];
    const seen = new Set<string>();
    const add = (ruc: string, name: string, inSsco: boolean) => {
        if (seen.has(ruc) || found.length >= NAME_MATCH_LIMIT) return;
        const t = plain(`${ruc} ${name}`);
        if (words.every((w) => t.includes(w))) {
            seen.add(ruc);
            found.push({ ruc, name, inSsco });
        }
    };
    for (const p of parties) add(p.ruc, p.name, false);
    for (const s of ssco ?? []) add(s.ruc, s.name, true);
    return found;
}

export interface SscoHits<D> {
    docs: D[];
    suppliers: number;
    /** Issued on or after the day their attribution became final. */
    afterFinal: number;
}

/** The received documents (compras) whose supplier is in the SSCO list. */
export function sscoHits<D extends { origin: string; ruc: string; issuedOn: string }>(
    docs: D[],
    sscoOf: (ruc: string) => SscoEntry | null | undefined,
): SscoHits<D> {
    const hits = docs.filter((d) => d.origin === 'compra' && sscoOf(d.ruc));
    return {
        docs: hits,
        suppliers: new Set(hits.map((d) => d.ruc)).size,
        afterFinal: hits.filter((d) => isoOf(d.issuedOn) >= sscoOf(d.ruc)!.finalDate).length,
    };
}
