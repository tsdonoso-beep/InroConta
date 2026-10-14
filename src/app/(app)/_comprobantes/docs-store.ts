'use client';

// The documents in the browser, read ONCE per tab and shared by every SUNAT screen: moving from
// Resumen to Impuestos, or changing a filter, asks the server for nothing. It lives in the module
// (not in a component), so it survives navigations. Revalidates when the tab comes back after
// REVALIDATE_MS (stale-while-revalidate + revalidate-on-focus): with the ETag, an unchanged book
// costs a 304 and the screen does not move.
import { useSyncExternalStore } from 'react';
import { decodeDocs, type DocsSnapshot, type WireDocs } from '../../../modules/comprobantes/application/views.ts';
import { DOCS_URL } from './docs-url.ts';

const REVALIDATE_MS = 5 * 60 * 1000;

interface State {
    snapshot: DocsSnapshot | null;
    error: string | null;
}

let state: State = { snapshot: null, error: null };
let etag: string | null = null;
let checkedAt = 0;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: State) {
    state = next;
    listeners.forEach((l) => l());
}

/** Starts the read if none is running; a revalidation keeps showing what there is meanwhile. */
export function loadDocs(): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = (async () => {
        try {
            const r = await fetch(DOCS_URL, { credentials: 'include', headers: etag ? { 'If-None-Match': etag } : {} });
            checkedAt = Date.now();
            if (r.status === 304) return;
            const body = (await r.json()) as WireDocs | { error: string };
            if (!r.ok || 'error' in body) {
                console.error('[docs] the server could not read the documents', r.status, body);
                if (!state.snapshot) set({ snapshot: null, error: 'error' in body ? body.error : `Error ${r.status}` });
                return;
            }
            etag = r.headers.get('ETag');
            set({ snapshot: decodeDocs(body), error: null });
        } catch (e) {
            console.error('[docs] request failed', e);
            if (!state.snapshot) set({ snapshot: null, error: 'No se pudo conectar con el servidor.' });
        } finally {
            inFlight = null;
        }
    })();
    return inFlight;
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    if (!state.snapshot && !inFlight) void loadDocs();
    const onVisible = () => {
        if (document.visibilityState === 'visible' && Date.now() - checkedAt > REVALIDATE_MS) void loadDocs();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
        listeners.delete(listener);
        document.removeEventListener('visibilitychange', onVisible);
    };
}

const EMPTY: State = { snapshot: null, error: null };

/** The documents (null while the first read travels) and the error, if the first read failed. */
export function useDocs(): State {
    return useSyncExternalStore(
        subscribe,
        () => state,
        () => EMPTY,
    );
}
