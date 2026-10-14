'use client';

// What is not on screen, read while the browser has nothing to do (idle-time prefetching): once
// the documents of the screen are here, the reads of the other screens start, so they open with
// their data (kept in this tab's memory, never in localStorage) and the menu shows its counts.
// Never on a connection that asks to save data. Each read happens once per tab (resource.ts); the
// server keeps them 10 min.
import { useEffect } from 'react';
import { loadDocs } from '../_comprobantes/docs-store.ts';
import { changesStore, detractionsStore, foldersStore, noOcStore, rucStore } from '../_lib/stores.ts';

const idle = (fn: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 5000 }) : setTimeout(fn, 1500));

export function IdleWarmup() {
    useEffect(() => {
        const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
        if (saveData) return;
        let live = true;
        // One after the other, the lightest first (changes ~0.3 s, invoices ~1.7 s, detractions
        // ~1.5 s, RUC cards ~2.5 s, folders ~3.5 s in the base): at once they slowed each other down
        // to 6 s and 7 s (measured 13/10/2026).
        void loadDocs().then(() =>
            idle(() => {
                if (!live) return;
                void changesStore
                    .warm()
                    .then(() => (live ? noOcStore.warm() : undefined))
                    .then(() => (live ? detractionsStore.warm() : undefined))
                    .then(() => (live ? rucStore.warm() : undefined))
                    .then(() => (live ? foldersStore.warm() : undefined));
            }),
        );
        return () => {
            live = false;
        };
    }, []);
    return null;
}
