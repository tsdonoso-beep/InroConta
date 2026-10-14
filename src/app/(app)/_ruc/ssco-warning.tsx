'use client';

// The warning on Resumen: received invoices from suppliers in SUNAT's SSCO list. The port of
// paintSscoWarning (VistaConsultaRuc.html). Over every document of the year, not the filters,
// like the old one; it appears only once both the documents and the list are here.
import Link from 'next/link';
import { useMemo } from 'react';
import { sscoHits } from '../../../modules/ruc/application/views.ts';
import { Card } from '../../../shared/ui/card.tsx';
import { thousands } from '../../../shared/ui/format.ts';
import { useDocs } from '../_comprobantes/docs-store.ts';
import { usePeekRucIndex, useRucIndex } from '../_lib/stores.ts';

const BUTTON =
    'inline-flex items-center rounded-[10px] bg-ink px-[18px] py-[11px] text-[13.5px] font-semibold whitespace-nowrap text-white shadow-card hover:opacity-90';

/** The received documents from SSCO suppliers; null while the documents or the list travel. */
export function useSscoHits() {
    const { snapshot } = useDocs();
    const idx = useRucIndex();
    return useMemo(() => (snapshot && idx.sscoLoaded ? sscoHits(snapshot.docs, idx.ssco) : null), [snapshot, idx]);
}

/** The same with the SSCO list only if it is already in memory, without asking for it (the menu's count). */
export function usePeekSscoHits() {
    const { snapshot } = useDocs();
    const idx = usePeekRucIndex();
    return useMemo(() => (snapshot && idx.sscoLoaded ? sscoHits(snapshot.docs, idx.ssco) : null), [snapshot, idx]);
}

export function SscoWarning() {
    const hits = useSscoHits();
    const { sscoListDate } = useRucIndex();
    if (!hits?.docs.length) return null;
    return (
        <Card
            className="mb-4 border-l-4 border-l-danger"
            title={`⚠ ${thousands(hits.docs.length)} comprobantes recibidos de ${thousands(hits.suppliers)} proveedores sin capacidad operativa (SSCO)`}
            note={`${thousands(hits.afterFinal)} emitidos después de que su atribución quedó firme · lista de SUNAT al ${sscoListDate}`}
        >
            <p className="mb-3 text-[13px] leading-[1.45] text-ink-2">
                SUNAT considera que estos proveedores no pudieron realizar lo que facturan: sus comprobantes no sustentan crédito fiscal ni gasto.
            </p>
            <Link href="/ruc?ssco=1" className={BUTTON}>
                Ver en Consulta RUC
            </Link>
        </Card>
    );
}
