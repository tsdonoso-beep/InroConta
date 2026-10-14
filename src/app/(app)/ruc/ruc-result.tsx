'use client';

// What Consulta RUC shows for one RUC: its card, whether it is in the SSCO list, the full SUNAT
// ficha and its documents with us. The port of rucCard (VistaConsultaRuc.html).
import { useMemo } from 'react';
import { docsOfRuc, type Doc } from '../../../modules/comprobantes/application/views.ts';
import type { SscoEntry } from '../../../modules/ruc/application/views.ts';
import { Card } from '../../../shared/ui/card.tsx';
import { dmy, thousands } from '../../../shared/ui/format.ts';
import { Hueco } from '../../../shared/ui/hueco.tsx';
import type { RucIndex } from '../_lib/stores.ts';
import { DocsTable } from '../_ruc/docs-table.tsx';
import { SunatFichaCard } from '../_ruc/sunat-ficha.tsx';
import { TaxpayerCardGap, TaxpayerCardView } from '../_ruc/taxpayer-card.tsx';

const SHOWN = 30;
const BOX = 'rounded-xl border px-3.5 py-3 text-[13.5px]';

function SscoBox({ entry, idx }: { entry: SscoEntry | null | undefined; idx: RucIndex }) {
    if (!idx.ready && !idx.error) return <Hueco className="h-12 w-full rounded-xl" />;
    if (!idx.sscoLoaded) return <div className={`${BOX} border-line bg-surface-2`}>Lista SSCO: todavía no cargada en la base.</div>;
    if (!entry)
        return (
            <div className={`${BOX} border-success-strong bg-success-soft`}>
                ✓ No está en la lista de sujetos sin capacidad operativa (SUNAT, al {idx.sscoListDate}).
            </div>
        );
    return (
        <div className={`${BOX} border-danger bg-danger-soft`}>
            <b>⚠ Sujeto sin capacidad operativa (SSCO)</b>
            <div className="text-[13px] leading-[1.45] text-ink-2">
                {entry.resolution} · emitida el {dmy(entry.resolutionDate)}, firme el {dmy(entry.finalDate)} · publicada el {dmy(entry.publishedOn)}
            </div>
            {entry.representative && <div className="text-xs text-ink-3">Representante legal: {entry.representative}</div>}
            <div className="text-xs text-ink-3">Sus comprobantes no sustentan crédito fiscal ni gasto.</div>
        </div>
    );
}

/** `all` null = the documents are still travelling (or failed: the header says so). */
export function RucResult({ ruc, all, idx }: { ruc: string; all: Doc[] | null; idx: RucIndex }) {
    const docs = useMemo(() => (all ? docsOfRuc(all, ruc) : []), [all, ruc]);
    const entry = idx.ssco(ruc);
    const name = docs[0]?.name || entry?.name || '';
    return (
        <div className="flex flex-col gap-3.5">
            {all ? (
                <TaxpayerCardView
                    ruc={ruc}
                    name={name}
                    idx={idx}
                    className=""
                    missing={
                        docs.length
                            ? 'Todavía sin ficha de SUNAT: el robot la trae en su próxima corrida.'
                            : 'No tenemos comprobantes con este RUC, así que el robot no consulta su condición en SUNAT. La lista SSCO de abajo sí cubre todo el país.'
                    }
                />
            ) : (
                <TaxpayerCardGap className="" />
            )}
            <SscoBox entry={entry} idx={idx} />
            <SunatFichaCard ruc={ruc} />
            {docs.length > 0 && (
                <Card title={`${thousands(docs.length)} comprobantes con nosotros`} note={docs.length > SHOWN ? `los ${SHOWN} más recientes` : undefined}>
                    <DocsTable docs={docs.slice(0, SHOWN)} withProvider={false} />
                </Card>
            )}
        </div>
    );
}
