'use server';

// The writes of the «Usuarios» screen. Each one checks again that whoever sends it is an admin:
// a server action is a public endpoint, the hidden menu item is not a lock.
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '../../../shared/auth/session.ts';
import { checkEmail, ROLES, saveUser, setActive, type Role } from '../../../shared/auth/users.ts';

export interface ActionState {
    error?: string;
    done?: string;
}

const PATH = '/usuarios';

export async function saveUserAction(_prev: ActionState, form: FormData): Promise<ActionState> {
    const me = await requireAdmin();
    const checked = checkEmail(String(form.get('email') ?? ''));
    if ('error' in checked) return { error: checked.error };
    const role = String(form.get('role') ?? '') as Role;
    if (!ROLES.includes(role)) return { error: 'Elige un rol.' };
    // Losing your own admin role would leave the screen without anybody able to give it back.
    if (checked.email === me.email && role !== 'admin') return { error: 'No puedes quitarte tu propio rol de admin.' };
    const name = String(form.get('name') ?? '').trim() || null;
    const saved = await saveUser(checked.email, name, role);
    if (saved.isErr()) return { error: `No se pudo guardar: ${saved.error.message}` };
    revalidatePath(PATH);
    return { done: `${checked.email} ya puede entrar como ${role}.` };
}

export async function setActiveAction(email: string, active: boolean): Promise<ActionState> {
    const me = await requireAdmin();
    if (email === me.email && !active) return { error: 'No puedes quitarte el acceso a ti mismo.' };
    const changed = await setActive(email, active);
    if (changed.isErr()) return { error: `No se pudo cambiar: ${changed.error.message}` };
    if (!changed.value.length) return { error: `${email} no está en la lista.` };
    revalidatePath(PATH);
    return { done: active ? `${email} puede entrar otra vez.` : `${email} ya no puede entrar (en un minuto como máximo).` };
}
