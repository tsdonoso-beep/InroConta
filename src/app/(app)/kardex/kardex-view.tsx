'use client';

// Kardex: the Almacén kardex per month of operation and what changed in it after each month
// closed (reunión con Contabilidad, 27/10/2026: lo que cuenta es el cierre mensual, pero José
// necesita saber qué se movió después). The robot reads the whole kardex twice a day and notes
// every new, changed or deleted movement (migration v2 016). Everything is drawn at once; only the
// numbers wait for the base (kardexStore, read once per tab). The filters and the page go in the
// URL (?mes=&todos=&tipo=&texto=&pag=), for a link.
import { useMemo } from 'react';
import {
    changeText,
    filterKardexChanges,
    KARDEX_DAYS,
    KARDEX_FILTER_DEFAULT,
    kardexKpis,
    postClosingByMonth,
    type KardexChange,
    type KardexChangeType,
    type KardexKpis,
    type KardexMonth,
} from '../../../modules/kardex/application/views.ts';
import { Empty, FilterRow, Notice, SearchBox, SectionTitle, Select, T } from '../../../shared/ui/bits.tsx';
import { Card, Chip, Kpi, KpiNote, Segmented } from '../../../shared/ui/card.tsx';
import { dayTime, monthLabel, thousands } from '../../../shared/ui/format.ts';
import { Hueco } from '../../../shared/ui/hueco.tsx';
import { Pager, usePaged } from '../../../shared/ui/pager.tsx';
import { KpiGrid } from '../_comprobantes/kpi-cards.tsx';
import { kardexStore } from '../_lib/stores.ts';
import { urlState } from '../_lib/url-state.ts';

const PAGE = 30;
/** «2026-09» → «set 26». */
const month = (m: string) => monthLabel(m.replace('-', ''));
const qty = (n: number) => (Math.abs(n) >= 1000 ? thousands(n) : String(Math.round(n * 100) / 100));

const SCOPES = [
    { value: '1', label: 'Meses ya cerrados' },
    { value: '', label: 'Todos los cambios' },
];
const TYPES: { value: KardexChangeType | ''; label: string }[] = [
    { value: '', label: 'Todo tipo de cambio' },
    { value: 'NUEVO', label: 'Movimientos nuevos' },
    { value: 'CAMBIO', label: 'Movimientos cambiados' },
    { value: 'ELIMINADO', label: 'Movimientos borrados' },
];
const TONE: Record<KardexChangeType, 'info' | 'warn' | 'danger'> = { NUEVO: 'info', CAMBIO: 'warn', ELIMINADO: 'danger' };
const TYPE_LABEL: Record<KardexChangeType, string> = { NUEVO: 'Nuevo', CAMBIO: 'Cambió', ELIMINADO: 'Borrado' };

const view$ = urlState(
    { month: '', closedOnly: '1', type: '' as KardexChangeType | '', text: '', page: '1' },
    { month: 'mes', closedOnly: 'cerrados', type: 'tipo', text: 'texto', page: 'pag' },
    { closedOnly: ['1', ''], type: TYPES.map((t) => t.value) },
);

function KardexKpiCards({ k, lastReadAt }: { k: KardexKpis | null; lastReadAt: string | null }) {
    return (
        <KpiGrid>
            <Kpi label="Cambios en meses cerrados" value={k && thousands(k.closedChanges)} risk={!!k && k.closedChanges > 0}>
                {k && (
                    <KpiNote>
                        {k.closedChanges
                            ? `${thousands(k.closedMovements)} movimientos de ${k.closedMonths} ${k.closedMonths === 1 ? 'mes' : 'meses'} · últimos ${KARDEX_DAYS} días`
                            : `ninguno en los últimos ${KARDEX_DAYS} días`}
                    </KpiNote>
                )}
            </Kpi>
            <Kpi label="Cambios esta semana" value={k && thousands(k.lastWeek)}>
                {k && <KpiNote>de cualquier mes, en los últimos 7 días</KpiNote>}
            </Kpi>
            <Kpi label="Movimientos del mes" value={k && thousands(k.current?.movements ?? 0)}>
                {k && <KpiNote>{k.current ? `${thousands(k.current.vouchers)} vales hasta hoy` : 'todavía ninguno'}</KpiNote>}
            </Kpi>
            <Kpi label="Última lectura" value={lastReadAt === null ? null : lastReadAt ? dayTime(lastReadAt) : '—'}>
                {lastReadAt !== null && <KpiNote>{lastReadAt ? 'el robot lee el kardex dos veces al día' : 'el robot todavía no lo leyó'}</KpiNote>}
            </Kpi>
        </KpiGrid>
    );
}

function MonthsTable({ months, post, chosen, onPick }: { months: KardexMonth[]; post: Map<string, number>; chosen: string; onPick: (m: string) => void }) {
    if (!months.length) return <Empty>Todavía no hay movimientos del kardex en la base.</Empty>;
    return (
        <div className="overflow-x-auto">
            <table className={T.table}>
                <thead>
                    <tr className={T.headRow}>
                        <th className={T.th}>Mes</th>
                        <th className={T.thNum}>Movimientos</th>
                        <th className={T.thNum}>Vales</th>
                        <th className={T.thNum}>Ingresos</th>
                        <th className={T.thNum}>Salidas</th>
                        <th className={T.thNum}>Anulados</th>
                        <th className={T.thNum}>Cambios después del cierre</th>
                    </tr>
                </thead>
                <tbody>
                    {months.map((m) => {
                        const n = post.get(m.month) ?? 0;
                        return (
                            <tr
                                key={m.month}
                                className={`${T.row} cursor-pointer hover:bg-surface-2 ${chosen === m.month ? 'bg-surface-2' : ''}`}
                                onClick={() => onPick(chosen === m.month ? '' : m.month)}
                                title="Clic para ver solo los cambios de este mes"
                            >
                                <td className={`${T.td} font-semibold`}>{month(m.month)}</td>
                                <td className={T.tdNum}>{thousands(m.movements)}</td>
                                <td className={T.tdNum}>{thousands(m.vouchers)}</td>
                                <td className={T.tdNum}>{qty(m.inQty)}</td>
                                <td className={T.tdNum}>{qty(m.outQty)}</td>
                                <td className={T.tdNum}>{m.voided ? thousands(m.voided) : ''}</td>
                                <td className={T.tdNum}>{n ? <Chip tone="danger">{thousands(n)}</Chip> : <span className="text-ink-3">—</span>}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function ChangesTable({ rows }: { rows: KardexChange[] }) {
    return (
        <div className="overflow-x-auto">
            <table className={T.table}>
                <thead>
                    <tr className={T.headRow}>
                        <th className={T.th}>Visto</th>
                        <th className={T.th}>Mes</th>
                        <th className={T.th}>Vale</th>
                        <th className={T.th}>Producto</th>
                        <th className={T.th}>Qué cambió</th>
                        <th className={T.th}>Responsable</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((c) => (
                        <tr key={c.id} className={T.row}>
                            <td className={`${T.td} whitespace-nowrap text-ink-3`}>{dayTime(c.at)}</td>
                            <td className={`${T.td} whitespace-nowrap`}>
                                {c.month ? month(c.month) : '—'}
                                {c.closedMonth && <div className={T.sub}>ya cerrado</div>}
                            </td>
                            <td className={`${T.td} whitespace-nowrap`}>
                                <b>{c.voucher || '—'}</b>
                                <div className={T.sub}>{c.movement}</div>
                            </td>
                            <td className={T.td}>
                                {c.product || '—'}
                                {c.sku && <div className={T.sub}>{c.sku}</div>}
                            </td>
                            <td className={T.td}>
                                <Chip tone={TONE[c.type]}>{TYPE_LABEL[c.type]}</Chip>
                                <div className="mt-1">{changeText(c)}</div>
                            </td>
                            <td className={T.td}>
                                {c.responsible || '—'}
                                {c.project && <div className={T.sub}>{c.project}</div>}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
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

export function KardexView() {
    const { data, error } = kardexStore.use();
    const f = view$.use();
    const set = view$.set;
    const filter = useMemo(() => ({ ...KARDEX_FILTER_DEFAULT, month: f.month, closedOnly: f.closedOnly === '1', type: f.type, text: f.text }), [f]);
    const v = useMemo(() => {
        if (!data) return null;
        return {
            k: kardexKpis(data.months, data.changes),
            post: postClosingByMonth(data.changes),
            list: filterKardexChanges(data.changes, filter),
            months: [...new Set(data.changes.map((c) => c.month).filter(Boolean))].sort().reverse(),
        };
    }, [data, filter]);
    const paged = usePaged(v?.list ?? [], v?.list, PAGE, view$.usePage());
    const empty = !!data && !data.months.length && !data.lastReadAt;

    return (
        <>
            <SectionTitle title="Kardex" />
            {error ? (
                <Notice>No se pudo leer el kardex de la base: {error} El detalle está en el log del servidor.</Notice>
            ) : (
                <>
                    {empty && (
                        <Notice tone="info">
                            El robot todavía no leyó el kardex completo. Empieza solo cuando la hoja privada de fuentes tenga la pestaña «KARDEX - MOVIMIENTOS»
                            (CopiarFuentes.gs actualizado) y corra «Carpetas de OC».
                        </Notice>
                    )}
                    <KardexKpiCards k={v?.k ?? null} lastReadAt={data ? data.lastReadAt : null} />
                    <Card
                        className="mb-3.5"
                        title="Por mes de operación"
                        note={`Lo que tiene hoy el kardex · los cambios después del cierre son de los últimos ${KARDEX_DAYS} días · clic en un mes para ver sus cambios`}
                    >
                        {v && data ? <MonthsTable months={data.months} post={v.post} chosen={f.month} onPick={(month) => set({ month })} /> : <TableGap />}
                    </Card>
                    <Card
                        title="Lo que cambió en el kardex"
                        note={v ? `${thousands(v.list.length)} cambios · el robot compara cada lectura con la anterior (dos veces al día)` : undefined}
                    >
                        <p className="mb-3 max-w-3xl text-[13px] text-ink-2">
                            Un mes <b>ya cerrado</b> es uno anterior al mes en que se vio el cambio: si se movió algo ahí, el cuadre del cierre de ese mes ya no
                            es el mismo. Si un movimiento cambió de mes, cuenta el más antiguo de los dos.
                        </p>
                        <FilterRow>
                            <Segmented options={SCOPES} value={f.closedOnly} onChange={(closedOnly) => set({ closedOnly })} />
                            <Select label="Tipo de cambio" value={f.type} onChange={(type) => set({ type: type as KardexChangeType | '' })}>
                                {TYPES.map((t) => (
                                    <option key={t.value} value={t.value}>
                                        {t.label}
                                    </option>
                                ))}
                            </Select>
                            <Select label="Mes del movimiento" value={f.month} onChange={(month) => set({ month })}>
                                <option value="">Todo mes</option>
                                {(v?.months ?? []).map((m) => (
                                    <option key={m} value={m}>
                                        {month(m)}
                                    </option>
                                ))}
                            </Select>
                            <SearchBox value={f.text} onChange={(text) => set({ text })} placeholder="Vale, producto, código, proyecto o responsable" />
                        </FilterRow>
                        {!v ? (
                            <TableGap />
                        ) : paged.total ? (
                            <>
                                <ChangesTable rows={paged.rows} />
                                <Pager paged={paged} />
                            </>
                        ) : (
                            <Empty>
                                {data?.changes.length
                                    ? 'Ningún cambio con estos filtros.'
                                    : `Sin cambios en los últimos ${KARDEX_DAYS} días. El robot los anota desde su primera lectura completa.`}
                            </Empty>
                        )}
                    </Card>
                </>
            )}
        </>
    );
}
