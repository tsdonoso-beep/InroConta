import { Notice, SectionTitle } from '../../../shared/ui/bits.tsx';
import { requireAdmin } from '../../../shared/auth/session.ts';
import { listUsers } from '../../../shared/auth/users.ts';
import { UsuariosView } from './usuarios-view.tsx';

// Who may enter the app (usuario_inroconta). Admins only: anybody else is sent home. Read fresh on
// every visit: it is a handful of rows and what was just changed must show.
export default async function UsuariosPage() {
    const me = await requireAdmin();
    const users = await listUsers();
    return (
        <>
            <SectionTitle title="Usuarios" />
            {users.isErr() ? <Notice>No se pudo leer la lista: {users.error.message}</Notice> : <UsuariosView users={users.value} me={me.email} />}
        </>
    );
}
