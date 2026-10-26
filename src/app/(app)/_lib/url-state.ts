'use client';

// The filters, the order and the page of a screen, mirrored in the URL so a shared link opens the
// screen as it was seen (each value under its own Spanish name: ?estado=OK&orden=amount-desc&pag=3).
// Like _comprobantes/filter-store.ts: history.replaceState to write (nothing is asked to the
// server: the lists are in the browser) and its own subscribers to read back. Only what differs
// from the default goes in the URL. Read from the URL when the screen mounts and on popstate (the
// browser's back button); a screen opened without any of its values gets back what it had in this
// tab (unless `remember` is off), and the URL is completed with it. Changing anything but a page
// goes back to page 1 (every key whose name starts with «page» is a page: a screen may have two lists).
import { useSyncExternalStore } from 'react';

type Values = Record<string, string>;

export interface UrlState<T extends Values> {
    use(): T;
    set(patch: Partial<T>): void;
    /** Everything back to the defaults. */
    reset(): void;
    /** The page of one of the screen's lists (`page` by default), as usePaged's `control`. */
    usePage(key?: keyof T & string): { page: number; setPage: (p: number) => void };
}

/**
 * `params`: the URL name of every value. `allowed`: the values a key may take (a choice list), so a
 * link typed by hand or from an older version falls back to the default instead of breaking.
 * A `page…` key is a list's page. `remember` off: a list of one thing (the
 * documents of one RUC) that must not carry the filters of the last one into the next.
 */
export function urlState<T extends Values>(
    defaults: T,
    params: { [K in keyof T]: string },
    allowed: { [K in keyof T]?: readonly string[] } = {},
    remember = true,
): UrlState<T> {
    const keys = Object.keys(defaults) as (keyof T & string)[];
    const pageKeys = keys.filter((k) => k.startsWith('page'));
    let state: T | null = null;
    let saved: T | null = null;
    const listeners = new Set<() => void>();

    const valid = (k: keyof T, v: string) => !allowed[k] || allowed[k]!.includes(v);

    function fromUrl(): T {
        const q = new URLSearchParams(window.location.search);
        if (saved && keys.every((k) => !q.has(params[k]))) return saved;
        const out = { ...defaults };
        for (const k of keys) {
            const v = q.get(params[k]);
            if (v !== null && valid(k, v)) out[k] = v as T[typeof k];
        }
        return out;
    }

    function write() {
        const q = new URLSearchParams(window.location.search);
        for (const k of keys) {
            if (state![k] === defaults[k]) q.delete(params[k]);
            else q.set(params[k], state![k]);
        }
        const s = q.toString();
        const url = s ? `${window.location.pathname}?${s}` : window.location.pathname;
        // The entry's state is kept: Consulta RUC marks there a RUC opened from its list.
        if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, '', url);
    }

    const notify = () => listeners.forEach((l) => l());
    // Back or forward: that entry's URL says it all (without values = the defaults, not this tab's).
    const onPop = () => {
        saved = null;
        state = fromUrl();
        if (remember) saved = state;
        notify();
    };

    function subscribe(listener: () => void) {
        if (!listeners.size) {
            state = fromUrl();
            if (remember) saved = state;
            write();
            window.addEventListener('popstate', onPop);
        }
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
            if (listeners.size) return;
            window.removeEventListener('popstate', onPop);
            state = null;
        };
    }

    function set(patch: Partial<T>) {
        const next = { ...(state ?? fromUrl()), ...patch };
        // A filter or an order changed (not only a page): every list starts again on page 1.
        if (Object.keys(patch).some((k) => !pageKeys.includes(k))) for (const k of pageKeys) if (!(k in patch)) next[k] = defaults[k];
        state = next;
        if (remember) saved = next;
        write();
        notify();
    }

    function use(): T {
        return useSyncExternalStore(
            subscribe,
            () => (state ??= fromUrl()),
            () => defaults,
        );
    }

    return {
        use,
        set,
        reset: () => set({ ...defaults }),
        usePage(key = 'page') {
            const page = Number(use()[key]) || 1;
            return { page, setPage: (p: number) => set({ [key]: String(p) } as Partial<T>) };
        },
    };
}
