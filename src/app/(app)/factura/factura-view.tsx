'use client';

// Buscar factura: any document of the year (compras and ventas, no filters) by series-number,
// RUC, number, amount or words; the supplier's card on top when all are of one. The port of the
// «factura» section and buscarFacturas (VistaEjecutivaPagina.html). Every match, with the filters of
// Consulta RUC (date, kind, amount, order) over them and in pages: all in memory, one page drawn.
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { searchDocs, type Doc } from '../../../modules/comprobantes/application/views.ts';
import { SearchBox } from '../../../shared/ui/bits.tsx';
import { Card } from '../../../shared/ui/card.tsx';
import { Pager, usePaged } from '../../../shared/ui/pager.tsx';
import { useDocs } from '../_comprobantes/docs-store.ts';
import { PageHeader } from '../_comprobantes/page-header.tsx';
import { useRucIndex, type RucIndex } from '../_lib/stores.ts';
import { DocFilters, listTitle, useDocList } from '../_ruc/docs-list.tsx';
import { RucListsError, TaxpayerCardView } from '../_ruc/taxpayer-card.tsx';
import { InvoiceRow, InvoiceRowGap } from './invoice-row.tsx';

const EXAMPLES = ['F216-777773', 'DHL', '20101128777', '43.64'];
const keyOf = (d: Doc) => `${d.ruc}|${d.kind}|${d.number}|${d.origin}`;

function Examples({ onPick }: { onPick: (q: string) => void }) {
    return (
        <div className="mt-1 flex flex-wrap gap-2">
            <span className="self-center text-xs text-ink-3">Prueba:</span>
            {EXAMPLES.map((e) => (
                <button
                    key={e}
                    type="button"
                    onClick={() => onPick(e)}
                    className="rounded-lg border border-line bg-surface-2 px-2.5 py-[5px] text-[12.5px] text-ink-2 hover:border-primary hover:text-primary-strong"
                >
                    {e}
                </button>
            ))}
        </div>
    );
}

function Results({ docs, query, idx }: { docs: Doc[]; query: string; idx: RucIndex }) {
    const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
    const r = useMemo(() => searchDocs(docs, query), [docs, query]);
    const found = useMemo(() => r?.found ?? [], [r]);
    const state = useDocList(found);
    const paged = usePaged(state.list, state.filter);
    if (!r) return null;
    const { title, sums } = listTitle(state, r.total, r.total === 1 ? 'comprobante' : 'comprobantes');
    const toggle = (k: string) =>
        setOpen((s) => {
            const next = new Set(s);
            if (!next.delete(k)) next.add(k);
            return next;
        });
    return (
        <>
            {r.single && <TaxpayerCardView ruc={r.single.ruc} name={r.single.name} idx={idx} />}
            {r.total ? (
                <>
                    <p className="mt-0.5 mb-2.5 text-xs text-ink-3">
                        {title}
                        {sums && ` · ${sums}`}
                    </p>
                    {r.total > 1 && <DocFilters docs={found} state={state} />}
                    <div className="mt-1 flex flex-col">
                        {paged.rows.map((d) => (
                            <InvoiceRow key={keyOf(d)} d={d} idx={idx} open={open.has(keyOf(d))} onToggle={() => toggle(keyOf(d))} />
                        ))}
                        {!paged.total && <p className="px-1 py-2.5 text-[13px] text-ink-3">Ningún comprobante con esos filtros.</p>}
                    </div>
                    <Pager paged={paged} />
                </>
            ) : (
                <p className="px-1 py-2.5 text-[13px] text-ink-3">
                    No hay comprobantes con «{query.trim()}». Prueba solo con el número o con el RUC. Para buscar por producto (lo que dice dentro de la
                    factura), usa <Link href="/precios">Precios</Link>.
                </p>
            )}
        </>
    );
}

export function FacturaView() {
    const { snapshot, error } = useDocs();
    const idx = useRucIndex();
    const [query, setQuery] = useState('');
    return (
        <>
            <PageHeader title="Buscar factura" />
            <RucListsError error={idx.error} />
            <Card
                className="border-primary-line"
                title="Buscar una factura"
                note="En todo el año, compras y ventas (sin filtros) · funciona aunque SUNAT esté caída"
            >
                <SearchBox
                    value={query}
                    onChange={setQuery}
                    delay={120}
                    className="mb-3 w-full"
                    placeholder="F001-123, número, RUC, proveedor o monto (ej.: 43.64)"
                />
                {!query.trim() ? (
                    <Examples onPick={setQuery} />
                ) : snapshot ? (
                    // Keyed by the search: a new search closes the open invoices, as the old one did.
                    <Results key={query} docs={snapshot.docs} query={query} idx={idx} />
                ) : (
                    !error && [0, 1, 2].map((i) => <InvoiceRowGap key={i} />)
                )}
            </Card>
        </>
    );
}
