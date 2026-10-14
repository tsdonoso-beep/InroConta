// What the robot saw change in the OC folders: the filters, the chip colour of each kind of change
// and the grouping by day of the «Cambios del robot» section. Port of pintarCambios() in
// apps-script/inroconta/VistaEjecutivaPagina.html; the days are Lima days (the old view used the
// browser's clock).
import type { FolderChange } from '../entities/Folder.ts';
import { dateInPeriod, parsePeriod } from '../../../../shared/period.ts';
import { matchesAllWords } from './no-oc.ts';

/** '' = every kind; the rest pick changes by the words of their type. */
export type ChangeKind = '' | 'COMPL' | 'FALTA' | 'NUEV' | 'ELIM';
/** '' = both areas, 'nat' = Compras nacionales, 'imp' = COMEX. */
export type ChangeArea = '' | 'nat' | 'imp';

export interface ChangeFilter {
    kind: ChangeKind;
    area: ChangeArea;
    text: string;
    /** A period code (shared/period.ts) over the Lima day of the change; '' = every day. */
    period: string;
}

export const CHANGE_DEFAULT: ChangeFilter = { kind: '', area: '', text: '', period: '' };

const KIND_RE: Record<Exclude<ChangeKind, ''>, RegExp> = { COMPL: /COMPLET/i, FALTA: /FALTA/i, NUEV: /NUEV/i, ELIM: /ELIMIN|YA NO/i };

export function filterChanges(rows: FolderChange[], f: ChangeFilter): FolderChange[] {
    const re = f.kind ? KIND_RE[f.kind] : null;
    const p = parsePeriod(f.period);
    return rows.filter(
        (x) =>
            (!re || re.test(x.type)) &&
            (f.area === '' || x.isImport === (f.area === 'imp')) &&
            matchesAllWords(`${x.oc} ${x.detail}`, f.text) &&
            (!p || dateInPeriod(p, limaIsoDay(x.at))),
    );
}

/** The Lima day of an instant, yyyy-mm-dd. */
export function limaIsoDay(iso: string): string {
    const { day } = limaDayAndTime(iso);
    return /^\d{2}\/\d{2}\/\d{4}$/.test(day) ? `${day.slice(6)}-${day.slice(3, 5)}-${day.slice(0, 2)}` : '';
}

/** The months (YYYYMM) with changes, for the period picker. */
export function changeMonths(rows: FolderChange[]): string[] {
    return [...new Set(rows.map((x) => limaIsoDay(x.at).slice(0, 7).replace('-', '')).filter(Boolean))];
}

export type ChangeTone = 'ok' | 'danger' | 'info' | 'warn' | 'muted';

/** The chip of a change type: completed green, now lacking red, new blue, removed amber. */
export const changeTone = (type: string): ChangeTone =>
    /COMPLET/i.test(type) ? 'ok' : /FALTA/i.test(type) ? 'danger' : /NUEV/i.test(type) ? 'info' : /ELIMIN|YA NO/i.test(type) ? 'warn' : 'muted';

const LIMA = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
});

/** An instant as its Lima day «13/10/2026» and time «08:20» ('' and the raw text if it is not a date). */
export function limaDayAndTime(iso: string): { day: string; time: string } {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { day: iso, time: '' };
    const p = Object.fromEntries(LIMA.formatToParts(d).map((x) => [x.type, x.value]));
    // Some engines write midnight as «24».
    return { day: `${p.day}/${p.month}/${p.year}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}

export interface ChangeDay {
    day: string;
    rows: { change: FolderChange; time: string }[];
}

/** Consecutive changes of the same Lima day together, in the order they come (newest first). */
export function changesByDay(rows: FolderChange[]): ChangeDay[] {
    const days: ChangeDay[] = [];
    for (const change of rows) {
        const { day, time } = limaDayAndTime(change.at);
        const last = days[days.length - 1];
        if (last && last.day === day) last.rows.push({ change, time });
        else days.push({ day, rows: [{ change, time }] });
    }
    return days;
}
