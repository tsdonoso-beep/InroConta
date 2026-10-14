'use client';

// The counts of the menu, by section key, from what is already in this tab's memory (the documents
// and the stores the idle warm-up fills): nothing is asked for them. undefined while a read
// travels: the badge appears when it arrives, on the right of its item (it moves nothing).
import { useMemo } from 'react';
import { toCorrect } from '../../../modules/detracciones/application/views.ts';
import { highNoOcCount, incompleteCount, lastReadChanges, type MenuCount } from '../../../modules/legajo/application/views.ts';
import { useDocs } from '../_comprobantes/docs-store.ts';
import { changesStore, detractionsStore, foldersStore, noOcStore } from '../_lib/stores.ts';
import { usePeekSscoHits } from '../_ruc/ssco-warning.tsx';

export type BadgeTone = 'danger' | 'muted' | 'info';
export type MenuBadges = Partial<Record<string, MenuCount & { tone: BadgeTone }>>;

export function useMenuBadges(): MenuBadges {
    const docs = useDocs().snapshot?.docs;
    // peek: the menu only looks at what is in memory; asking is the idle warm-up's job (idle-warmup.tsx).
    const folders = foldersStore.peek();
    const noOc = noOcStore.peek();
    const changes = changesStore.peek();
    const detractions = detractionsStore.peek();
    const ssco = usePeekSscoHits();
    return useMemo(() => {
        const review = docs?.filter((d) => d.origin === 'compra' && d.detractionIssue).length;
        const fix = detractions?.proofs.filter((p) => toCorrect(p.case)).length;
        const sscoDocs = ssco?.docs.length;
        return {
            impuestos: review === undefined ? undefined : { count: review, title: `${review} detracciones a revisar`, tone: 'danger' },
            detracciones:
                fix === undefined
                    ? undefined
                    : { count: fix, title: `${fix} constancias para corregir (el monto no cuadra con la factura, o no hay factura)`, tone: 'danger' },
            ruc: sscoDocs === undefined ? undefined : { count: sscoDocs, title: `${sscoDocs} comprobantes recibidos de proveedores SSCO`, tone: 'danger' },
            legajo: folders ? { ...incompleteCount(folders.folders), tone: 'muted' } : undefined,
            sinoc: noOc ? { ...highNoOcCount(noOc.noOc), tone: 'danger' } : undefined,
            cambios: changes ? { ...lastReadChanges(changes.changes), tone: 'info' } : undefined,
        };
    }, [docs, folders, noOc, changes, detractions, ssco]);
}
