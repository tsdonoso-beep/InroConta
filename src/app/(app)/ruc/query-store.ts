'use client';

// What Consulta RUC is showing, mirrored in the URL (?ruc=… or ?ssco=1) so a link opens it. Like
// _comprobantes/filter-store.ts: history.replaceState to write what is typed, and its own
// subscribers to read it back (useSearchParams did not re-render on replaceState in Next 16).
// Opening a RUC from the list is a history.pushState instead, so «‹ Volver» and the browser's back
// button return to the list as it was (popstate re-reads the URL). Re-read from the URL on every
// mount, so «Ver en Consulta RUC» (a link to ?ssco=1) is obeyed after a visit.
import { useSyncExternalStore } from 'react';

export interface RucQuery {
    /** The text typed: a RUC or part of a business name. */
    q: string;
    /** The received invoices from SSCO suppliers (Resumen's warning), while nothing is typed. */
    ssco: boolean;
    /** The RUC on screen was opened from the list: going back returns to it. */
    opened: boolean;
}

const EMPTY: RucQuery = { q: '', ssco: false, opened: false };
let state: RucQuery | null = null;
const listeners = new Set<() => void>();

function fromUrl(): RucQuery {
    const p = new URLSearchParams(window.location.search);
    const q = p.get('ruc') ?? '';
    const opened = (window.history.state as { rucOpened?: boolean } | null)?.rucOpened === true;
    return { q, ssco: !q && p.get('ssco') === '1', opened };
}

function urlWith(q: string) {
    const p = new URLSearchParams(window.location.search);
    p.delete('ssco');
    if (q.trim()) p.set('ruc', q.trim());
    else p.delete('ruc');
    const s = p.toString();
    return s ? `${window.location.pathname}?${s}` : window.location.pathname;
}

const notify = () => listeners.forEach((l) => l());

export function setRucQuery(q: string) {
    state = { q, ssco: false, opened: false };
    window.history.replaceState(null, '', urlWith(q));
    notify();
}

/**
 * A RUC picked from the list: a new history entry, so going back finds the list with its search
 * and filters. Its URL carries only the RUC: shared, it opens that RUC with its documents unfiltered.
 */
export function openRuc(ruc: string) {
    state = { q: ruc, ssco: false, opened: true };
    window.history.pushState({ rucOpened: true }, '', `${window.location.pathname}?ruc=${ruc}`);
    window.scrollTo(0, 0);
    notify();
}

/** «‹ Volver»: back to the list it was opened from, or to every RUC when it came from elsewhere. */
export function leaveRuc() {
    if (state?.opened) window.history.back();
    else setRucQuery('');
}

const onPop = () => {
    state = fromUrl();
    notify();
};

function subscribe(listener: () => void) {
    if (!listeners.size) {
        state = fromUrl();
        window.addEventListener('popstate', onPop);
    }
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
        if (!listeners.size) window.removeEventListener('popstate', onPop);
    };
}

export function useRucQuery(): RucQuery {
    return useSyncExternalStore(
        subscribe,
        () => (state ??= fromUrl()),
        () => EMPTY,
    );
}
