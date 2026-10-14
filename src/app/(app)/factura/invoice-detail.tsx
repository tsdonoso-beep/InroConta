'use client';

// What opens under an invoice in Buscar factura: payment, guide, OC, detraction proof, the
// supplier's card and its lines (asked the first time it opens). The port of abrirFactura and
// constanciaDe (VistaEjecutivaPagina.html).
import type { ReactNode } from 'react';
import { splitNumber, type DetractionProof, type Doc } from '../../../modules/comprobantes/application/views.ts';
import { placeOf } from '../../../modules/ruc/application/views.ts';
import { Chip } from '../../../shared/ui/card.tsx';
import { T } from '../../../shared/ui/bits.tsx';
import { driveFile, driveFolder, money } from '../../../shared/ui/format.ts';
import { Hueco } from '../../../shared/ui/hueco.tsx';
import { linesStore, type RucIndex } from '../_lib/stores.ts';

const Meta = ({ label, children, title }: { label: string; children: ReactNode; title?: string }) => (
    <span title={title}>
        {label}: <b className="text-ink">{children}</b>
    </span>
);

const DriveLink = ({ href, children, title }: { href: string; children: ReactNode; title?: string }) => (
    <a href={href} target="_blank" rel="noopener" title={title}>
        <b>{children}</b>
    </a>
);

/** The detraction proof of the invoice (migration 066 columns in the DETALLE). */
function ProofBits({ k }: { k: DetractionProof }) {
    const tone = k.status === 'Con constancia' ? 'ok' : k.status === 'Revisar monto' ? 'danger' : 'warn';
    return (
        <>
            {k.status && <Chip tone={tone}>{k.status}</Chip>}
            {k.constancia && (
                <span>
                    Constancia: <b className="text-ink">{k.constancia}</b>
                    {k.paidOn && ` · pagada el ${k.paidOn}`}
                    {k.deposited != null && ` · depositado ${money(k.deposited, 'PEN')}`}
                </span>
            )}
            {k.pdf && <DriveLink href={driveFile(k.pdf)}>Constancia PDF ↗</DriveLink>}
            {k.html && <DriveLink href={driveFile(k.html)}>Constancia HTML ↗</DriveLink>}
        </>
    );
}

function PartyBits({ d, idx }: { d: Doc; idx: RucIndex }) {
    const f = idx.card(d.ruc);
    if (!f) return null;
    const place = placeOf(f);
    return (
        <>
            <span>
                {d.origin === 'venta' ? 'Cliente' : 'Proveedor'}:{' '}
                <b className="text-ink">
                    {f.goodTaxpayer ? 'Buen contribuyente' : f.checkedOn ? 'no es buen contribuyente' : 'buen contribuyente sin consultar'}
                </b>
                {f.withholdingAgent && ' · agente de retención'}
                {f.perceptionAgent && ' · agente de percepción'}
            </span>
            {place && (
                <Meta label="Domicilio fiscal" title={f.address}>
                    {place}
                </Meta>
            )}
        </>
    );
}

export function InvoiceDetail({ d, idx }: { d: Doc; idx: RucIndex }) {
    const { series, num } = splitNumber(d.number);
    const { data: r, error } = linesStore.use(`${d.ruc}|${series}|${num}`);
    const box = 'mb-2 rounded-[10px] border border-line bg-surface-2 px-4 pt-3.5 pb-4';
    if (error)
        return (
            <div className={box}>
                <p className="text-[13px] text-ink-3">{error} El detalle está en el log del servidor.</p>
            </div>
        );
    if (!r)
        return (
            <div className={box}>
                <div className="flex items-center gap-2 text-[13px] text-ink-2">
                    <Hueco className="h-4 w-4 rounded-full" /> Trayendo el detalle…
                </div>
            </div>
        );
    return (
        <div className={box}>
            <div className="mb-3 flex flex-wrap items-center gap-x-[22px] gap-y-2 text-[12.5px] text-ink-2">
                {r.paymentForm && <Meta label="Forma de pago">{r.paymentForm}</Meta>}
                {r.dispatchGuide && <Meta label="Guía">{r.dispatchGuide}</Meta>}
                {r.supplierOc && <Meta label="OC que cita el proveedor">{r.supplierOc}</Meta>}
                {!!r.detraction && <Meta label="Detracción">{money(r.detraction, d.currency)}</Meta>}
                {d.detractionProof && <ProofBits k={d.detractionProof} />}
                {d.oc && (
                    <Meta label="OC">
                        {d.oc}
                        {d.ocPayment && ` · ${d.ocPayment}`}
                    </Meta>
                )}
                {r.costCenter && <Meta label="Centro de costo">{r.costCenter}</Meta>}
                <PartyBits d={d} idx={idx} />
                {r.buyer && <Meta label="Comprador">{r.buyer}</Meta>}
                {d.oc && d.ocLegajo && <Chip tone={/^Completo/.test(d.ocLegajo) ? 'ok' : 'warn'}>{d.ocLegajo}</Chip>}
                {d.oc && d.ocFolder && <DriveLink href={driveFolder(d.ocFolder)}>Carpeta de la OC ↗</DriveLink>}
            </div>
            <div className="overflow-x-auto">
                <table className={T.table}>
                    <thead>
                        <tr className={T.headRow}>
                            <th className={T.th}>Producto o servicio</th>
                            <th className={T.thNum}>Cantidad</th>
                            <th className={T.thNum}>Precio unitario</th>
                            <th className={T.thNum}>Importe</th>
                        </tr>
                    </thead>
                    <tbody>
                        {r.lines.map((l, i) => (
                            <tr key={i} className={T.row}>
                                <td className={T.td}>{l.description}</td>
                                <td className={T.tdNum}>
                                    {l.quantity} {l.unit}
                                </td>
                                <td className={T.tdNum}>{money(l.unitPrice, d.currency)}</td>
                                <td className={T.tdNum}>
                                    <b>{money(l.amount, d.currency)}</b>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
