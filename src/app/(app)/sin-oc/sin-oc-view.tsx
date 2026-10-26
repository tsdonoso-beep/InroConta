'use client';

// Facturas sin OC: the SUNAT invoices that look like they lack an OC, with their KPIs and the
// filters of signal, area and text. The port of the «sinoc» section (pintarSinOc) of the Apps
// Script view. Filters, KPI labels and the table are drawn at once; only the figures wait. The
// table goes in pages of 50, in the order asked. The filters, the order and the page go in the URL
// (?senal=&area=&periodo=&texto=&orden=&pag=), for a link.
import { useMemo } from 'react';
import {
    filterNoOc,
    NO_OC_DEFAULT,
    noOcKpis,
    noOcMonths,
    sortNoOc,
    type NoOcArea,
    type NoOcSignal,
    type NoOcSort,
} from '../../../modules/legajo/application/views.ts';
import { Card, Kpi, KpiNote, Segmented } from '../../../shared/ui/card.tsx';
import { FilterRow, Notice, SearchBox, SectionTitle } from '../../../shared/ui/bits.tsx';
import { Pager, SortSelect, usePaged } from '../../../shared/ui/pager.tsx';
import { PeriodPicker } from '../../../shared/ui/period-picker.tsx';
import { money, thousands } from '../../../shared/ui/format.ts';
import { KpiGrid } from '../_comprobantes/kpi-cards.tsx';
import { noOcStore } from '../_lib/stores.ts';
import { urlState } from '../_lib/url-state.ts';
import { NoOcTable, NoOcTableGap } from './no-oc-table.tsx';

const PAGE = 50;

const SORTS: { value: NoOcSort; label: string }[] = [
    { value: 'priority', label: 'Prioridad' },
    { value: 'date-desc', label: 'Más recientes' },
    { value: 'date-asc', label: 'Más antiguas' },
    { value: 'amount-desc', label: 'Monto mayor' },
    { value: 'supplier', label: 'Proveedor' },
];

const SIGNALS: { value: NoOcSignal; label: string }[] = [
    { value: 'ALTA', label: 'ALTA' },
    { value: 'MEDIA', label: 'MEDIA' },
    { value: '', label: 'Todas' },
];
const AREAS: { value: NoOcArea; label: string }[] = [
    { value: '', label: 'Todas' },
    { value: 'Compras nacionales', label: 'Nacionales' },
    { value: 'COMEX (importaciones)', label: 'COMEX' },
    { value: '-', label: 'Por identificar' },
];

const view$ = urlState(
    { ...NO_OC_DEFAULT, sort: 'priority' as NoOcSort, page: '1' },
    { signal: 'senal', area: 'area', period: 'periodo', text: 'texto', sort: 'orden', page: 'pag' },
    { signal: SIGNALS.map((s) => s.value), area: AREAS.map((a) => a.value), sort: SORTS.map((s) => s.value) },
);

export function SinOcView() {
    const { data, error } = noOcStore.use();
    const f = view$.use();
    const { sort } = f;
    const set = view$.set;
    const setSort = (s: NoOcSort) => set({ sort: s });
    const rows = useMemo(() => (data ? sortNoOc(filterNoOc(data.noOc, f), sort) : null), [data, f, sort]);
    const paged = usePaged(rows ?? [], rows, PAGE, view$.usePage());
    const k = data ? noOcKpis(data.noOc, f.area, f.period) : null;
    return (
        <>
            <SectionTitle title="Facturas sin OC" />
            {error && <Notice>No se pudieron leer las facturas sin OC de la base: {error} El detalle está en el log del servidor.</Notice>}
            <FilterRow>
                <Segmented options={SIGNALS} value={f.signal} onChange={(signal) => set({ signal })} />
                <Segmented options={AREAS} value={f.area} onChange={(area) => set({ area })} />
                <PeriodPicker
                    value={f.period}
                    onChange={(period) => set({ period })}
                    months={data ? noOcMonths(data.noOc) : []}
                    disabled={!data}
                    allLabel="Todas las fechas"
                />
                <SearchBox value={f.text} onChange={(text) => set({ text })} placeholder="Proveedor, RUC, comprobante o comprador" />
                <SortSelect value={sort} onChange={setSort} options={SORTS} />
            </FilterRow>
            {!error && (
                <>
                    <KpiGrid>
                        <Kpi label="ALTA: el proveedor trabaja con OC" value={k && thousands(k.high.count)} risk={!!k?.high.count}>
                            <KpiNote>≈ {k && money(k.high.pen, 'PEN')} (dólares × 3,75)</KpiNote>
                        </Kpi>
                        <Kpi label="MEDIA: monto alto" value={k && thousands(k.medium.count)}>
                            <KpiNote>≈ {k && money(k.medium.pen, 'PEN')}</KpiNote>
                        </Kpi>
                        <Kpi label="Proveedores" value={k && thousands(k.suppliers)}>
                            <KpiNote>con alguna factura sin OC</KpiNote>
                        </Kpi>
                    </KpiGrid>
                    <Card
                        title="Facturas de SUNAT que aparentan no tener OC"
                        note="ALTA: el proveedor trabaja con OC · MEDIA: S/ 2 000 o más y no es un gasto típico sin OC (bancos, seguros, pasajes, comida…)"
                    >
                        {rows ? (
                            <>
                                <NoOcTable rows={paged.rows} />
                                <Pager paged={paged} />
                            </>
                        ) : (
                            <NoOcTableGap />
                        )}
                    </Card>
                </>
            )}
        </>
    );
}
