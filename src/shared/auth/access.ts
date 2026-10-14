// Who may open the app: an @inroprin.com Google account listed in the USUARIOS tab of the
// INROCONTA book (columns «Correo» and «Rol»), so Accounting grants or removes access by
// editing a row. INROCONTA_ADMINS (emails, comma separated) always enter, so the first
// person can get in before the tab exists. It is a fence: if the tab cannot be read, nobody
// else gets in (fail closed), and the reason goes to the log.
import 'server-only';
import { LIBRO_ID } from '../lib/drive/libro.ts';
import { readTab } from '../google/sheets.ts';

export const ALLOWED_DOMAIN = 'inroprin.com';
export const USERS_TAB = 'USUARIOS';
const CACHE_MS = 5 * 60 * 1000;

export interface AppUser {
    email: string;
    role: string;
}

let cached: { at: number; users: Map<string, AppUser> } | null = null;

const norm = (email: string) => email.trim().toLowerCase();

function admins(): Map<string, AppUser> {
    const m = new Map<string, AppUser>();
    for (const e of (process.env.INROCONTA_ADMINS ?? '').split(',').map(norm).filter(Boolean)) m.set(e, { email: e, role: 'admin' });
    return m;
}

/** The USUARIOS tab as email → user. Throws when the tab is missing or has no «Correo» column. */
export async function usersFromSheet(): Promise<Map<string, AppUser>> {
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.users;
    const rows = await readTab(LIBRO_ID, USERS_TAB);
    if (!rows) throw new Error(`El libro INROCONTA no tiene la pestaña ${USERS_TAB}.`);
    const head = (rows[0] ?? []).map((h) => h.toLowerCase());
    const col = { email: head.indexOf('correo'), role: head.indexOf('rol') };
    if (col.email < 0) throw new Error(`La pestaña ${USERS_TAB} no tiene la columna «Correo».`);
    const users = new Map<string, AppUser>();
    for (const r of rows.slice(1)) {
        const email = norm(r[col.email] ?? '');
        if (email.includes('@')) users.set(email, { email, role: (col.role >= 0 ? r[col.role] : '') || 'lector' });
    }
    cached = { at: Date.now(), users };
    return users;
}

/** The user if this email may enter, null if not. */
export async function allowedUser(email: string | null | undefined): Promise<AppUser | null> {
    if (!email) return null;
    const e = norm(email);
    if (!e.endsWith(`@${ALLOWED_DOMAIN}`)) return null;
    const admin = admins().get(e);
    if (admin) return admin;
    try {
        return (await usersFromSheet()).get(e) ?? null;
    } catch (err) {
        console.error('[access] could not read the users tab', err);
        return null;
    }
}
