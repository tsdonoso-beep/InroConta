'use client';

// What Consulta RUC is showing, mirrored in the URL (?ruc=… or ?ssco=1) so a link opens it. Like
// _comprobantes/filter-store.ts: history.replaceState to write it, and its own subscribers to
// read it back (useSearchParams did not re-render on replaceState in Next 16). Re-read from the
// URL on every mount, so «Ver en Consulta RUC» (a link to ?ssco=1) is obeyed after a visit.
import { useSyncExternalStore } from 'react';

export interface RucQuery {
    /** The text typed: a RUC or part of a business name. */
    q: string;
    /** The received invoices from SSCO suppliers (Resumen's warning), while nothing is typed. */
    ssco: boolean;
}

const EMPTY: RucQuery = { q: '', ssco: false };
let state: RucQuery | null = null;
const listeners = new Set<() => void>();

function fromUrl(): RucQuery {
    const p = new URLSearchParams(window.location.search);
    const q = p.get('ruc') ?? '';
    return { q, ssco: !q && p.get('ssco') === '1' };
}

export function setRucQuery(q: string) {
    state = { q, ssco: false };
    const p = new URLSearchParams(window.location.search);
    p.delete('ssco');
    if (q.trim()) p.set('ruc', q.trim());
    else p.delete('ruc');
    const s = p.toString();
    window.history.replaceState(null, '', s ? `${window.location.pathname}?${s}` : window.location.pathname);
    listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
    if (!listeners.size) state = fromUrl();
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function useRucQuery(): RucQuery {
    return useSyncExternalStore(
        subscribe,
        () => (state ??= fromUrl()),
        () => EMPTY,
    );
}
