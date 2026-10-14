'use client';

// Precios: «¿Cuánto pagamos por…?», what each product cost month by month. The port of the
// «precios» section of the Apps Script view (pintarBuscador and its controls). It does not use
// the SUNAT filters: it has its own words, mode and order.
import { useMemo, useState } from 'react';
import { findPrices, preparePrices, priceWords, type PriceMode, type PriceOrder } from '../../../modules/comprobantes/application/views.ts';
import { Empty, MoreButton, Notice, SearchBox, SectionTitle, Select } from '../../../shared/ui/bits.tsx';
import { Card, Segmented } from '../../../shared/ui/card.tsx';
import { limaDateTime, thousands } from '../../../shared/ui/format.ts';
import { Hueco } from '../../../shared/ui/hueco.tsx';
import { productsStore } from '../_lib/stores.ts';
import { ProductRow, ROW_GRID } from './product-row.tsx';

const STEP = 25;
const MODES: { value: PriceMode; label: string }[] = [
    { value: 'todo', label: 'Todas las compras' },
    { value: 'repite', label: 'Compradas en 2+ meses' },
];

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
    const [query, setQuery] = useState('');
    const [mode, setMode] = useState<PriceMode>('todo');
    const [order, setOrder] = useState<PriceOrder>('gasto');
    const [count, setCount] = useState(STEP);
    const list = useMemo(() => (all ? findPrices(all, query, mode, order) : null), [all, query, mode, order]);
    // Any change of the search shows the first 25 again.
    const reset = () => setCount(STEP);

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
            <SectionTitle title="Precios" note={data ? `leído del libro INROCONTA el ${limaDateTime(data.readAt)}` : undefined} />
            {error && <Notice>No se pudieron leer los productos comprados: {error} El detalle está en el log del servidor.</Notice>}
            <Card title="¿Cuánto pagamos por…?" note={note}>
                <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
                    <SearchBox
                        value={query}
                        onChange={(v) => (setQuery(v), reset())}
                        delay={120}
                        placeholder="Producto o proveedor: impresora, pollo brasa, tóner, cemento…"
                    />
                    <Segmented options={MODES} value={mode} onChange={(v) => (setMode(v), reset())} />
                    <Select label="Orden" value={order} onChange={(v) => (setOrder(v as PriceOrder), reset())}>
                        <option value="gasto">Más gasto</option>
                        <option value="sube">Más subió</option>
                        <option value="baja">Más bajó</option>
                        <option value="reciente">Más reciente</option>
                    </Select>
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
                            {list.slice(0, count).map((p, i) => (
                                <ProductRow key={`${i}|${p.text}`} p={p} />
                            ))}
                        </div>
                        <MoreButton shown={count} total={list.length} onMore={() => setCount(count + STEP)} />
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
