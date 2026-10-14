'use client';

// OC y centros de costo: how many purchases are tied to their PO and have a cost centre, the
// import expenses by PO and where the spend goes. The port of the «oc» section of the Apps
// Script view (the OC part of pintarKpis, pintarImpo and pintarCentros).
import { costCenters, type Doc, type Kpis } from '../../../modules/comprobantes/application/views.ts';
import { BarRow, Empty, Ring } from '../../../shared/ui/bits.tsx';
import { Card, Kpi, KpiNote } from '../../../shared/ui/card.tsx';
import { money, pct, thousands } from '../../../shared/ui/format.ts';
import { FilterBar } from '../_comprobantes/filters.tsx';
import { KpiGrid } from '../_comprobantes/kpi-cards.tsx';
import { PageHeader } from '../_comprobantes/page-header.tsx';
import { useSunatView } from '../_comprobantes/use-sunat-view.ts';
import { RowsGap } from '../proveedores/rows-gap.tsx';
import { Imports } from './imports.tsx';

function RingKpi({ label, done, of, color, children }: { label: string; done: number | null; of: number; color: 'teal' | 'primary'; children: string }) {
    return (
        <Kpi
            label={label}
            value={
                done === null ? null : (
                    <Ring pct={pct(done, of)} color={color}>
                        <span className="font-normal whitespace-normal">
                            {thousands(done)} de {thousands(of)}
                            <br />
                            {children}
                        </span>
                    </Ring>
                )
            }
        />
    );
}

function OcKpis({ k, cur }: { k: Kpis | null; cur: string }) {
    return (
        <KpiGrid>
            <RingKpi label="Unidos a su OC" done={k && k.withOc} of={k?.count ?? 0} color="teal">
                con su orden de compra
            </RingKpi>
            <RingKpi label="Con centro de costo" done={k && k.withCostCenter} of={k?.count ?? 0} color="primary">
                listos para CONCAR
            </RingKpi>
            <Kpi label="Importaciones" value={k && money(k.imports, cur)}>
                <KpiNote>gastos en Perú unidos a OC de importación</KpiNote>
            </Kpi>
        </KpiGrid>
    );
}

function CostCenters({ docs, cur }: { docs: Doc[]; cur: string }) {
    const { rows } = costCenters(docs);
    if (!rows.length) return <Empty>Todavía sin centros de costo: llegan cuando la factura queda unida a su OC.</Empty>;
    const max = Math.max(1, ...rows.map((r) => r.total));
    return rows.map((r) => (
        <BarRow key={r.name} title={r.name} label={r.name} figures={<b>{money(r.total, cur, true)}</b>} pct={Math.max(3, (100 * r.total) / max)} />
    ));
}

export function OcView() {
    const v = useSunatView();
    const { f, k, cur, buying, ready } = v;
    const failed = !!v.error;
    const ccNote = buying && ready ? `${pct(costCenters(v.shown).withCostCenter, v.shown.length)}% del gasto ya tiene centro de costo` : '';
    return (
        <>
            <PageHeader title="OC y centros de costo" />
            <FilterBar {...v.bar} />
            {buying ? (
                <OcKpis k={k} cur={cur} />
            ) : (
                <div className="mb-3.5">
                    <Empty>Las órdenes de compra y los centros de costo son de las compras: elige «Compras» en los filtros.</Empty>
                </div>
            )}
            <div className="grid gap-3.5 lg:grid-cols-2">
                <Card
                    title="Importaciones: gastos con factura en SUNAT"
                    note="Flete, aduana, courier… La factura del proveedor extranjero está en la carpeta de la OC."
                >
                    {ready && v.snapshot ? <Imports docs={v.snapshot.docs} period={f.period} currency={f.currency} /> : <RowsGap rows={5} failed={failed} />}
                </Card>
                <Card title="A dónde va el gasto" note={ccNote}>
                    {!buying ? (
                        <Empty>El centro de costo es de las compras.</Empty>
                    ) : ready ? (
                        <CostCenters docs={v.shown} cur={cur} />
                    ) : (
                        <RowsGap rows={6} failed={failed} />
                    )}
                </Card>
            </div>
        </>
    );
}
