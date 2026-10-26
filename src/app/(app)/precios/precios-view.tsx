'use client';

// Precios: «¿Cuánto pagamos por…?», what each product cost month by month. The port of the
// «precios» section of the Apps Script view (pintarBuscador and its controls). It does not use
// the SUNAT filters: it has its own words, mode and order, and goes in pages of 25. All of it in
// the URL (?buscar=&compras=&orden=&pag=), for a link.
import { useMemo } from 'react';
import { findPrices, preparePrices, priceWords, type PriceMode, type PriceOrder } from '../../../modules/comprobantes/application/views.ts';
import { Empty, Notice, SearchBox, SectionTitle } from '../../../shared/ui/bits.tsx';
import { Card, Segmented } from '../../../shared/ui/card.tsx';
import { thousands } from '../../../shared/ui/format.ts';
import { Hueco } from '../../../shared/ui/hueco.tsx';
import { Pager, SortSelect, usePaged } from '../../../shared/ui/pager.tsx';
import { productsStore } from '../_lib/stores.ts';
import { urlState } from '../_lib/url-state.ts';
import { ProductRow, ROW_GRID } from './product-row.tsx';

const STEP = 25;
const ORDERS: { value: PriceOrder; label: string }[] = [
    { value: 'gasto', label: 'Más gasto' },
    { value: 'sube', label: 'Más subió' },
    { value: 'baja', label: 'Más bajó' },
    { value: 'reciente', label: 'Más reciente' },
];
const MODES: { value: PriceMode; label: string }[] = [
    { value: 'todo', label: 'Todas las compras' },
    { value: 'repite', label: 'Compradas en 2+ meses' },
];

const view$ = urlState(
    { query: '', mode: 'todo' as PriceMode, order: 'gasto' as PriceOrder, page: '1' },
    { query: 'buscar', mode: 'compras', order: 'orden', page: 'pag' },
    { mode: MODES.map((m) => m.value), order: ORDERS.map((o) => o.value) },
);

function RowsGap() {
    return (
        <div className="flex flex-col gap-3 pt-3">
            {Array.from({ length: 8 }, (_, i) => (
                <Hueco key={i} className="h-11 w-full" />
            ))}
        </div>
    );
}

export function PreciosView() {
    const { data, error } = productsStore.use();
    const all = useMemo(() => (data ? preparePrices(data.products) : null), [data]);
    const { query, mode, order } = view$.use();
    const setQuery = (q: string) => view$.set({ query: q });
    const setMode = (m: PriceMode) => view$.set({ mode: m });
    const setOrder = (o: PriceOrder) => view$.set({ order: o });
    const list = useMemo(() => (all ? findPrices(all, query, mode, order) : null), [all, query, mode, order]);
    // Any change of the search goes back to the first page.
    const paged = usePaged(list ?? [], list, STEP, view$.usePage());

    let note: React.ReactNode = null;
    if (data && list)
        note =
            (priceWords(query).length ? `${thousands(list.length)} encontrados de ` : '') +
            `${thousands(data.products.length)} productos` +
            (data.total > data.products.length ? ` (los de más gasto, de ${thousands(data.total)})` : '') +
            ' · precio unitario sin IGV';
    else if (!error) note = <Hueco className="h-3 w-72" />;

    return (
        <>
            <SectionTitle title="Precios" />
            {error && <Notice>No se pudieron leer los productos comprados: {error} El detalle está en el log del servidor.</Notice>}
            <Card title="¿Cuánto pagamos por…?" note={note}>
                <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
                    <SearchBox value={query} onChange={setQuery} delay={120} placeholder="Producto o proveedor: impresora, pollo brasa, tóner, cemento…" />
                    <Segmented options={MODES} value={mode} onChange={setMode} />
                    <SortSelect value={order} onChange={setOrder} options={ORDERS} />
                </div>
                <div className={`${ROW_GRID} hidden border-b border-control pb-2 text-[11px] font-semibold tracking-[.05em] text-ink-3 uppercase md:grid`}>
                    <span>Producto · proveedor</span>
                    <span>Compras</span>
                    <span>Último precio</span>
                    <span>Precio en el tiempo</span>
                    <span />
                </div>
                {!list ? (
                    !error && <RowsGap />
                ) : list.length ? (
                    <>
                        <div>
                            {paged.rows.map((p, i) => (
                                <ProductRow key={`${i}|${p.text}`} p={p} />
                            ))}
                        </div>
                        <Pager paged={paged} />
                    </>
                ) : (
                    <div className="px-1.5 pt-3">
                        <Empty>Nada con «{query}». Prueba con una palabra más corta o sin la marca.</Empty>
                    </div>
                )}
            </Card>
        </>
    );
}
