'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';

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
            className="w-full rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-card hover:bg-primary-strong disabled:bg-disabled disabled:text-disabled-ink"
        >
            {busy ? 'Abriendo Google…' : 'Entrar con Google'}
        </button>
    );
}
