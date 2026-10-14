'use client';

import { useEffect } from 'react';
import { loadDocs } from './docs-store.ts';

/**
 * Starts reading the documents as soon as the frame hydrates, whatever the screen: the first
 * SUNAT screen opened finds them on the way or already here. The read itself was already asked
 * for by the preload in the layout's <head>, so this one takes it from the browser's cache.
 */
export function DocsWarmup() {
    useEffect(() => {
        void loadDocs();
    }, []);
    return null;
}
