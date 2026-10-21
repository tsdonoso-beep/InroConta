'use client';

// The «Usuarios» screen: a form to add a person (or change their name and role) and the list, where
// each row can be edited or switched off. Switching off keeps the row: who had access stays written.
// Every outcome is a toast; taking access away offers «Deshacer» in its toast.
import { useActionState, useState, useTransition } from 'react';
import type { UserRow } from '../../../shared/auth/users.ts';
import { Empty, CONTROL, T, TextButton } from '../../../shared/ui/bits.tsx';
import { Button } from '../../../shared/ui/button.tsx';
import { Card, Chip } from '../../../shared/ui/card.tsx';
import { limaDateTime } from '../../../shared/ui/format.ts';
import { toast } from '../../../shared/ui/toaster.tsx';
import { saveUserAction, setActiveAction, type ActionState } from './actions.ts';

const ROLE_LABEL: Record<UserRow['role'], string> = { lector: 'Lector', admin: 'Admin' };

interface Draft {
    email: string;
    name: string;
    role: UserRow['role'];
}
const EMPTY: Draft = { email: '', name: '', role: 'lector' };

/** The outcome of an action as a toast; true when it went through. */
function tell(r: ActionState, undo?: () => void): boolean {
    if (r.error) toast.error(r.error);
    else if (r.done) toast.success(r.done, undo ? { action: { label: 'Deshacer', onClick: undo } } : undefined);
    return !r.error;
}

function UserForm({ draft, onDraft }: { draft: Draft; onDraft: (d: Draft) => void }) {
    const [, action, saving] = useActionState<ActionState, FormData>(async (prev, form) => {
        const next = await saveUserAction(prev, form);
        if (tell(next)) onDraft(EMPTY);
        return next;
    }, {});
    return (
        <Card title="Dar acceso" note="Si el correo ya está, se actualizan su nombre y su rol">
            <form action={action} className="flex flex-wrap items-end gap-2.5">
                <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-xs font-semibold text-ink-2">
                    Correo
                    <input
                        name="email"
                        type="email"
                        required
                        placeholder="nombre@inroprin.com"
                        value={draft.email}
                        onChange={(e) => onDraft({ ...draft, email: e.target.value })}
                        className={CONTROL}
                    />
                </label>
                <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-semibold text-ink-2">
                    Nombre
                    <input
                        name="name"
                        placeholder="Opcional"
                        value={draft.name}
                        onChange={(e) => onDraft({ ...draft, name: e.target.value })}
                        className={CONTROL}
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-ink-2">
                    Rol
                    <select name="role" value={draft.role} onChange={(e) => onDraft({ ...draft, role: e.target.value as Draft['role'] })} className={CONTROL}>
                        <option value="lector">Lector</option>
                        <option value="admin">Admin (ve esta pantalla)</option>
                    </select>
                </label>
                <Button type="submit" disabled={saving}>
                    {saving ? 'Guardando…' : 'Guardar'}
                </Button>
            </form>
        </Card>
    );
}

function UserTable({ users, me, onEdit }: { users: UserRow[]; me: string; onEdit: (u: UserRow) => void }) {
    const [pending, start] = useTransition();
    const toggle = (email: string, active: boolean) =>
        start(async () => {
            // Taking access away can be undone from its toast; giving it back needs no undo.
            tell(await setActiveAction(email, active), active ? undefined : () => toggle(email, true));
        });
    const active = users.filter((u) => u.active).length;
    return (
        <Card title="Con acceso" note={`${active} de ${users.length} activos`}>
            {!users.length ? (
                <Empty>Nadie en la lista todavía.</Empty>
            ) : (
                <div className="overflow-x-auto">
                    <table className={T.table}>
                        <thead>
                            <tr className={T.headRow}>
                                <th className={T.th}>Correo</th>
                                <th className={T.th}>Rol</th>
                                <th className={T.th}>Estado</th>
                                <th className={T.th}>Agregado</th>
                                <th className={T.th} />
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((u) => (
                                <tr key={u.email} className={`${T.row} ${u.active ? '' : 'text-ink-3'}`}>
                                    <td className={T.td}>
                                        <b>{u.email}</b>
                                        {u.email === me && <span className="ml-1.5 text-xs text-ink-3">(tú)</span>}
                                        {u.name && <div className={T.sub}>{u.name}</div>}
                                    </td>
                                    <td className={T.td}>{ROLE_LABEL[u.role]}</td>
                                    <td className={T.td}>
                                        <Chip tone={u.active ? 'ok' : 'muted'}>{u.active ? 'Activo' : 'Sin acceso'}</Chip>
                                    </td>
                                    <td className={`${T.td} whitespace-nowrap`}>{limaDateTime(u.createdAt)}</td>
                                    <td className={`${T.td} text-right whitespace-nowrap`}>
                                        <TextButton onClick={() => onEdit(u)}>Editar</TextButton>
                                        {u.email !== me && (
                                            <TextButton
                                                onClick={() => !pending && toggle(u.email, !u.active)}
                                                className={u.active ? 'text-danger hover:text-danger-strong' : ''}
                                            >
                                                {u.active ? 'Quitar acceso' : 'Devolver acceso'}
                                            </TextButton>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

export function UsuariosView({ users, me }: { users: UserRow[]; me: string }) {
    const [draft, setDraft] = useState<Draft>(EMPTY);
    return (
        <div className="grid gap-4">
            <UserForm draft={draft} onDraft={setDraft} />
            <UserTable
                users={users}
                me={me}
                onEdit={(u) => {
                    setDraft({ email: u.email, name: u.name ?? '', role: u.role });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
            />
        </div>
    );
}
