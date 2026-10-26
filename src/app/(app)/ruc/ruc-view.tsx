'use client';

// Consulta RUC: type a RUC and see at once its state and condition, whether it is a good
// taxpayer, a withholding or perception agent and whether SUNAT lists it as SSCO; or part of a
// name (or nothing) to search, filter and sort every RUC with us (all-rucs.tsx). A RUC opened from
// the list has «‹ Volver» back to it. From Resumen's warning (?ssco=1) it lists the received
// invoices from SSCO suppliers. The port of VistaConsultaRuc.html (paintRuc, nameMatches, showSscoHits).
import { isRuc } from '../../../modules/ruc/application/views.ts';
import { Empty, SearchBox } from '../../../shared/ui/bits.tsx';
import { Button } from '../../../shared/ui/button.tsx';
import { Card } from '../../../shared/ui/card.tsx';
import { Hueco } from '../../../shared/ui/hueco.tsx';
import { useDocs } from '../_comprobantes/docs-store.ts';
import { PageHeader } from '../_comprobantes/page-header.tsx';
import { useRucIndex, type RucIndex } from '../_lib/stores.ts';
import { DocsTable } from '../_ruc/docs-table.tsx';
import { useSscoHits } from '../_ruc/ssco-warning.tsx';
import { RucListsError } from '../_ruc/taxpayer-card.tsx';
import { AllRucs } from './all-rucs.tsx';
import { leaveRuc, setRucQuery, useRucQuery } from './query-store.ts';
import { RucResult } from './ruc-result.tsx';

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

function Result({ q, ssco, opened, idx }: { q: string; ssco: boolean; opened: boolean; idx: RucIndex }) {
    const { snapshot } = useDocs();
    const text = q.trim();
    if (!text && ssco) return <SscoDocs />;
    if (!isRuc(text)) return <AllRucs q={text} />;
    return (
        <>
            <Button variant="secondary" onClick={leaveRuc} className="mb-3.5">
                ‹ {opened ? 'Volver a la lista' : 'Ver todos los RUC'}
            </Button>
            <RucResult ruc={text} all={snapshot?.docs ?? null} idx={idx} />
        </>
    );
}

export function RucView() {
    const { q, ssco, opened } = useRucQuery();
    const idx = useRucIndex();
    return (
        <>
            <PageHeader title="Consulta RUC" />
            <RucListsError error={idx.error} />
            <Card className="mb-3.5" note="Condición en SUNAT, retención, percepción, buen contribuyente y lista SSCO, sin salir de aquí">
                <SearchBox value={q} onChange={setRucQuery} inputMode="numeric" className="w-full" placeholder="RUC (11 dígitos) o razón social" />
            </Card>
            <Result q={q} ssco={ssco} opened={opened} idx={idx} />
        </>
    );
}
