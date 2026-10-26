'use client';

// Retenciones: the CRE INROPRIN issued when paying its suppliers (3 % of the IGV regime), what was
// retained each month (what is declared), the wrong retentions (an ERROR: the invoice has a
// detraction, and an operation subject to the SPOT is not retained) and the invoices the base has
// not read yet (NOT an error). Everything is drawn at once; only the numbers wait for the base
// (retentionsStore, read once per tab). The filters, the order and the pages go in the URL
// (?periodo=&estado=&texto=&orden=&pag=&pag_mal=&pag_leer=), for a link.
import { useMemo } from 'react';
import {
    DEFAULT_RETENTION_FILTERS,
    filterRetentions,
    retainedByMonth,
    retentionKpis,
    retentionMonths,
    sortRetentions,
    unreadInvoices,
    wrongRetentions,
    type RetentionFilters,
    type RetentionKpis,
    type RetentionMonth,
    type RetentionSort,
} from '../../../modules/retenciones/application/views.ts';
import { FilterRow, Notice, SearchBox, SectionTitle } from '../../../shared/ui/bits.tsx';
import { Card, Kpi, KpiNote, Segmented } from '../../../shared/ui/card.tsx';
import { monthLabel, thousands } from '../../../shared/ui/format.ts';
import { Hueco } from '../../../shared/ui/hueco.tsx';
import { SortSelect, usePaged } from '../../../shared/ui/pager.tsx';
import { PeriodPicker } from '../../../shared/ui/period-picker.tsx';
import { KpiGrid } from '../_comprobantes/kpi-cards.tsx';
import { retentionsStore } from '../_lib/stores.ts';
import { urlState } from '../_lib/url-state.ts';
import { shortSoles, soles } from '../detracciones/labels.tsx';
import { CreTable, UnreadTable, WrongTable } from './tables.tsx';

const PAGE = 25;

const STATUSES: { value: RetentionFilters['status']; label: string }[] = [
    { value: 'EMITIDO', label: 'Emitidos' },
    { value: 'REVERTIDO', label: 'Revertidos' },
    { value: '', label: 'Todos' },
];
const SORTS: { value: RetentionSort; label: string }[] = [
    { value: 'issued-desc', label: 'Más recientes' },
    { value: 'issued-asc', label: 'Más antiguos' },
    { value: 'retained-desc', label: 'Retenido mayor' },
    { value: 'supplier', label: 'Proveedor' },
    { value: 'cre', label: 'Número de CRE' },
];

// The filters survive moving to another section and back, like Detracciones' (urlState remembers them).
const view$ = urlState(
    { ...DEFAULT_RETENTION_FILTERS, sort: 'issued-desc' as RetentionSort, page: '1', pageWrong: '1', pageUnread: '1' },
    { period: 'periodo', status: 'estado', text: 'texto', sort: 'orden', page: 'pag', pageWrong: 'pag_mal', pageUnread: 'pag_leer' },
    { status: STATUSES.map((s) => s.value), sort: SORTS.map((s) => s.value) },
);

function RetentionKpiCards({ k }: { k: RetentionKpis | null }) {
    return (
        <KpiGrid>
            <Kpi label="Retenido" value={k && soles(k.retained)}>
                {k && <KpiNote>de {soles(k.paid)} pagados (3 %)</KpiNote>}
            </Kpi>
            <Kpi label="CRE emitidos" value={k && thousands(k.issued)}>
                {k && <KpiNote>a {thousands(k.suppliers)} proveedores</KpiNote>}
            </Kpi>
            <Kpi label="Revertidos" value={k && thousands(k.reverted)}>
                {k && <KpiNote>no cuentan en lo retenido</KpiNote>}
            </Kpi>
            <Kpi label="Retención indebida" value={k && thousands(k.wrong)} risk={!!k && k.wrong > 0}>
                {k && <KpiNote>{k.wrong ? 'facturas con detracción: corregir' : 'ninguna: todo cuadra'}</KpiNote>}
            </Kpi>
            <Kpi label="Facturas por leer" value={k && thousands(k.unread)}>
                {k && <KpiNote>{k.unread ? 'el robot aún no las trae: no es error' : 'todas en la base'}</KpiNote>}
            </Kpi>
        </KpiGrid>
    );
}

/** One bar per month of issue; a click filters that month (another click, every month). */
function MonthBars({ months, chosen, onPick }: { months: RetentionMonth[]; chosen: string; onPick: (m: string) => void }) {
    if (!months.length) return <p className="py-2 text-[13px] text-ink-3">Sin retenciones en este filtro.</p>;
    const max = Math.max(...months.map((m) => m.retained), 1);
    return (
        <div className="flex h-[210px] items-end gap-2.5 overflow-x-auto pt-1.5">
            {months.map((m) => (
                <button
                    key={m.month}
                    type="button"
                    onClick={() => onPick(chosen === m.month ? '' : m.month)}
                    title={`${monthLabel(m.month)}: ${soles(m.retained)} · ${m.count} CRE`}
                    className={`group flex h-full flex-[1_0_46px] cursor-pointer flex-col items-center justify-end gap-1.5 ${chosen && chosen !== m.month ? 'opacity-30' : ''}`}
                >
                    <span className="text-[11.5px] font-bold whitespace-nowrap text-ink-2">{shortSoles(m.retained)}</span>
                    <span
                        className="block w-[70%] max-w-[46px] rounded-t-[7px] rounded-b-[3px] bg-teal group-hover:opacity-80"
                        style={{ height: Math.max(3, (m.retained / max) * 150) }}
                    />
                    <span className={`text-xs whitespace-nowrap ${chosen === m.month ? 'font-bold text-ink' : 'text-ink-2'}`}>{monthLabel(m.month)}</span>
                </button>
            ))}
        </div>
    );
}

const TableGap = () => (
    <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
            <Hueco key={i} className="h-8 w-full" />
        ))}
    </div>
);

export function RetencionesView() {
    const { data, error } = retentionsStore.use();
    const f = view$.use();
    const { sort } = f;
    const setSort = (s: RetentionSort) => view$.set({ sort: s });
    const set = (patch: Partial<RetentionFilters>) => view$.set(patch);

    const all = useMemo(() => data?.retentions ?? [], [data]);
    const months = useMemo(() => retentionMonths(all), [all]);
    const v = useMemo(() => {
        if (!data) return null;
        // KPIs and bars ignore the status filter (the reverted count needs both); the tables do not.
        const anyStatus = filterRetentions(all, { ...f, status: '' });
        return {
            k: retentionKpis(anyStatus),
            bars: retainedByMonth(filterRetentions(all, { ...f, status: '', period: '' })),
            list: filterRetentions(all, f),
            wrong: wrongRetentions(anyStatus),
            unread: unreadInvoices(anyStatus),
        };
    }, [data, all, f]);
    const sorted = useMemo(() => (v ? sortRetentions(v.list, sort) : []), [v, sort]);
    const crePage = usePaged(sorted, sorted, PAGE, view$.usePage());
    const wrongPage = usePaged(v?.wrong ?? [], v?.wrong, PAGE, view$.usePage('pageWrong'));
    const unreadPage = usePaged(v?.unread ?? [], v?.unread, PAGE, view$.usePage('pageUnread'));
    const pickedMonth = /^m\d{6}$/.test(f.period) ? f.period.slice(1) : '';

    return (
        <>
            <SectionTitle title="Retenciones" />
            {error ? (
                <Notice>No se pudieron leer las retenciones de la base: {error} El detalle está en el log del servidor.</Notice>
            ) : (
                <>
                    <FilterRow>
                        <Segmented options={STATUSES} value={f.status} onChange={(status) => set({ status })} />
                        <PeriodPicker value={f.period} onChange={(period) => set({ period })} months={months} disabled={!data} allLabel="Todas las fechas" />
                        <SearchBox value={f.text} onChange={(text) => set({ text })} placeholder="Proveedor, RUC, CRE o factura" />
                    </FilterRow>
                    <RetentionKpiCards k={v?.k ?? null} />
                    <Card className="mb-3.5" title="Retenido por mes" note="Lo que se declara cada período · clic en un mes para filtrar">
                        {v ? (
                            <MonthBars months={v.bars} chosen={pickedMonth} onPick={(m) => set({ period: m ? `m${m}` : '' })} />
                        ) : (
                            <Hueco className="h-[210px] w-full" />
                        )}
                    </Card>
                    <Card className="mb-3.5" title="Retención indebida">
                        <p className="mb-3 max-w-3xl text-[13px] text-ink-2">
                            Facturas con detracción a las que además se les retuvo. Es un <b>error</b>: una operación sujeta a detracción no lleva retención
                            (R.S. 037-2002/SUNAT, art. 5). Hay que revertir el CRE o, si la detracción no correspondía, corregir la factura.
                        </p>
                        {v ? <WrongTable paged={wrongPage} /> : <TableGap />}
                    </Card>
                    <Card className="mb-3.5" title="Comprobantes de retención" note={v ? `${thousands(v.list.length)} CRE` : undefined}>
                        {v ? (
                            <>
                                {v.list.length > 1 && (
                                    <div className="mb-2.5 flex justify-end">
                                        <SortSelect value={sort} onChange={setSort} options={SORTS} />
                                    </div>
                                )}
                                <CreTable paged={crePage} />
                            </>
                        ) : (
                            <TableGap />
                        )}
                    </Card>
                    <Card title="Facturas por leer">
                        <p className="mb-3 max-w-3xl text-[13px] text-ink-2">
                            Facturas que un CRE nombra pero que la base todavía no tiene. <b>No es un error</b>: el robot del SIRE o del XML aún no las leyó y
                            se completan solas en su próxima corrida.
                        </p>
                        {v ? <UnreadTable paged={unreadPage} /> : <TableGap />}
                    </Card>
                </>
            )}
        </>
    );
}
