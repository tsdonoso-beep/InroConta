'use client';

// The bar of the SUNAT filters (period, compras/ventas, currency, search) and the hook that turns
// the tab's filter store (filter-store.ts) into Filters for the screens. A filter asks the server
// for nothing.
import { useMemo } from 'react';
import { ALL_IN_PEN, currencies, type Doc, type Filters, type Origin } from '../../../modules/comprobantes/application/views.ts';
import { SearchBox } from '../../../shared/ui/bits.tsx';
import { Segmented } from '../../../shared/ui/card.tsx';
import { symbol } from '../../../shared/ui/format.ts';
import { PeriodPicker } from '../../../shared/ui/period-picker.tsx';
import { setFilters, useFilterState } from './filter-store.ts';

export function useFilters(docs: Doc[]): [Filters, (patch: Partial<Filters>) => void, string[]] {
    const s = useFilterState();
    const options = useMemo(() => currencies(docs), [docs]);
    const filters: Filters = {
        origin: s.origen === 'venta' ? 'venta' : 'compra',
        currency: s.moneda || options[0] || 'PEN',
        period: s.per,
        text: s.q,
    };
    const set = (patch: Partial<Filters>) => {
        const next: Partial<{ origen: string; moneda: string; per: string; q: string }> = {};
        if ('origin' in patch) next.origen = patch.origin === 'venta' ? 'venta' : '';
        if ('currency' in patch) next.moneda = patch.currency === options[0] ? '' : (patch.currency ?? '');
        if ('period' in patch) next.per = patch.period ?? '';
        if ('text' in patch) next.q = patch.text ?? '';
        setFilters(next);
    };
    return [filters, set, options];
}

export function FilterBar({
    filters,
    set,
    months,
    currencies: options,
    canAllInPen,
    summary,
    ready,
}: {
    filters: Filters;
    set: (p: Partial<Filters>) => void;
    months: string[];
    currencies: string[];
    canAllInPen: boolean;
    summary: string;
    ready: boolean;
}) {
    // Before the documents arrive the bar is drawn for real, inert: S/ is the currency of almost
    // every document, so it is the state to draw (GRAMA: draw the majority state of a control).
    const shown = ready ? options : ['PEN'];
    const currencyOptions: { value: string; label: string; title?: string }[] = shown.map((c) => ({ value: c, label: symbol(c) }));
    if (canAllInPen)
        currencyOptions.push({ value: ALL_IN_PEN, label: 'Todo en S/', title: 'Soles, dólares y euros juntos, con el tipo de cambio de cada comprobante' });
    return (
        <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
            <PeriodPicker value={filters.period} onChange={(period) => set({ period })} months={months} disabled={!ready} />
            <Segmented<Origin>
                options={[
                    { value: 'compra', label: 'Compras' },
                    { value: 'venta', label: 'Ventas' },
                ]}
                value={filters.origin}
                onChange={(origin) => set({ origin })}
            />
            <Segmented options={currencyOptions} value={filters.currency} onChange={(currency) => set({ currency })} />
            <SearchBox
                value={filters.text}
                onChange={(text) => set({ text })}
                placeholder="Proveedor, RUC, F001-123, OC o centro de costo"
                className="max-w-[340px]"
            />
            <button
                type="button"
                onClick={() => set({ period: '', origin: 'compra', text: '' })}
                className="px-1 py-1.5 text-[12.5px] font-semibold text-primary"
            >
                Quitar filtros
            </button>
            <span className="ml-auto text-xs text-ink-2">{summary}</span>
        </div>
    );
}
