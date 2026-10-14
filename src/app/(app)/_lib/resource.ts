'use client';

// What a screen reads from /api, kept in the browser ONCE per tab (in the module, so it
// survives moving between sections), like docs-store.ts does for the documents: going back to a
// section asks the server for nothing. Revalidates when the tab comes back after REVALIDATE_MS.
// `keyed` is the same for things asked one at a time (a folder, a RUC, the lines of an invoice).
import { useEffect, useSyncExternalStore } from 'react';

const REVALIDATE_MS = 5 * 60 * 1000;

export interface ResourceState<T> {
    data: T | null;
    error: string | null;
}

async function getJson<T>(url: string): Promise<T> {
    const r = await fetch(url, { credentials: 'include' });
    const body = (await r.json().catch(() => ({ error: `Error ${r.status}` }))) as T | { error: string };
    if (!r.ok || (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string')) {
        console.error('[resource] the server could not answer', url, r.status, body);
        throw new Error((body as { error?: string }).error || `Error ${r.status}`);
    }
    return body as T;
}

const message = (e: unknown) => (e instanceof Error ? e.message : 'No se pudo conectar con el servidor.');

export function resource<T>(url: string) {
    let state: ResourceState<T> = { data: null, error: null };
    let checkedAt = 0;
    let inFlight: Promise<void> | null = null;
    const listeners = new Set<() => void>();
    const set = (next: ResourceState<T>) => {
        state = next;
        listeners.forEach((l) => l());
    };

    function load(): Promise<void> {
        if (inFlight) return inFlight;
        const read = getJson<T>(url)
            .then(
                (data) => set({ data, error: null }),
                (e: unknown) => {
                    // A revalidation that fails keeps showing what there is.
                    if (!state.data) set({ data: null, error: message(e) });
                },
            )
            .finally(() => {
                checkedAt = Date.now();
                inFlight = null;
            });
        inFlight = read;
        return read;
    }

    /** Only listens: what is in memory, without asking for it (the menu's counts). */
    function watch(listener: () => void) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
    }

    function subscribe(listener: () => void) {
        listeners.add(listener);
        if (!state.data && !state.error && !inFlight) void load();
        const onVisible = () => {
            if (document.visibilityState === 'visible' && Date.now() - checkedAt > REVALIDATE_MS) void load();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            listeners.delete(listener);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }

    const EMPTY: ResourceState<T> = { data: null, error: null };
    return {
        load,
        /** Reads it only if nothing is here or on the way (the idle warm-up). */
        warm: (): Promise<void> => (state.data ? Promise.resolve() : (inFlight ?? load())),
        /** What is here now (null if nothing yet), WITHOUT asking for it: who only shows a count. */
        peek: (): T | null =>
            useSyncExternalStore(
                watch,
                () => state.data,
                () => null,
            ),
        use: (): ResourceState<T> =>
            useSyncExternalStore(
                subscribe,
                () => state,
                () => EMPTY,
            ),
    };
}

/**
 * One entry per key, asked when first used; `null` key = nothing to ask. What a screen OPENS is
 * asked at once; what is only PREFETCHED waits in a queue and goes one at a time: each folder
 * detail costs the base ~0.9 s, and fifteen asked at once (the mouse crossing a table) took 7 to
 * 10 s each and hit the 8 s cap (seen 13/10/2026).
 */
export function keyed<T>(urlOf: (key: string) => string) {
    const states = new Map<string, ResourceState<T>>();
    const asked = new Set<string>();
    const listeners = new Set<() => void>();
    const notify = () => listeners.forEach((l) => l());
    /** Prefetches waiting, the next one first. */
    let queue: string[] = [];
    let running = false;
    /** Keys a screen has open now: their failure is shown even if it came from a prefetch. */
    const open = new Set<string>();

    function ask(key: string, prefetching = false): Promise<void> {
        if (asked.has(key)) return Promise.resolve();
        asked.add(key);
        return getJson<T>(urlOf(key))
            .then(
                (data) => void states.set(key, { data, error: null }),
                (e: unknown) => {
                    asked.delete(key); // opening it again tries again
                    // A failed prefetch says nothing, unless that key was opened meanwhile.
                    if (!prefetching || open.has(key)) states.set(key, { data: null, error: message(e) });
                },
            )
            .finally(notify);
    }

    // A hidden tab stops prefetching (nobody is going to open anything) and goes on when it comes back.
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => pump());

    function pump() {
        if (running || document.visibilityState === 'hidden') return;
        const key = queue.shift();
        if (key === undefined) return;
        running = true;
        void ask(key, true).finally(() => {
            running = false;
            pump();
        });
    }
    const pending = (k: string) => !asked.has(k) && !states.get(k)?.data;

    const subscribe = (l: () => void) => {
        listeners.add(l);
        return () => listeners.delete(l);
    };
    const LOADING: ResourceState<T> = { data: null, error: null };
    return {
        /** The next to prefetch (a hover): to the front of the queue. */
        prefetch(key: string) {
            if (!pending(key)) return;
            queue = [key, ...queue.filter((k) => k !== key)];
            pump();
        },
        /** What to prefetch in the background, in this order: replaces what was waiting (the list changed). */
        prefetchAll(keys: string[]) {
            queue = keys.filter(pending);
            pump();
        },
        use(key: string | null): ResourceState<T> {
            const get = () => (key ? (states.get(key) ?? LOADING) : LOADING);
            const s = useSyncExternalStore(subscribe, get, () => LOADING);
            useEffect(() => {
                if (!key) return;
                open.add(key);
                queue = queue.filter((k) => k !== key);
                void ask(key);
                return () => void open.delete(key);
            }, [key]);
            return s;
        },
    };
}
