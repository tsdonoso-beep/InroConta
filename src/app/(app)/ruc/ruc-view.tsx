'use client';

// Consulta RUC: type a RUC and see at once its state and condition, whether it is a good
// taxpayer, a withholding or perception agent and whether SUNAT lists it as SSCO; or part of a
// name to pick one. From Resumen's warning (?ssco=1) it lists the received invoices from SSCO
// suppliers. The port of VistaConsultaRuc.html (paintRuc, nameMatches, showSscoHits).
import { useMemo } from 'react';
import { isRuc, rucsByName } from '../../../modules/ruc/application/views.ts';
import { Empty, SearchBox } from '../../../shared/ui/bits.tsx';
import { Card } from '../../../shared/ui/card.tsx';
import { Hueco } from '../../../shared/ui/hueco.tsx';
import { useDocs } from '../_comprobantes/docs-store.ts';
import { PageHeader } from '../_comprobantes/page-header.tsx';
import { useRucIndex, type RucIndex } from '../_lib/stores.ts';
import { DocsTable } from '../_ruc/docs-table.tsx';
import { useSscoHits } from '../_ruc/ssco-warning.tsx';
import { RucListsError } from '../_ruc/taxpayer-card.tsx';
import { setRucQuery, useRucQuery } from './query-store.ts';
import { RucResult } from './ruc-result.tsx';

function NameMatches({ q, idx }: { q: string; idx: RucIndex }) {
    const { snapshot, error } = useDocs();
    const found = useMemo(() => rucsByName(q, snapshot?.docs ?? [], idx.lists?.ssco ?? null), [q, snapshot, idx.lists]);
    // Wait for both lists: «ningún RUC» must not be said while one is still travelling.
    if ((!snapshot && !error) || (!idx.ready && !idx.error))
        return (
            <div className="flex flex-wrap gap-2">
                {[0, 1, 2].map((i) => (
                    <Hueco key={i} className="h-12 w-56 rounded-[10px]" />
                ))}
            </div>
        );
    if (!found.length) return <Empty>Ningún RUC con «{q}» en nuestros comprobantes ni en la lista SSCO.</Empty>;
    return (
        <div className="flex flex-wrap gap-2">
            {found.map((f) => (
                <button
                    key={f.ruc}
                    type="button"
                    onClick={() => setRucQuery(f.ruc)}
                    className="rounded-[10px] border border-control bg-surface px-2.5 py-[7px] text-left hover:border-primary"
                >
                    <b>{f.name || f.ruc}</b>
                    <div className="text-xs text-ink-3">
                        RUC {f.ruc}
                        {f.inSsco && ' · en la lista SSCO'}
                    </div>
                </button>
            ))}
        </div>
    );
}

function SscoDocs() {
    const hits = useSscoHits();
    const { error } = useDocs();
    const idx = useRucIndex();
    return (
        <Card title="Comprobantes recibidos de proveedores SSCO">
            {hits ? (
                hits.docs.length ? (
                    <DocsTable docs={hits.docs} withProvider />
                ) : (
                    <Empty>Ningún comprobante recibido de proveedores SSCO.</Empty>
                )
            ) : error || idx.error ? null : idx.ready && !idx.sscoLoaded ? (
                <Empty>Lista SSCO: todavía no cargada en la base.</Empty>
            ) : (
                <div className="flex flex-col gap-2">
                    {[0, 1, 2, 3].map((i) => (
                        <Hueco key={i} className="h-8 w-full" />
                    ))}
                </div>
            )}
        </Card>
    );
}

function Result({ q, ssco, idx }: { q: string; ssco: boolean; idx: RucIndex }) {
    const { snapshot } = useDocs();
    const text = q.trim();
    if (!text) return ssco ? <SscoDocs /> : <p className="px-1.5 py-3.5 text-[13px] text-ink-3">Escribe un RUC (11 dígitos) o parte de una razón social.</p>;
    if (isRuc(text)) return <RucResult ruc={text} all={snapshot?.docs ?? null} idx={idx} />;
    if (text.replace(/\s/g, '').length < 3) return null;
    return <NameMatches q={text} idx={idx} />;
}

export function RucView() {
    const { q, ssco } = useRucQuery();
    const idx = useRucIndex();
    return (
        <>
            <PageHeader title="Consulta RUC" />
            <RucListsError error={idx.error} />
            <Card className="mb-3.5" note="Condición en SUNAT, retención, percepción, buen contribuyente y lista SSCO, sin salir de aquí">
                <SearchBox value={q} onChange={setRucQuery} inputMode="numeric" className="w-full" placeholder="RUC (11 dígitos) o razón social" />
            </Card>
            <Result q={q} ssco={ssco} idx={idx} />
        </>
    );
}
