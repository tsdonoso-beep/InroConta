// The same normalizations the v2 write functions do in SQL (docs/database/v2/004_ and 005_), in
// TypeScript, so the moved rows look exactly like the ones the workflows will write later.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export const COMPANY = '20512201611';

/** Empty strings and whitespace become null. */
export function text(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
}

export function num(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
}

export function int(v: unknown): number | null {
    const n = num(v);
    return n === null ? null : Math.trunc(n);
}

/** SQL `ltrim(numero, '0')`. */
export const number = (v: unknown) =>
    String(v ?? '')
        .trim()
        .replace(/^0+/, '');
/** SQL `upper(serie)`. */
export const serie = (v: unknown) =>
    String(v ?? '')
        .trim()
        .toUpperCase();

/** tipo_documento_de(): catalog 06 from the number. */
export function docType(n: string): string {
    if (/^\d{11}$/.test(n)) return '6';
    if (/^\d{8}$/.test(n)) return '1';
    return '0';
}

/** ruc_valido(): an 11-digit RUC or an 8-digit DNI, or null. */
export function validRuc(v: unknown): string | null {
    const s = String(v ?? '').trim();
    return /^\d{8}(\d{3})?$/.test(s) ? s : null;
}

/** moneda_valida(): an ISO code or null («EUR / USD» from a merged row is null). */
export function currency(v: unknown): string | null {
    const s = String(v ?? '')
        .trim()
        .toUpperCase();
    return /^[A-Z]{3}$/.test(s) ? s : null;
}

/** drive_id_de(): the id of a Drive file from its link. */
export function fileId(v: unknown): string | null {
    const s = text(v);
    if (!s) return null;
    return s.match(/\/d\/([\w-]+)/)?.[1] ?? s.match(/[?&]id=([\w-]+)/)?.[1] ?? (/^[\w-]{20,}$/.test(s) ? s : null);
}

/** The id of a Drive folder from its link (…/folders/<id>?…). */
export function folderId(v: unknown): string | null {
    const s = text(v);
    if (!s) return null;
    return s.match(/\/folders\/([\w-]+)/)?.[1] ?? s.match(/[?&]id=([\w-]+)/)?.[1] ?? (/^[\w-]{20,}$/.test(s) ? s : null);
}

/** An ISO date (2026-01-07) from ISO or dd/mm/yyyy, or null. */
export function date(v: unknown): string | null {
    const s = text(v);
    if (!s) return null;
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : null;
}

/** 'Nacional' | 'Importación' → 'NACIONAL' | 'IMPORTACION'. */
export function origin(v: unknown): 'NACIONAL' | 'IMPORTACION' | null {
    const s = String(v ?? '')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toUpperCase()
        .trim();
    if (s.startsWith('NAC')) return 'NACIONAL';
    if (s.startsWith('IMP')) return 'IMPORTACION';
    return null;
}

/** oc_numero() / oc_anio(): '0172-2026' → {numero: '172', anio: 2026}. */
export function parseOc(v: unknown): { numero: string; anio: number } | null {
    const m = String(v ?? '').match(/^\s*(\d+(?:\.\d+)?)-(\d{4})\s*$/);
    if (!m) return null;
    const numero = m[1].replace(/^0+/, '');
    const anio = Number(m[2]);
    // orden_compra.anio is 2000–2099: «2608-0028» is a typo, not an OC of the year 28.
    return numero && /^[1-9]/.test(numero) && anio >= 2000 && anio <= 2099 ? { numero, anio } : null;
}

/** 'a, b' → ['a', 'b'] (null when empty). */
export function list(v: unknown, sep: string | RegExp = /\s*,\s*/): string[] | null {
    const s = text(v);
    if (!s) return null;
    const out = s
        .split(sep)
        .map((x) => x.trim())
        .filter(Boolean);
    return out.length ? out : null;
}

/** The key of a comprobante: emisor|tipo|SERIE|numero (unique per company in v2). */
export const docKey = (emisor: string, tipo: string, s: unknown, n: unknown) => `${emisor}|${tipo}|${serie(s)}|${number(n)}`;

/** Counters of what was skipped and why, printed at the end. */
export class Notes {
    private counts = new Map<string, number>();
    add(what: string, n = 1) {
        this.counts.set(what, (this.counts.get(what) ?? 0) + n);
    }
    entries() {
        return [...this.counts.entries()].sort();
    }
}
