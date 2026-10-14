'use client';

// Resumen: the KPIs, the bars by month and the donut by type. The port of the «resumen»
// section of the Apps Script view. Everything is drawn at once; only the numbers wait for the
// documents (read once per tab, docs-store.ts).
import { kindSlices, monthBars } from '../../../modules/comprobantes/application/views.ts';
import { Card } from '../../../shared/ui/card.tsx';
import { Donut, DonutGap, MonthBars, MonthBarsGap } from '../_comprobantes/charts.tsx';
import { FilterBar } from '../_comprobantes/filters.tsx';
import { DetractionKpi, IgvKpi, KpiGrid, NotesKpi, PartiesKpi, TotalKpi } from '../_comprobantes/kpi-cards.tsx';
import { PageHeader } from '../_comprobantes/page-header.tsx';
import { useSunatView } from '../_comprobantes/use-sunat-view.ts';
import { SscoWarning } from '../_ruc/ssco-warning.tsx';

export function ResumenView() {
    const v = useSunatView();
    const { k, cur, buying, months, ready } = v;
    return (
        <>
            <PageHeader title="Resumen" />
            <FilterBar {...v.bar} />
            <SscoWarning />
            <KpiGrid>
                <TotalKpi k={k} buying={buying} cur={cur} months={months} lit={v.lit} />
                <PartiesKpi k={k} buying={buying} cur={cur} />
                <NotesKpi k={k} cur={cur} />
                <IgvKpi k={k} cur={cur} />
                <DetractionKpi k={k} />
            </KpiGrid>
            <div className="grid gap-3.5 lg:grid-cols-[1.55fr_1fr]">
                <Card title={`${buying ? 'Compras' : 'Ventas'} por mes`} note="Clic en un mes para filtrar · notas de crédito restadas">
                    {ready ? (
                        <MonthBars bars={monthBars(v.all, months)} lit={v.lit} currency={cur} onPick={(m) => v.set({ period: m ? `m${m}` : '' })} />
                    ) : (
                        <MonthBarsGap />
                    )}
                </Card>
                <Card title="Por tipo de comprobante" note="monto sin signo">
                    {ready ? <Donut slices={kindSlices(v.shown)} count={v.shown.length} currency={cur} /> : <DonutGap />}
                </Card>
            </div>
        </>
    );
}
