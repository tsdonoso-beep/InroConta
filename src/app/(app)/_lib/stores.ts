'use client';

// The tab's stores of everything that is not the documents (those are _comprobantes/docs-store.ts):
// each one is read once per tab, the first time a screen uses it, and shared by every screen.
import { useMemo } from 'react';
import type { DocumentLines, ProductList } from '../../../modules/comprobantes/application/views.ts';
import type { Detractions } from '../../../modules/detracciones/application/views.ts';
import type { ChangesRead, FolderDetail, FoldersRead, NoOcRead } from '../../../modules/legajo/application/views.ts';
import type { RucLists, SscoEntry, SunatFicha, TaxpayerCard } from '../../../modules/ruc/application/views.ts';
import { keyed, resource } from './resource.ts';

export const foldersStore = resource<FoldersRead>('/api/legajo/carpetas');
export const noOcStore = resource<NoOcRead>('/api/legajo/sin-oc');
export const changesStore = resource<ChangesRead>('/api/legajo/cambios');
export const detractionsStore = resource<Detractions>('/api/detracciones');
export const rucStore = resource<RucLists>('/api/ruc');
export const productsStore = resource<ProductList & { readAt: string }>('/api/comprobantes/productos');

export const folderStore = keyed<FolderDetail>((id) => `/api/legajo/carpeta/${encodeURIComponent(id)}`);
export const fichaStore = keyed<{ ficha: SunatFicha | null }>((ruc) => `/api/ruc/${encodeURIComponent(ruc)}`);
/** Key: «ruc|serie|numero». */
export const linesStore = keyed<DocumentLines>((key) => {
    const [ruc, serie, numero] = key.split('|');
    return `/api/comprobantes/lineas?${new URLSearchParams({ ruc, serie, numero })}`;
});

export interface RucIndex {
    /** null while the lists travel or if they failed: nothing is claimed about a RUC then. */
    card: (ruc: string) => TaxpayerCard | null;
    /** null = the list is not loaded (never say «not in the list» then); undefined = not in it. */
    ssco: (ruc: string) => SscoEntry | null | undefined;
    sscoLoaded: boolean;
    /** The date of the SSCO list (the last published entry), dd/mm/yyyy. */
    sscoListDate: string;
    ready: boolean;
    error: string | null;
    lists: RucLists | null;
}

/** The RUC cards and the SSCO list, indexed by RUC (asked for if they are not here yet). */
export function useRucIndex(): RucIndex {
    const { data, error } = rucStore.use();
    return useIndexed(data, error);
}

/** The same, only with what is already in memory, without asking (the menu's counts). */
export function usePeekRucIndex(): RucIndex {
    return useIndexed(rucStore.peek(), null);
}

function useIndexed(data: RucLists | null, error: string | null): RucIndex {
    return useMemo(() => {
        const cards = new Map((data?.cards ?? []).map((c) => [c.ruc, c]));
        const ssco = data?.ssco ? new Map(data.ssco.map((s) => [s.ruc, s])) : null;
        const last = (data?.ssco ?? []).reduce((m, s) => (s.publishedOn > m ? s.publishedOn : m), '');
        return {
            card: (ruc) => cards.get(ruc) ?? null,
            ssco: (ruc) => (ssco ? ssco.get(ruc) : null),
            sscoLoaded: !!ssco,
            sscoListDate: /^\d{4}-\d{2}-\d{2}$/.test(last) ? `${last.slice(8)}/${last.slice(5, 7)}/${last.slice(0, 4)}` : '',
            ready: !!data,
            error,
            lists: data,
        };
    }, [data, error]);
}
