// The KPI cards Resumen and Impuestos share (pintarKpis and kpiIgv of the Apps Script view).
// With `k` null (documents still travelling) each card is drawn with its real label and a gap.
import type { Kpis } from '../../../modules/comprobantes/application/views.ts';
import { Kpi, KpiNote } from '../../../shared/ui/card.tsx';
import { money, pct, thousands } from '../../../shared/ui/format.ts';
import { Sparkline } from './charts.tsx';

type K = { k: Kpis | null; cur: string };

export function TotalKpi({ k, buying, cur, months, lit }: K & { buying: boolean; months: string[]; lit: string[] }) {
    return (
        <Kpi label={buying ? 'Compras' : 'Ventas'} value={k && money(k.net, cur)}>
            {k && (
                <>
                    <KpiNote>
                        {thousands(k.count)} comprobantes
                        {k.change && (
                            <>
                                {' · '}
                                <b className={k.change.pct > 0 ? 'text-danger' : k.change.pct < 0 ? 'text-success-strong' : 'text-ink-3'}>
                                    {k.change.pct > 0 ? '+' : ''}
                                    {k.change.pct}%
                                </b>{' '}
                                vs {k.change.previous}
                            </>
                        )}
                    </KpiNote>
                    <Sparkline values={k.perMonth} months={months} lit={lit} fill={buying ? 'fill-teal' : 'fill-primary'} />
                </>
            )}
        </Kpi>
    );
}

export const PartiesKpi = ({ k, buying, cur }: K & { buying: boolean }) => (
    <Kpi label={buying ? 'Proveedores' : 'Clientes'} value={k && thousands(k.parties)}>
        {k && <KpiNote>{k.count ? `${money(k.net / Math.max(k.parties, 1), cur, true)} en promedio` : ''}</KpiNote>}
    </Kpi>
);

export const NotesKpi = ({ k, cur }: K) => (
    // Not a risk: the notes are already taken off the total (no red dot).
    <Kpi label="Notas de crédito" value={k && money(k.notes.total, cur)}>
        {k && <KpiNote>{k.notes.count} notas · ya restadas del total</KpiNote>}
    </Kpi>
);

/** IGV and taxable base, to check: base × 18% should give the IGV. */
export function IgvKpi({ k, cur }: K) {
    // A book without the breakdown has no IGV card: drawn only while it is not known yet.
    if (k && !k.igv) return null;
    const igv = k?.igv ?? null;
    return (
        <Kpi label="IGV" value={igv && money(igv.igv, cur)}>
            {igv && (
                <>
                    <KpiNote>
                        Base gravada {money(igv.base, cur, true)} · IGV ÷ base = <b>{igv.rate}%</b>
                        {igv.rate > 0 && igv.rate < 17.9 && <span className="text-ink-3"> (hay compras al 10%: restaurantes y hoteles MYPE)</span>}
                    </KpiNote>
                    {igv.withoutBreakdown > 0 && <KpiNote>{igv.withoutBreakdown} comprobantes sin desglose</KpiNote>}
                </>
            )}
        </Kpi>
    );
}

export function UntaxedKpi({ k, cur }: K) {
    if (k && !k.igv) return null;
    const igv = k?.igv ?? null;
    return (
        <Kpi label="No gravado" value={igv && money(igv.untaxed, cur)}>
            {igv && <KpiNote>inafecto, exonerado y otros tributos · {pct(igv.untaxed, Math.abs(igv.base + igv.igv + igv.untaxed))}% del total</KpiNote>}
        </Kpi>
    );
}

export const DetractionKpi = ({ k }: { k: Kpis | null }) => (
    <Kpi label="Detracción" value={k && money(k.detraction.total, 'PEN')} risk={!!k && k.detraction.toReview > 0}>
        {k && (
            <>
                <KpiNote>
                    {k.detraction.count} comprobantes con detracción
                    {k.detraction.toReview > 0 && <b className="text-danger"> · {k.detraction.toReview} a revisar</b>}
                </KpiNote>
                {(k.detraction.withProof > 0 || k.detraction.missingProof > 0) && (
                    <KpiNote>
                        {k.detraction.withProof} con su constancia
                        {k.detraction.missingProof > 0 && <b className="text-danger"> · {k.detraction.missingProof} sin constancia</b>}
                    </KpiNote>
                )}
            </>
        )}
    </Kpi>
);

export const KpiGrid = ({ children }: { children: React.ReactNode }) => (
    <div className="mb-3.5 grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3.5">{children}</div>
);
