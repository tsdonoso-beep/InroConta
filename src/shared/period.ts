// The period a screen is filtered by: a day, a month, a bimester, a quarter, a semester, a year or
// a free range, written as one short code so it travels in the URL (?per=t2026-3). Pure: the
// policies of every context and the picker use it.
//
//   ''                      everything
//   d2026-09-12             one day
//   m202609                 one month
//   b2026-5 · t2026-3 · s2026-2   the 5th bimester (sep–oct), 3rd quarter, 2nd semester
//   a2026                   one year
//   r2026-09-01_2026-09-30  from one day to another
//
// The month-shaped kinds (month to year) filter by the SUNAT period (YYYYMM), as the tax books do;
// a day and a range filter by the date of issue (or of payment, or of the change: each screen says
// which date).

export type PeriodKind = 'day' | 'month' | 'bimester' | 'quarter' | 'semester' | 'year' | 'range';

export interface Period {
    kind: PeriodKind;
    code: string;
    /** yyyy-mm-dd, both included. */
    from: string;
    to: string;
    /** YYYYMM of every month it covers, for the month-shaped kinds; null for a day or a range. */
    months: string[] | null;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
/** Months per part of the year. */
export const SPAN: Record<'bimester' | 'quarter' | 'semester', number> = { bimester: 2, quarter: 3, semester: 6 };
const LETTER: Record<PeriodKind, string> = { day: 'd', month: 'm', bimester: 'b', quarter: 't', semester: 's', year: 'a', range: 'r' };
const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** The months from month `m0` (1-12) of `y`, `n` of them. */
function monthSpan(kind: PeriodKind, code: string, y: number, m0: number, n: number): Period {
    const months = Array.from({ length: n }, (_, i) => `${y}${pad(m0 + i)}`);
    return { kind, code, from: `${y}-${pad(m0)}-01`, to: `${y}-${pad(m0 + n - 1)}-${pad(lastDay(y, m0 + n - 1))}`, months };
}

/** null for '' (everything) or a code that does not parse (also treated as everything). */
export function parsePeriod(code: string | null | undefined): Period | null {
    const c = (code ?? '').trim();
    let m: RegExpExecArray | null;
    if ((m = /^d(\d{4}-\d{2}-\d{2})$/.exec(c))) return { kind: 'day', code: c, from: m[1], to: m[1], months: null };
    if ((m = /^m(\d{4})(\d{2})$/.exec(c)) && +m[2] >= 1 && +m[2] <= 12) return monthSpan('month', c, +m[1], +m[2], 1);
    if ((m = /^([bts])(\d{4})-(\d)$/.exec(c))) {
        const kind = ({ b: 'bimester', t: 'quarter', s: 'semester' } as const)[m[1] as 'b' | 't' | 's'];
        const n = SPAN[kind],
            part = +m[3];
        if (part >= 1 && part <= 12 / n) return monthSpan(kind, c, +m[2], (part - 1) * n + 1, n);
    }
    if ((m = /^a(\d{4})$/.exec(c))) return monthSpan('year', c, +m[1], 1, 12);
    if ((m = /^r(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(c)) && m[1] <= m[2]) return { kind: 'range', code: c, from: m[1], to: m[2], months: null };
    return null;
}

/** The code of a period of `kind` that starts in month `ym` (YYYYMM) or on day `date`. */
export function periodCode(kind: PeriodKind, ym: string, date = ''): string {
    const y = ym.slice(0, 4),
        mo = +ym.slice(4, 6);
    if (kind === 'day') return isDate(date) ? `d${date}` : '';
    if (kind === 'month') return `m${ym}`;
    if (kind === 'year') return `a${y}`;
    if (kind === 'range') return '';
    return `${LETTER[kind]}${y}-${Math.ceil(mo / SPAN[kind])}`;
}

export const rangeCode = (from: string, to: string) => (isDate(from) && isDate(to) ? `r${from <= to ? from : to}_${from <= to ? to : from}` : '');

const ORDINAL = ['1.er', '2.º', '3.er', '4.º', '5.º', '6.º'];
const NAME: Record<'bimester' | 'quarter' | 'semester', string> = { bimester: 'bimestre', quarter: 'trimestre', semester: 'semestre' };
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const monthName = (ym: string) => `${MONTHS[+ym.slice(4) - 1]} ${ym.slice(2, 4)}`;

/** «set 26», «3.er trimestre 2026 (jul–set)», «12/09/2026», «01/09/2026 – 30/09/2026»; '' = «todo». */
export function periodLabel(p: Period | null): string {
    if (!p) return '';
    if (p.kind === 'day') return dmy(p.from);
    if (p.kind === 'range') return `${dmy(p.from)} – ${dmy(p.to)}`;
    if (p.kind === 'month') return monthName(p.months![0]);
    if (p.kind === 'year') return p.from.slice(0, 4);
    const ms = p.months!;
    const part = Math.ceil(+ms[0].slice(4) / SPAN[p.kind]);
    return `${ORDINAL[part - 1]} ${NAME[p.kind]} ${p.from.slice(0, 4)} (${MONTHS[+ms[0].slice(4) - 1]}–${MONTHS[+ms[ms.length - 1].slice(4) - 1]})`;
}

/** The period of the same length just before, to compare with (none for a free range). */
export function previousPeriod(p: Period | null): Period | null {
    if (!p || p.kind === 'range') return null;
    if (p.kind === 'day') {
        const d = new Date(`${p.from}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 1);
        return parsePeriod(`d${d.toISOString().slice(0, 10)}`);
    }
    const first = p.months![0];
    let y = +first.slice(0, 4),
        mo = +first.slice(4) - p.months!.length;
    if (mo < 1) {
        mo += 12;
        y--;
    }
    return parsePeriod(periodCode(p.kind, `${y}${pad(mo)}`));
}

/**
 * Whether something falls in the period: by its SUNAT period (YYYYMM) for the month-shaped kinds,
 * by its date (yyyy-mm-dd) for a day or a range. Without a date, a day or a range does not match.
 */
export function inPeriod(p: Period | null, period: string, date: string): boolean {
    if (!p) return true;
    if (p.months) return p.months.includes(period);
    return isDate(date) && date >= p.from && date <= p.to;
}

/** Like inPeriod, for things that only have a date (a payment, a change): the months by the date's month. */
export function dateInPeriod(p: Period | null, date: string): boolean {
    if (!p) return true;
    const d = date.slice(0, 10);
    if (p.months) return isDate(d) && p.months.includes(d.slice(0, 4) + d.slice(5, 7));
    return isDate(d) && d >= p.from && d <= p.to;
}

/** «12/09/2026» → «2026-09-12»; an ISO date stays; anything else → ''. */
export function isoOf(date: string | null | undefined): string {
    const s = (date ?? '').trim();
    const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

/** Every month (YYYYMM) a period touches, also for a day or a range; [] for everything. */
export function monthsTouched(p: Period | null): string[] {
    if (!p) return [];
    if (p.months) return p.months;
    const out: string[] = [];
    let y = +p.from.slice(0, 4),
        m = +p.from.slice(5, 7);
    const last = p.to.slice(0, 4) + p.to.slice(5, 7);
    while (`${y}${pad(m)}` <= last) {
        out.push(`${y}${pad(m)}`);
        if (m === 12) {
            y++;
            m = 1;
        } else m++;
    }
    return out;
}
