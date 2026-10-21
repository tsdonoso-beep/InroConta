// Who may open the app: an @inroprin.com Google account with an active row in the v2 table
// usuario_inroconta (013), so access is granted or removed by editing that row in Supabase. It is
// a fence: if the table cannot be read, nobody gets in (fail closed), and the reason goes to the log.
import 'server-only';
import { one } from '../supabase/tables.ts';

export const ALLOWED_DOMAIN = 'inroprin.com';
// Short, so a row switched off closes the door within a minute even with a 30-day session alive.
const CACHE_MS = 60 * 1000;

export interface AppUser {
    email: string;
    role: string;
}

let cached: { at: number; users: Map<string, AppUser> } | null = null;

const norm = (email: string) => email.trim().toLowerCase();

/** The active rows of usuario_inroconta as email → user, or null when the table cannot be read. */
async function activeUsers(): Promise<Map<string, AppUser> | null> {
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.users;
    const rows = await one<{ correo: string; rol: string }>('usuario_inroconta', (c) => c.from('usuario_inroconta').select('correo, rol').eq('activo', true));
    if (rows.isErr()) return null;
    const users = new Map(rows.value.map((r) => [norm(r.correo), { email: norm(r.correo), role: r.rol }]));
    cached = { at: Date.now(), users };
    return users;
}

/** After a write from the «Usuarios» screen: this server sees it at once (others within CACHE_MS). */
export function forgetUsers(): void {
    cached = null;
}

/** The user if this email may enter, null if not. */
export async function allowedUser(email: string | null | undefined): Promise<AppUser | null> {
    if (!email) return null;
    const e = norm(email);
    if (!e.endsWith(`@${ALLOWED_DOMAIN}`)) return null;
    return (await activeUsers())?.get(e) ?? null;
}
