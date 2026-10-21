import Image from 'next/image';
import { redirect } from 'next/navigation';
import { currentUser } from '../../shared/auth/session.ts';
import { CARD } from '../../shared/ui/card.tsx';
import { SignInButton } from './sign-in-button.tsx';

// It reads the session (to send a signed-in person on) and ?error=: per request.
export const dynamic = 'force-dynamic';

const REASONS: Record<string, string> = {
    denied: 'Tu cuenta no tiene acceso. Pide a Contabilidad que te agregue en la pestaña USUARIOS del libro INROCONTA.',
    unverified: 'Google no confirmó el correo de esa cuenta.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
    if (await currentUser()) redirect('/');
    const { error } = await searchParams;
    const reason = error ? (REASONS[error] ?? 'No se pudo iniciar sesión. Vuelve a intentarlo.') : null;

    return (
        <main className="flex min-h-screen items-center justify-center p-4">
            <div className={`flex w-full max-w-sm flex-col items-center gap-5 ${CARD} p-8 text-center`}>
                <Image src="/images/IconRoland.png" alt="Roland Print" width={56} height={56} priority />
                <div>
                    <h1 className="text-xl font-extrabold">
                        INRO<span className="text-primary">CONTA</span>
                    </h1>
                    <p className="mt-1 text-[13px] text-ink-3">Contabilidad · SUNAT, compras y legajo</p>
                </div>
                {reason && <p className="w-full rounded-xl bg-danger-soft px-4 py-3 text-left text-[13px] text-danger-strong">{reason}</p>}
                <SignInButton />
                <p className="text-xs text-ink-3">Solo cuentas @inroprin.com</p>
            </div>
        </main>
    );
}
