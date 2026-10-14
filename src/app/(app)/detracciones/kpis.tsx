// The five KPI cards of Detracciones (pintarDetrKpis of the Apps Script view). With `k` null
// (the proofs still travelling) each card is drawn with its label and a gap.
import type { ReactNode } from 'react';
import type { DetractionFilters, DetractionKpis } from '../../../modules/detracciones/application/views.ts';
import { Kpi, KpiNote } from '../../../shared/ui/card.tsx';
import { Ring } from '../../../shared/ui/bits.tsx';
import { monthLabel, thousands } from '../../../shared/ui/format.ts';
import { KpiGrid } from '../_comprobantes/kpi-cards.tsx';
import { partiesWord, shortSoles, soles } from './labels.tsx';

/** A ring as the KPI's value: the card's big bold figure style must not reach the text beside it. */
const RingValue = ({ pct, color, children }: { pct: number; color: 'success' | 'primary' | 'warning'; children: ReactNode }) => (
    <div className="text-base font-normal tracking-normal whitespace-normal">
        <Ring pct={pct} color={color}>
            {children}
        </Ring>
    </div>
);

export function DetractionKpis({ k, direction, since }: { k: DetractionKpis | null; direction: DetractionFilters['direction']; since: string }) {
    const big = !!k && k.deposited >= 1e5;
    return (
        <KpiGrid>
            <Kpi label="Detracción depositada" value={k && (big ? <span title={soles(k.deposited)}>{shortSoles(k.deposited)}</span> : soles(k.deposited))}>
                {k && (
                    <KpiNote>
                        {big && (
                            <>
                                {soles(k.deposited)}
                                <br />
                            </>
                        )}
                        {thousands(k.count)} constancias · {thousands(k.parties)} {partiesWord(direction)}
                        {direction === '' && (
                            <>
                                <br />
                                compras {soles(k.purchases)} · ventas {soles(k.sales)}
                            </>
                        )}
                    </KpiNote>
                )}
            </Kpi>
            <Kpi
                label="Con su constancia"
                value={
                    k && (
                        <RingValue pct={k.covered.pct} color={k.covered.pct >= 90 ? 'success' : k.covered.pct >= 70 ? 'primary' : 'warning'}>
                            {thousands(k.covered.with)} de {thousands(k.covered.of)}
                            <br />
                            facturas con detracción desde {monthLabel(since)}
                        </RingValue>
                    )
                }
            />
            <Kpi label="Casos atípicos" value={k && thousands(k.atypical)} risk={!!k && k.toCorrect > 0}>
                {k && (
                    <KpiNote>
                        {k.topCases.map((c) => `${c.name === 'Factura de' ? 'de otro año' : c.name.toLowerCase()}: ${c.count}`).join(' · ') ||
                            'ninguno: todo cuadra'}
                        {k.toCorrect > 0 && (
                            <>
                                <br />
                                <b className="text-danger">{k.toCorrect} para corregir</b>
                            </>
                        )}
                    </KpiNote>
                )}
            </Kpi>
            <Kpi label="Sin constancia" value={k && thousands(k.missing.count)} risk={!!k && k.missing.old > 0}>
                {k && (
                    <KpiNote>
                        {soles(k.missing.amount)} de detracción sin depositar
                        {k.missing.old > 0 && (
                            <>
                                <br />
                                <b className="text-danger">{k.missing.old} con 2+ meses desde la emisión</b>
                            </>
                        )}
                    </KpiNote>
                )}
            </Kpi>
            <Kpi
                label="Pagadas a tiempo"
                value={
                    k && (
                        <RingValue pct={k.onTime.pct} color="primary">
                            {thousands(k.onTime.count)} de {thousands(k.onTime.of)}
                            <br />
                            en el mes o el mes siguiente
                        </RingValue>
                    )
                }
            />
        </KpiGrid>
    );
}
