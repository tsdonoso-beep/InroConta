// The counts the menu shows next to Legajo por OC, Facturas sin OC and Cambios del robot, as the
// Apps Script view did (its insignias): how many folders still lack something, how many invoices
// look like they lack an OC for sure, and how many changes the robot's last read brought.
import type { Folder, FolderChange, NoOcInvoice } from '../entities/Folder.ts';

export interface MenuCount {
    count: number;
    title: string;
}

/** Folders of INROPRIN (the company the screen opens on) whose legajo is not complete. */
export function incompleteCount(folders: Folder[]): MenuCount {
    const count = folders.filter((f) => f.status !== 'OK' && f.company === 'INROPRIN').length;
    return { count, title: `${count} carpetas con el legajo incompleto` };
}

/** The invoices with the ALTA signal: the supplier works with OCs and this one has none. */
export function highNoOcCount(rows: NoOcInvoice[]): MenuCount {
    const count = rows.filter((x) => x.signal === 'ALTA').length;
    return { count, title: `${count} facturas que aparentan no tener OC (ALTA)` };
}

/** How far back from the newest change still counts as «the last read» (the robot reads twice a day). */
const LAST_READ_MS = 6 * 3600e3;

/** The changes of the robot's last read: those within six hours of the newest one. */
export function lastReadChanges(rows: FolderChange[]): MenuCount {
    const newest = rows.reduce((m, x) => Math.max(m, new Date(x.at).getTime() || 0), 0);
    const count = newest ? rows.filter((x) => newest - new Date(x.at).getTime() < LAST_READ_MS).length : 0;
    return { count, title: `${count} cambios en la última lectura del robot` };
}
