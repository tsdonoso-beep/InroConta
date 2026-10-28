'use client';

// One invoice found by Buscar factura: date, number, party, total, OC and its files; a click
// opens its detail. The row of buscarFacturas (VistaEjecutivaPagina.html).
import type { MouseEvent } from 'react';
import type { Doc } from '../../../modules/comprobantes/application/views.ts';
import { Chip } from '../../../shared/ui/card.tsx';
import { driveFile, money, monthLabel } from '../../../shared/ui/format.ts';
import { Hueco } from '../../../shared/ui/hueco.tsx';
import type { RucIndex } from '../_lib/stores.ts';
import { GoodTaxpayerMark } from '../_ruc/taxpayer-card.tsx';
import { InvoiceDetail } from './invoice-detail.tsx';

const KIND_NAME = { F: 'Factura', B: 'Boleta', C: 'Nota de crédito', D: 'Nota de débito', O: 'Comprobante' } as const;

// On a phone only number, party, total and files stay (the old 980 px rule).
const GRID =
    'grid items-center gap-3 rounded-lg border-t border-line px-2 py-[11px] first:border-t-0 grid-cols-[minmax(0,1fr)_auto] gap-y-1 lg:grid-cols-[92px_minmax(0,1.1fr)_minmax(0,1.6fr)_130px_minmax(0,1fr)_130px]';
const SUB = 'mt-0.5 text-[11.5px] text-ink-3';
const FILE = 'rounded-[7px] bg-primary-soft px-[9px] py-[5px] text-[12.5px] font-semibold whitespace-nowrap text-primary no-underline hover:bg-primary-line';

function Files({ d }: { d: Doc }) {
    const k = d.detractionProof;
    const stop = (e: MouseEvent) => e.stopPropagation();
    return (
        <div className="flex justify-end gap-2">
            {d.pdf && (
                <a className={FILE} href={driveFile(d.pdf)} target="_blank" rel="noopener" onClick={stop}>
                    PDF ↗
                </a>
            )}
            {d.xml && (
                <a className={FILE} href={driveFile(d.xml)} target="_blank" rel="noopener" onClick={stop}>
                    XML ↗
                </a>
            )}
            {k?.pdf && (
                <a
                    className={FILE}
                    href={driveFile(k.pdf)}
                    target="_blank"
                    rel="noopener"
                    onClick={stop}
                    title={`Constancia de detracción N.° ${k.constancia}`}
                >
                    Detracción ↗
                </a>
            )}
        </div>
    );
}

export function InvoiceRow({ d, idx, open, onToggle }: { d: Doc; idx: RucIndex; open: boolean; onToggle: () => void }) {
    return (
        <>
            <div
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onClick={onToggle}
                onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    onToggle();
                }}
                className={`${GRID} cursor-pointer hover:bg-surface-2 ${open ? 'bg-surface-2' : ''}`}
            >
                <div className="text-[13px] text-ink-2 max-lg:hidden">{d.issuedOn || monthLabel(d.period)}</div>
                <div>
                    <div className="font-bold tabular-nums">{d.number}</div>
                    <div className={SUB}>
                        {KIND_NAME[d.kind]} · {d.origin === 'venta' ? 'emitida' : 'recibida'}
                    </div>
                    {(d.plate || d.fuel) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                            {d.plate ? (
                                <Chip tone="info">Placa {d.plate}</Chip>
                            ) : (
                                <Chip tone="danger" title="Sin la placa del vehículo, el combustible no sustenta gasto ni crédito fiscal">
                                    Combustible sin placa
                                </Chip>
                            )}
                        </div>
                    )}
                </div>
                <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold">{d.name || d.ruc}</div>
                    <div className={SUB}>
                        {d.ruc}
                        {idx.card(d.ruc)?.goodTaxpayer && (
                            <>
                                {' · '}
                                <GoodTaxpayerMark />
                            </>
                        )}
                    </div>
                </div>
                <div className={`text-right font-bold whitespace-nowrap tabular-nums ${d.total < 0 ? 'text-danger' : ''}`}>{money(d.total, d.currency)}</div>
                <div className="max-lg:hidden">{d.oc ? <Chip tone="info">OC {d.oc}</Chip> : <span className="text-xs text-ink-3">sin OC</span>}</div>
                <Files d={d} />
            </div>
            {open && <InvoiceDetail d={d} idx={idx} />}
        </>
    );
}

export function InvoiceRowGap() {
    return (
        <div className={GRID}>
            <Hueco className="h-4 w-20 max-lg:hidden" />
            <Hueco className="h-8 w-28" />
            <Hueco className="h-8 w-48" />
            <Hueco className="ml-auto h-4 w-24" />
            <Hueco className="h-5 w-24 max-lg:hidden" />
            <Hueco className="ml-auto h-6 w-24" />
        </div>
    );
}
