// The list of who may enter (usuario_inroconta, 013), read and written by the «Usuarios» screen.
// Only admins reach these functions (requireAdmin in the page and in every action).
import 'server-only';
import type { Result } from 'neverthrow';
import type { SourceError } from '../errors.ts';
import { one } from '../supabase/tables.ts';
import { ALLOWED_DOMAIN, forgetUsers } from './access.ts';

export const ROLES = ['lector', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export interface UserRow {
    email: string;
    name: string | null;
    role: Role;
    active: boolean;
    createdAt: string;
}

interface DbRow {
    correo: string;
    nombre: string | null;
    rol: Role;
    activo: boolean;
    creado_en: string;
}

const COLUMNS = 'correo, nombre, rol, activo, creado_en';
const toRow = (r: DbRow): UserRow => ({ email: r.correo, name: r.nombre, role: r.rol, active: r.activo, createdAt: r.creado_en });

/** The email as the table keeps it, or the reason it is not one of ours. */
export function checkEmail(raw: string): { email: string } | { error: string } {
    const email = raw.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) return { error: 'Escribe un correo válido.' };
    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) return { error: `Solo cuentas @${ALLOWED_DOMAIN}.` };
    return { email };
}

/** Everybody, the active ones first. */
export async function listUsers(): Promise<Result<UserRow[], SourceError>> {
    const rows = await one<DbRow>('usuario_inroconta', (c) =>
        c.from('usuario_inroconta').select(COLUMNS).order('activo', { ascending: false }).order('correo'),
    );
    return rows.map((r) => r.map(toRow));
}

/** Adds the person, or updates name and role (and switches them on) if the email is already there. */
export async function saveUser(email: string, name: string | null, role: Role): Promise<Result<UserRow[], SourceError>> {
    const rows = await one<DbRow>('guardar usuario', (c) =>
        c.from('usuario_inroconta').upsert({ correo: email, nombre: name, rol: role, activo: true }, { onConflict: 'correo' }).select(COLUMNS),
    );
    forgetUsers();
    return rows.map((r) => r.map(toRow));
}

/** Opens or closes the door to one person, keeping the row. */
export async function setActive(email: string, active: boolean): Promise<Result<UserRow[], SourceError>> {
    const rows = await one<DbRow>('cambiar acceso', (c) => c.from('usuario_inroconta').update({ activo: active }).eq('correo', email).select(COLUMNS));
    forgetUsers();
    return rows.map((r) => r.map(toRow));
}
