// The tables of Retenciones: the CRE with the invoices they cover; the wrong retentions (an ERROR:
// the invoice has a detraction); the invoices the base has not read yet (NOT an error). One page
// at a time.
import type { Retention, RetentionItem } from '../../../modules/retenciones/application/views.ts';
import { Empty, T } from '../../../shared/ui/bits.tsx';
import { Chip } from '../../../shared/ui/card.tsx';
import { LINK_CLASS as LINK } from '../../../shared/ui/button.tsx';
import { dmy, driveFile } from '../../../shared/ui/format.ts';
import { Pager, type Paged } from '../../../shared/ui/pager.tsx';
import { inCurrency, soles } from '../detracciones/labels.tsx';

function FileLinks({ pdf, xml }: { pdf: string; xml: string }) {
    return (
        <div className="flex justify-end gap-2.5 text-[12.5px] font-semibold whitespace-nowrap">
            {pdf && (
                <a href={driveFile(pdf)} target="_blank" rel="noopener" className={LINK}>
                    PDF ↗
                </a>
            )}
            {xml && (
                <a href={driveFile(xml)} target="_blank" rel="noopener" className={LINK}>
                    XML ↗
                </a>
            )}
        </div>
    );
}

function CreRow({ r }: { r: Retention }) {
    const reverted = r.status === 'REVERTIDO';
    return (
        <tr className={`${T.row} ${reverted ? 'text-ink-3' : ''}`}>
            <td className={`${T.td} whitespace-nowrap`}>
                <b>{r.cre}</b>
                <div className={T.sub}>{dmy(r.issuedOn)}</div>
            </td>
            <td className={T.td}>
                {r.supplierName || r.supplierRuc}
                <div className={T.sub}>RUC {r.supplierRuc}</div>
            </td>
            <td className={T.td}>
                {r.docs.map((d) => (
                    <div key={d.number} className="whitespace-nowrap">
                        {d.invoicePdf ? (
                            <a href={driveFile(d.invoicePdf)} target="_blank" rel="noopener" className={LINK}>
                                {d.number}
                            </a>
                        ) : (
                            d.number
                        )}
                        <span className={T.sub}>
                            {' '}
                            · {d.total != null ? inCurrency(d.total, d.currency) : '—'} · pagada {dmy(d.paidOn)}
                        </span>
                    </div>
                ))}
            </td>
            <td className={T.tdNum}>{soles(r.base)}</td>
            <td className={T.tdNum}>
                <b>{soles(r.retained)}</b>
            </td>
            <td className={T.td}>
                {reverted ? (
                    <Chip tone="muted" title={r.revertReason || undefined}>
                        Revertido{r.revertedOn ? ` el ${dmy(r.revertedOn)}` : ''}
                    </Chip>
                ) : (
                    <Chip tone="ok">Emitido</Chip>
                )}
            </td>
            <td className={T.td}>
                <FileLinks pdf={r.pdf} xml={r.xml} />
            </td>
        </tr>
    );
}

export function CreTable({ paged }: { paged: Paged<Retention> }) {
    if (!paged.total) return <Empty>Ningún comprobante de retención con este filtro.</Empty>;
    return (
        <>
            <div className="overflow-x-auto">
                <table className={T.table}>
                    <thead>
                        <tr className={T.headRow}>
                            <th className={T.th}>CRE</th>
                            <th className={T.th}>Proveedor</th>
                            <th className={T.th}>Facturas</th>
                            <th className={T.thNum}>Pago</th>
                            <th className={T.thNum}>Retenido</th>
                            <th className={T.th}>Estado</th>
                            <th className={T.th} />
                        </tr>
                    </thead>
                    <tbody>
                        {paged.rows.map((r) => (
                            <CreRow key={r.cre} r={r} />
                        ))}
                    </tbody>
                </table>
            </div>
            <Pager paged={paged} />
        </>
    );
}

function Invoice({ d }: { d: RetentionItem['doc'] }) {
    return (
        <td className={`${T.td} whitespace-nowrap`}>
            {d.invoicePdf ? (
                <a href={driveFile(d.invoicePdf)} target="_blank" rel="noopener" className={LINK}>
                    {d.number}
                </a>
            ) : (
                <b>{d.number}</b>
            )}
            <div className={T.sub}>
                {dmy(d.issuedOn)} · {d.total != null ? inCurrency(d.total, d.currency) : '—'}
            </div>
        </td>
    );
}

function Supplier({ r }: { r: RetentionItem['retention'] }) {
    return (
        <td className={T.td}>
            {r.supplierName || r.supplierRuc}
            <div className={T.sub}>RUC {r.supplierRuc}</div>
        </td>
    );
}

function Cre({ r }: { r: RetentionItem['retention'] }) {
    return (
        <td className={`${T.td} whitespace-nowrap`}>
            {r.pdf ? (
                <a href={driveFile(r.pdf)} target="_blank" rel="noopener" className={LINK}>
                    {r.cre}
                </a>
            ) : (
                r.cre
            )}
            <div className={T.sub}>{dmy(r.issuedOn)}</div>
        </td>
    );
}

/** ERROR: the invoice declares a detraction, so it should not have been retained (one or the other). */
export function WrongTable({ paged }: { paged: Paged<RetentionItem> }) {
    if (!paged.total) return <Empty>Ninguna: ninguna factura con detracción tiene además retención.</Empty>;
    return (
        <>
            <div className="overflow-x-auto">
                <table className={T.table}>
                    <thead>
                        <tr className={T.headRow}>
                            <th className={T.th}>Factura</th>
                            <th className={T.th}>Proveedor</th>
                            <th className={T.th}>CRE</th>
                            <th className={T.thNum}>Retenido</th>
                            <th className={T.thNum}>Detracción de la factura</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paged.rows.map(({ retention: r, doc: d }) => (
                            <tr key={`${r.cre}|${d.number}`} className={T.row}>
                                <Invoice d={d} />
                                <Supplier r={r} />
                                <Cre r={r} />
                                <td className={T.tdNum}>
                                    <b className="text-danger">{soles(d.retained)}</b>
                                </td>
                                <td className={T.tdNum}>{soles(d.detraction)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Pager paged={paged} />
        </>
    );
}

/** NOT an error: the CRE names an invoice the base does not have yet; it fills in by itself. */
export function UnreadTable({ paged }: { paged: Paged<RetentionItem> }) {
    if (!paged.total) return <Empty>Ninguna: todas las facturas de los CRE están en la base.</Empty>;
    return (
        <>
            <div className="overflow-x-auto">
                <table className={T.table}>
                    <thead>
                        <tr className={T.headRow}>
                            <th className={T.th}>Factura</th>
                            <th className={T.th}>Proveedor</th>
                            <th className={T.th}>CRE</th>
                            <th className={T.thNum}>Retenido</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paged.rows.map(({ retention: r, doc: d }) => (
                            <tr key={`${r.cre}|${d.number}`} className={T.row}>
                                <Invoice d={d} />
                                <Supplier r={r} />
                                <Cre r={r} />
                                <td className={T.tdNum}>{soles(d.retained)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Pager paged={paged} />
        </>
    );
}
