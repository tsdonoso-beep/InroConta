'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { buttonClass } from '../../shared/ui/button.tsx';

export function SignInButton() {
    const [busy, setBusy] = useState(false);
    return (
        <button
            type="button"
            disabled={busy}
            onClick={() => {
                setBusy(true);
                void signIn('google', { callbackUrl: '/' });
            }}
            className={buttonClass('primary', 'lg', 'w-full')}
        >
            {busy ? 'Abriendo Google…' : 'Entrar con Google'}
        </button>
    );
}
