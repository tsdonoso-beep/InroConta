'use client';

// Impuestos: IGV, untaxed, credit notes and detraction; the sales and IGV check by month
// (as the PDT 621) and the detractions to review. The port of the «impuestos» section.
import { useEffect, useState } from 'react';
import type { Doc, SalesTaxMonth } from '../../../modules/comprobantes/application/views.ts';
import { Card } from '../../../shared/ui/card.tsx';
import { driveFile, money, monthLabel, thousands } from '../../../shared/ui/format.ts';
import { Hueco } from '../../../shared/ui/hueco.tsx';
import { FilterBar } from '../_comprobantes/filters.tsx';
import { DetractionKpi, IgvKpi, KpiGrid, NotesKpi, UntaxedKpi } from '../_comprobantes/kpi-cards.tsx';
import { PageHeader } from '../_comprobantes/page-header.tsx';
import { useSunatView } from '../_comprobantes/use-sunat-view.ts';

/** What the server sends behind the page: never a rejection (one would bring the screen down). */
export type SalesTaxResult = { months: SalesTaxMonth[] } | { error: string };

const TH = 'pb-2.5 pr-2.5 text-[11px] font-semibold tracking-[.05em] text-ink-3 uppercase';
const TD = 'py-2.5 pr-2.5 align-top';
const pen = (n: number) => money(n, 'PEN');
const SUM_KEYS = [
    'n_ventas',
    'base_ventas',
    'igv_ventas',
    'n_notas',
    'base_notas',
    'igv_notas',
    'base_neta',
    'igv_neto',
    'no_gravado',
    'n_anticipos',
    'anticipos',
    'cubiertas_por_anticipo',
    'total_neto',
] as const;

function SalesTaxRow({ r, label, className = '' }: { r: Omit<SalesTaxMonth, 'periodo'>; label: string; className?: string }) {
    return (
        <tr className={`border-b border-line ${className}`}>
            <td className={TD}>
                <b>{label}</b>
            </td>
            <td className={`${TD} text-right tabular-nums`}>
                {pen(r.base_ventas)}
                <div className="text-[11.5px] text-ink-3">{thousands(r.n_ventas)} comprobantes</div>
            </td>
            <td className={`${TD} text-right tabular-nums`}>{pen(r.igv_ventas)}</td>
            <td className={`${TD} text-right tabular-nums`}>
                {r.n_notas ? (
                    <>
                        −{pen(r.igv_notas)}
                        <div className="text-[11.5px] text-ink-3">
                            {thousands(r.n_notas)} notas · base −{pen(r.base_notas)}
                        </div>
                    </>
                ) : (
                    '—'
                )}
            </td>
            <td className={`${TD} text-right tabular-nums`}>
                <b>{pen(r.igv_neto)}</b>
                <div className="text-[11.5px] text-ink-3">base {pen(r.base_neta)}</div>
            </td>
            <td className={`${TD} text-right tabular-nums`}>{r.no_gravado ? pen(r.no_gravado) : '—'}</td>
            <td className={`${TD} text-right tabular-nums`}>
                {r.n_anticipos ? (
                    <>
                        {pen(r.anticipos)}
                        <div className="text-[11.5px] text-ink-3">
                            {thousands(r.n_anticipos)} facturas{r.cubiertas_por_anticipo ? ` · ${thousands(r.cubiertas_por_anticipo)} en cero` : ''}
                        </div>
                    </>
                ) : (
                    '—'
                )}
            </td>
        </tr>
    );
}

function SalesTax({ months, chosen }: { months: SalesTaxMonth[]; chosen: string[] }) {
    const total = Object.fromEntries(SUM_KEYS.map((key) => [key, months.reduce((a, m) => a + m[key], 0)])) as Omit<SalesTaxMonth, 'periodo'>;
    return (
        <Card
            className="mb-[18px]"
            title="Cuadre de ventas e IGV por mes"
            note="Como el PDT 621: ventas − notas de crédito = IGV del mes · de los XML emitidos, en soles"
        >
            <div className="overflow-x-auto">
                <table className="w-full text-[13.5px]">
                    <thead>
                        <tr className="border-b border-control text-left">
                            <th className={TH}>Mes</th>
                            <th className={`${TH} text-right`}>Base gravada de ventas</th>
                            <th className={`${TH} text-right`}>IGV de ventas</th>
                            <th className={`${TH} text-right`}>Notas de crédito (IGV)</th>
                            <th className={`${TH} text-right`}>IGV del mes</th>
                            <th className={`${TH} text-right`}>No gravado</th>
                            <th
                                className={`${TH} text-right`}
                                title="Lo que se descontó por anticipos ya facturados antes: ese IGV se pagó el mes del anticipo, no se vuelve a sumar"
                            >
                                Anticipos aplicados
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {months.map((m) => (
                            <SalesTaxRow key={m.periodo} r={m} label={monthLabel(m.periodo)} className={chosen.includes(m.periodo) ? 'bg-primary-soft' : ''} />
                        ))}
                        <SalesTaxRow r={total} label="Total del año" className="border-t-2 border-t-line bg-surface-2" />
                    </tbody>
                </table>
            </div>
            <p className="mt-2 text-xs text-ink-3">
                Base = IGV ÷ 18%. Una factura con anticipo trae su IGV ya neto: el anticipo pagó el suyo el mes en que se facturó (por eso «Anticipos aplicados»
                es solo informativo y no se resta otra vez). Los comprobantes dados de baja no están en los XML: si hay alguno, es una diferencia con el PDT que
                este cuadre no ve.
            </p>
        </Card>
    );
}

function DetractionsToReview({ docs }: { docs: Doc[] }) {
    if (!docs.length)
        return <p className="text-[13px] text-ink-3">Ninguna detracción a revisar con este filtro: todas usan el % de su código de bien o servicio.</p>;
    const parties = new Set(docs.map((d) => d.ruc)).size;
    return (
        <details open className="rounded-[14px] border border-danger-line bg-surface px-[22px] py-3.5 shadow-card">
            <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2.5">
                <h2 className="text-[15px] font-bold">
                    Detracciones a revisar ·{' '}
                    <span className="text-danger">
                        {docs.length} {docs.length === 1 ? 'comprobante' : 'comprobantes'} de {parties} {parties === 1 ? 'proveedor' : 'proveedores'} ·{' '}
                        {pen(docs.reduce((a, d) => a + d.detraction, 0))} de detracción
                    </span>
                </h2>
                <span className="text-xs text-ink-3">El % aplicado no es el que lleva su código de bien o servicio (anexos de la R.S. 183-2004/SUNAT)</span>
            </summary>
            <div className="mt-3.5 overflow-x-auto">
                <table className="w-full text-[13.5px]">
                    <thead>
                        <tr className="border-b border-control text-left">
                            <th className={TH}>Fecha</th>
                            <th className={TH}>Proveedor</th>
                            <th className={TH}>Comprobante</th>
                            <th className={TH}>Qué pasa</th>
                            <th className={`${TH} text-right`}>Detracción</th>
                        </tr>
                    </thead>
                    <tbody>
                        {docs.map((d) => (
                            <tr key={`${d.ruc}-${d.number}`} className="border-b border-line">
                                <td className={`${TD} whitespace-nowrap`}>{d.issuedOn}</td>
                                <td className={TD} title={d.ruc}>
                                    {d.name || d.ruc}
                                </td>
                                <td className={`${TD} whitespace-nowrap`}>
                                    {d.pdf ? (
                                        <a href={driveFile(d.pdf)} target="_blank" rel="noopener">
                                            {d.number}
                                        </a>
                                    ) : (
                                        d.number
                                    )}
                                </td>
                                <td className={TD}>{d.detractionIssue}</td>
                                <td className={`${TD} text-right whitespace-nowrap tabular-nums`}>{pen(d.detraction)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </details>
    );
}

/** Resolves the promise the page sent behind (same response, no second request). */
function useSalesTax(promise: Promise<SalesTaxResult>): SalesTaxResult | null {
    const [result, setResult] = useState<SalesTaxResult | null>(null);
    useEffect(() => {
        let live = true;
        promise.then((r) => live && setResult(r));
        return () => {
            live = false;
        };
    }, [promise]);
    return result;
}

function SalesTaxGap() {
    return (
        <Card
            className="mb-[18px]"
            title="Cuadre de ventas e IGV por mes"
            note="Como el PDT 621: ventas − notas de crédito = IGV del mes · de los XML emitidos, en soles"
        >
            <div className="flex flex-col gap-3">
                {[0, 1, 2, 3].map((i) => (
                    <Hueco key={i} className="h-8 w-full" />
                ))}
            </div>
        </Card>
    );
}

export function ImpuestosView({ salesTax }: { salesTax: Promise<SalesTaxResult> }) {
    const v = useSunatView();
    const { k, cur } = v;
    const tax = useSalesTax(salesTax);
    return (
        <>
            <PageHeader title="Impuestos" />
            <FilterBar {...v.bar} />
            <KpiGrid>
                <IgvKpi k={k} cur={cur} />
                <UntaxedKpi k={k} cur={cur} />
                <NotesKpi k={k} cur={cur} />
                <DetractionKpi k={k} />
            </KpiGrid>
            {tax === null ? (
                <SalesTaxGap />
            ) : 'error' in tax ? (
                <p className="mb-[18px] rounded-xl bg-warning-soft px-4 py-3 text-[13px] text-warning-strong">
                    No se pudo leer el cuadre de ventas de la base: {tax.error} El detalle está en el log del servidor.
                </p>
            ) : (
                tax.months.length > 0 && <SalesTax months={tax.months} chosen={v.lit} />
            )}
            {v.ready && <DetractionsToReview docs={v.shown.filter((d) => d.detractionIssue)} />}
        </>
    );
}
