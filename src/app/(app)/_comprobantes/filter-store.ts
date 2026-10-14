'use client';

// The SUNAT filters of the tab (period, compras/ventas, currency, search), in the module so they survive
// moving between sections, and mirrored in the URL with history.replaceState so a link carries
// them. Not router.replace: the documents are in the browser, so a filter asks the server for
// nothing (with router.replace every click re-sent the page, 7 MB, measured 13/10/2026). And not
// useSearchParams to read them back: Next 16 did not re-render on that replaceState (seen
// 13/10/2026), so the store notifies its own subscribers.
import { useSyncExternalStore } from 'react';

export interface FilterState {
    /** 'venta' or '' (compras, the default). */
    origen: string;
    /** A currency code, 'ALL', or '' (the most used one). */
    moneda: string;
    /** A period code (shared/period.ts) or '' (everything). */
    per: string;
    /** The words of the search. */
    q: string;
}

const KEYS = ['origen', 'moneda', 'per', 'q'] as const;
const EMPTY: FilterState = { origen: '', moneda: '', per: '', q: '' };

let state: FilterState | null = null;
const listeners = new Set<() => void>();

function fromUrl(): FilterState {
    const q = new URLSearchParams(window.location.search);
    return { origen: q.get('origen') ?? '', moneda: q.get('moneda') ?? '', per: q.get('per') ?? '', q: q.get('q') ?? '' };
}

/** The query string of the filters ('' when all are at their default), for links between sections. */
export function filterQuery(s: FilterState): string {
    const q = new URLSearchParams();
    for (const k of KEYS) if (s[k]) q.set(k, s[k]);
    return q.toString();
}

export function setFilters(patch: Partial<FilterState>) {
    state = { ...(state ?? fromUrl()), ...patch };
    const q = new URLSearchParams(window.location.search);
    for (const k of KEYS) {
        if (state[k]) q.set(k, state[k]);
        else q.delete(k);
    }
    const s = q.toString();
    window.history.replaceState(null, '', s ? `${window.location.pathname}?${s}` : window.location.pathname);
    listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** The filters; on the server (and in the first render after it) the defaults. */
export function useFilterState(): FilterState {
    return useSyncExternalStore(
        subscribe,
        () => (state ??= fromUrl()),
        () => EMPTY,
    );
}
