'use client';

// Detracciones: the SPOT proofs (Banco de la Nación) and the invoices with detraction that have
// none, with their own filters (direction, month, case, text). The port of the «detracciones»
// section of the Apps Script view (iniciarDetracciones / pintarDetr). Everything is drawn at
// once; only the numbers wait for the base (detractionsStore, read once per tab). The filters, the
// order and the page of each table go in the URL (?cv=&segun=&periodo=&caso=&texto=&orden=&pag=…).
import { useMemo } from 'react';
import {
    DEFAULT_FILTERS,
    detractionKpis,
    filterDetractions,
    monthOptions,
    paymentMonths,
    sortMissing,
    sortProofs,
    type DetractionFilters,
    type MissingSort,
    type ProofSort,
} from '../../../modules/detracciones/application/views.ts';
import { FilterRow, Notice, SearchBox, SectionTitle, Select, TextButton } from '../../../shared/ui/bits.tsx';
import { Card, Segmented } from '../../../shared/ui/card.tsx';
import { PeriodPicker } from '../../../shared/ui/period-picker.tsx';
import { monthLabel, thousands } from '../../../shared/ui/format.ts';
import { Hueco } from '../../../shared/ui/hueco.tsx';
import { SortSelect, usePaged } from '../../../shared/ui/pager.tsx';
import { MonthBarsGap } from '../_comprobantes/charts.tsx';
import { detractionsStore } from '../_lib/stores.ts';
import { urlState } from '../_lib/url-state.ts';
import { BarsGap, CaseBars, DelayBars, GoodsBars, PaymentBars, PaymentLegend, TopBars } from './charts.tsx';
import { DetractionKpis } from './kpis.tsx';
import { soles } from './labels.tsx';
import { MissingTable, ProofsTable, STEP } from './tables.tsx';

const PROOF_SORTS: { value: ProofSort; label: string }[] = [
    { value: 'paid-desc', label: 'Pago más reciente' },
    { value: 'paid-asc', label: 'Pago más antiguo' },
    { value: 'deposit-desc', label: 'Depósito mayor' },
    { value: 'supplier', label: 'Proveedor o cliente' },
];
const MISSING_SORTS: { value: MissingSort; label: string }[] = [
    { value: 'issued-asc', label: 'Más antiguas' },
    { value: 'issued-desc', label: 'Más recientes' },
    { value: 'detraction-desc', label: 'Detracción mayor' },
    { value: 'supplier', label: 'Proveedor o cliente' },
];

const DIRECTIONS: { value: DetractionFilters['direction']; label: string }[] = [
    { value: 'compra', label: 'Compras' },
    { value: 'venta', label: 'Ventas' },
    { value: '', label: 'Compras y ventas' },
];

const BASES: { value: DetractionFilters['basis']; label: string; title: string }[] = [
    { value: 'pago', label: 'Por fecha de pago', title: 'El período filtra las constancias por el día en que se depositó' },
    { value: 'periodo', label: 'Por período de la factura', title: 'El período filtra por el mes del Registro de Compras de la factura' },
];

// They survive moving to another section and back, like the old view's DT (urlState remembers them).
const view$ = urlState(
    { ...DEFAULT_FILTERS, proofSort: 'paid-desc' as ProofSort, missingSort: 'issued-asc' as MissingSort, page: '1', pageMissing: '1' },
    {
        direction: 'cv',
        basis: 'segun',
        period: 'periodo',
        case: 'caso',
        text: 'texto',
        proofSort: 'orden',
        missingSort: 'orden_sin',
        page: 'pag',
        pageMissing: 'pag_sin',
    },
    {
        direction: DIRECTIONS.map((d) => d.value),
        basis: BASES.map((b) => b.value),
        proofSort: PROOF_SORTS.map((s) => s.value),
        missingSort: MISSING_SORTS.map((s) => s.value),
    },
);

const TableGap = () => (
    <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
            <Hueco key={i} className="h-8 w-full" />
        ))}
    </div>
);

export function DetraccionesView() {
    const { data, error } = detractionsStore.use();
    const f = view$.use();
    const { proofSort, missingSort } = f;
    const setProofSort = (s: ProofSort) => view$.set({ proofSort: s });
    const setMissingSort = (s: MissingSort) => view$.set({ missingSort: s });
    /** Changes the filters (each table goes back to its first page). */
    const set = (patch: Partial<DetractionFilters>) => view$.set(patch);

    const months = useMemo(() => (data ? monthOptions(data, f.basis) : []), [data, f.basis]);
    const v = useMemo(() => {
        if (!data) return null;
        const r = filterDetractions(data, f);
        return {
            ...r,
            k: detractionKpis(r.proofs, r.missing, data.since),
            bars: paymentMonths(r.anyMonth.filter((p) => !f.case || p.case === f.case)),

            deposited: r.proofs.reduce((a, p) => a + (p.deposited ?? 0), 0),
            missingAmount: r.missing.reduce((a, m) => a + (m.detraction ?? 0), 0),
        };
    }, [data, f]);
    const proofs = useMemo(() => (v ? sortProofs(v.proofs, proofSort) : []), [v, proofSort]);
    const missing = useMemo(() => (v ? sortMissing(v.missing, missingSort) : []), [v, missingSort]);
    const proofsPage = usePaged(proofs, proofs, STEP, view$.usePage());
    const missingPage = usePaged(missing, missing, STEP, view$.usePage('pageMissing'));
    // The bars are months of payment: one is lit when the period is that month, by payment.
    const paidMonth = f.basis === 'pago' && /^m\d{6}$/.test(f.period) ? f.period.slice(1) : '';
    const since = data?.since ?? '';

    return (
        <>
            <SectionTitle title="Detracciones" />
            {error ? (
                <Notice>No se pudieron leer las detracciones de la base: {error} El detalle está en el log del servidor.</Notice>
            ) : (
                <>
                    <FilterRow>
                        <Segmented options={DIRECTIONS} value={f.direction} onChange={(direction) => set({ direction })} />
                        <Segmented options={BASES} value={f.basis} onChange={(basis) => set({ basis, period: '' })} />
                        <PeriodPicker value={f.period} onChange={(period) => set({ period })} months={months} disabled={!data} allLabel="Todas las fechas" />
                        <Select label="Caso" value={f.case} onChange={(c) => set({ case: c })}>
                            <option value="">Todos los casos</option>
                            {v?.cases.map((c) => (
                                <option key={c.name} value={c.name}>
                                    {c.name} ({thousands(c.count)})
                                </option>
                            ))}
                        </Select>
                        <SearchBox
                            value={f.text}
                            onChange={(text) => set({ text })}
                            placeholder="Proveedor, cliente, RUC, constancia, F001-123 o N.° de operación"
                        />
                        <TextButton onClick={() => set({ period: '', case: '', text: '' })}>Quitar filtros</TextButton>
                    </FilterRow>
                    <DetractionKpis k={v?.k ?? null} direction={f.direction} since={since} />
                    <div className="mb-3.5 grid gap-3.5 lg:grid-cols-[1.55fr_1fr]">
                        <Card title="Depósitos por mes de pago" note="Constancias del SPOT (Banco de la Nación) · clic en un mes para filtrar">
                            {v ? (
                                <PaymentBars months={v.bars} month={paidMonth} onPick={(m) => set({ period: m ? `m${m}` : '', basis: 'pago' })} />
                            ) : (
                                <MonthBarsGap />
                            )}
                            <PaymentLegend direction={f.direction} />
                        </Card>
                        <Card title="Por caso" note="Clic en un caso para ver sus constancias">
                            {v ? <CaseBars proofs={v.anyCase} chosen={f.case} onPick={(c) => set({ case: c })} /> : <BarsGap />}
                        </Card>
                    </div>
                    <div className="mb-3.5 grid gap-3.5 lg:grid-cols-3">
                        <Card title="¿Cuándo se depositó?" note="Meses entre el período de la factura y el pago">
                            {v ? <DelayBars proofs={v.proofs} /> : <BarsGap />}
                        </Card>
                        <Card
                            title={
                                f.direction === 'venta'
                                    ? 'Clientes que más nos depositaron'
                                    : f.direction === 'compra'
                                      ? 'Proveedores con más detracción'
                                      : 'Proveedores y clientes'
                            }
                            note="Monto depositado"
                        >
                            {v ? <TopBars proofs={v.proofs} /> : <BarsGap />}
                        </Card>
                        <Card title="Por bien o servicio" note="Código del anexo de la R.S. 183-2004/SUNAT">
                            {v ? <GoodsBars proofs={v.proofs} /> : <BarsGap />}
                        </Card>
                    </div>
                    <Card
                        className="mb-3.5"
                        title="Constancias de detracción"
                        note={v ? `${thousands(v.proofs.length)} constancias · ${soles(v.deposited)}` : <Hueco className="h-3 w-56" />}
                    >
                        {v ? (
                            <>
                                {v.proofs.length > 1 && (
                                    <div className="mb-2.5 flex justify-end">
                                        <SortSelect value={proofSort} onChange={setProofSort} options={PROOF_SORTS} />
                                    </div>
                                )}
                                <ProofsTable paged={proofsPage} direction={f.direction} />
                            </>
                        ) : (
                            <TableGap />
                        )}
                    </Card>
                    <Card
                        title="Facturas con detracción sin constancia"
                        note={
                            v ? (
                                `${thousands(v.missing.length)} facturas · ${soles(v.missingAmount)} de detracción · desde ${monthLabel(since)}` +
                                (paidMonth ? ' · el mes de pago no aplica: no hay pago' : '')
                            ) : (
                                <Hueco className="h-3 w-72" />
                            )
                        }
                    >
                        {v ? (
                            <>
                                {v.missing.length > 1 && (
                                    <div className="mb-2.5 flex justify-end">
                                        <SortSelect value={missingSort} onChange={setMissingSort} options={MISSING_SORTS} />
                                    </div>
                                )}
                                <MissingTable paged={missingPage} direction={f.direction} />
                            </>
                        ) : (
                            <TableGap />
                        )}
                    </Card>
                </>
            )}
        </>
    );
}
