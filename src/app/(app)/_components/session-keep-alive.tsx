'use client';

// Keeps the 30-day session sliding (session.ts): asking next-auth for the session re-signs the
// cookie with 30 more days. Once a day per browser is enough; without it the session would end 30
// days after signing in, however much the app is used.
import { useEffect } from 'react';

const KEY = 'inroconta.session-renewed-at';
const DAY_MS = 24 * 60 * 60 * 1000;

export function SessionKeepAlive() {
    useEffect(() => {
        try {
            if (Date.now() - Number(localStorage.getItem(KEY) ?? 0) < DAY_MS) return;
            localStorage.setItem(KEY, String(Date.now()));
        } catch {
            // No localStorage (private window): renew on every load, it is one small request.
        }
        void fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' }).catch(() => undefined);
    }, []);
    return null;
}
