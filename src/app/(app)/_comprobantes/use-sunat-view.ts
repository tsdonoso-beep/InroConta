'use client';

// What every section with the SUNAT filters needs: the documents (from the tab's store), the
// filters, the documents they leave and the KPIs, computed once per change. `k` is null while
// the documents travel: the screens draw their real cards with gaps meanwhile.
import { useMemo } from 'react';
import { ALL_IN_PEN, kpis, monthsOf, ofPeriod, periodMonths, scope, type Doc } from '../../../modules/comprobantes/application/views.ts';
import { parsePeriod, periodLabel } from '../../../shared/period.ts';
import { symbol, thousands } from '../../../shared/ui/format.ts';
import { useDocs } from './docs-store.ts';
import { useFilters } from './filters.tsx';

const NONE: Doc[] = [];

export function useSunatView() {
    const { snapshot, error } = useDocs();
    const docs = snapshot?.docs ?? NONE;
    const ready = snapshot !== null;
    const months = useMemo(() => monthsOf(docs), [docs]);
    const [f, set, currencies] = useFilters(docs);
    const all = useMemo(() => scope(docs, f), [docs, f]);
    const shown = useMemo(() => ofPeriod(all, f.period), [all, f.period]);
    const k = useMemo(() => (ready ? kpis(all, shown, months, f.period) : null), [ready, all, shown, months, f.period]);
    /** The months the period lights in the charts ([] = everything). */
    const lit = useMemo(() => periodMonths(f.period), [f.period]);
    const buying = f.origin === 'compra';
    // «Todo en S/» shows soles.
    const cur = f.currency === ALL_IN_PEN ? 'PEN' : f.currency;
    const withoutRate = f.currency === ALL_IN_PEN ? ofPeriod(docs, f.period).filter((d) => d.origin === f.origin && d.totalPen == null).length : 0;
    const summary = ready
        ? `${buying ? 'Compras' : 'Ventas'} en ${f.currency === ALL_IN_PEN ? 'S/ (todas las monedas)' : symbol(cur)} · ` +
          `${f.period ? periodLabel(parsePeriod(f.period)) : 'todo el período'} · ${thousands(shown.length)} comprobantes` +
          (withoutRate ? ` · ${withoutRate} sin tipo de cambio, no sumados` : '')
        : '';
    const canAllInPen = useMemo(() => docs.some((d) => d.totalPen != null && d.currency !== 'PEN'), [docs]);
    return {
        snapshot,
        error,
        ready,
        months,
        lit,
        f,
        set,
        all,
        shown,
        k,
        buying,
        cur,
        bar: { filters: f, set, months, currencies, canAllInPen, summary, ready },
    };
}
