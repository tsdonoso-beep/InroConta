'use client';

// Proveedores: the supplier × month heat map and the main suppliers of the period. The port of
// the «proveedores» section of the Apps Script view (pintarCalor and pintarTop).
import { heatMap, topParties, type Doc } from '../../../modules/comprobantes/application/views.ts';
import { BarRow, Empty } from '../../../shared/ui/bits.tsx';
import { Card } from '../../../shared/ui/card.tsx';
import { parsePeriod, periodLabel } from '../../../shared/period.ts';
import { money, pct } from '../../../shared/ui/format.ts';
import { useRucIndex } from '../_lib/stores.ts';
import { HeatMap } from '../_comprobantes/charts.tsx';
import { FilterBar } from '../_comprobantes/filters.tsx';
import { PageHeader } from '../_comprobantes/page-header.tsx';
import { useSunatView } from '../_comprobantes/use-sunat-view.ts';
import { RowsGap } from './rows-gap.tsx';

function TopSuppliers({ docs, cur }: { docs: Doc[]; cur: string }) {
    const ruc = useRucIndex();
    const { rows, total } = topParties(docs);
    if (!rows.length) return <Empty>Sin datos.</Empty>;
    const max = Math.max(1, ...rows.map((r) => r.total));
    return rows.map((r) => {
        const good = ruc.card(r.ruc)?.goodTaxpayer;
        return (
            <BarRow
                key={r.ruc}
                title={r.ruc + (good ? ' · Buen contribuyente' : '')}
                label={
                    <>
                        {r.name}
                        {good && (
                            <span className="font-bold text-success-strong" title="Buen contribuyente">
                                {' '}
                                ✓
                            </span>
                        )}
                    </>
                }
                figures={
                    <>
                        <b>{money(r.total, cur, true)}</b> · {pct(r.total, total)}%
                    </>
                }
                pct={Math.max(3, (100 * r.total) / max)}
            />
        );
    });
}

export function ProveedoresView() {
    const v = useSunatView();
    const { f, cur, ready, months } = v;
    const failed = !!v.error;
    const heat = ready ? heatMap(v.all, months) : null;
    return (
        <>
            <PageHeader title="Proveedores" />
            <FilterBar {...v.bar} />
            <div className="grid gap-3.5 lg:grid-cols-[1.55fr_1fr]">
                <Card title="Proveedores mes a mes" note="Los 12 de más monto · más intenso = más monto">
                    {heat ? <HeatMap months={heat.months} rows={heat.rows} lit={v.lit} currency={cur} /> : <RowsGap rows={8} failed={failed} />}
                </Card>
                <Card title="Principales del período" note={f.period ? periodLabel(parsePeriod(f.period)) : 'todo el período'}>
                    {ready ? <TopSuppliers docs={v.shown} cur={cur} /> : <RowsGap rows={8} failed={failed} />}
                </Card>
            </div>
        </>
    );
}
