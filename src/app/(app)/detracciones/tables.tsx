// The two tables of Detracciones: the proofs (pintarDetrTabla) and the invoices with detraction
// that have none (pintarDetrSin), each cut at `shown` rows with «Ver más».
import {
    counterpart,
    depositDifference,
    docNumber,
    goodsLabel,
    type DetractionFilters,
    type MissingProof,
    type Proof,
} from '../../../modules/detracciones/application/views.ts';
import { Empty, MoreButton, T } from '../../../shared/ui/bits.tsx';
import { Chip } from '../../../shared/ui/card.tsx';
import { dmy, driveFile, monthLabel } from '../../../shared/ui/format.ts';
import { CaseChip, inCurrency, partyLabel, soles } from './labels.tsx';

type Dir = DetractionFilters['direction'];
/** Rows per «Ver más» (the old view's 25). */
export const STEP = 25;

function DocLink({ pdf, children }: { pdf: string; children: string }) {
    return pdf ? (
        <a href={driveFile(pdf)} target="_blank" rel="noopener">
            {children}
        </a>
    ) : (
        <b>{children}</b>
    );
}

function ProofRow({ p }: { p: Proof }) {
    const c = counterpart(p),
        dif = depositDifference(p),
        doc = docNumber(p.series, p.number);
    return (
        <tr className={T.row}>
            <td className={T.td}>
                <CaseChip name={p.case} />
                <div className={T.sub}>{p.direction === 'venta' ? 'Venta' : 'Compra'}</div>
            </td>
            <td className={`${T.td} whitespace-nowrap`}>
                {dmy(p.paidOn)}
                <div className={T.sub}>
                    período {monthLabel(p.period)}
                    {p.monthsToPay != null && p.monthsToPay >= 2 && <span className="text-danger"> · {p.monthsToPay} meses después</span>}
                </div>
            </td>
            <td className={T.td}>
                {c.name}
                <div className={T.sub}>{c.id}</div>
            </td>
            <td className={`${T.td} whitespace-nowrap`}>
                <DocLink pdf={p.invoicePdf}>{doc}</DocLink>
                <div className={T.sub}>
                    {p.invoiceIn === 'No encontrada' ? 'factura no encontrada' : `en ${p.invoiceIn}`}
                    {p.invoiceTotal != null && ` · ${inCurrency(p.invoiceTotal, p.currency)}`}
                </div>
            </td>
            <td className={T.td}>
                <div className="text-[11.5px] text-ink-3" title={goodsLabel(p.goodsCode)}>
                    {goodsLabel(p.goodsCode)}
                </div>
            </td>
            <td className={T.tdNum}>
                <b>{soles(p.deposited)}</b>
                {p.operation && <div className={T.sub}>op. {p.operation}</div>}
            </td>
            <td className={T.tdNum}>
                {dif != null ? (
                    <>
                        {soles(p.invoiceDetraction)}
                        {Math.abs(dif) > 1 && (
                            <div className={`${T.sub} text-danger`}>
                                dif. {dif > 0 ? '+' : ''}
                                {soles(dif)}
                            </div>
                        )}
                    </>
                ) : (
                    <span className="text-xs text-ink-3">no declara</span>
                )}
            </td>
            <td className={T.td}>
                <div className="flex justify-end gap-2.5 text-[12.5px] font-semibold whitespace-nowrap">
                    {p.proofPdf && (
                        <a href={driveFile(p.proofPdf)} target="_blank" rel="noopener">
                            PDF ↗
                        </a>
                    )}
                    {p.proofHtml && (
                        <a href={driveFile(p.proofHtml)} target="_blank" rel="noopener">
                            HTML ↗
                        </a>
                    )}
                </div>
                <div className={`${T.sub} text-right`}>N.° {p.constancia}</div>
            </td>
        </tr>
    );
}

/** `proofs` already sorted (latest payment first). */
export function ProofsTable({ proofs, direction, shown, onMore }: { proofs: Proof[]; direction: Dir; shown: number; onMore: () => void }) {
    if (!proofs.length) return <Empty>Ninguna constancia con este filtro.</Empty>;
    return (
        <>
            <div className="overflow-x-auto">
                <table className={T.table}>
                    <thead>
                        <tr className={T.headRow}>
                            <th className={T.th}>Caso</th>
                            <th className={T.th}>Pago</th>
                            <th className={T.th}>{partyLabel(direction)}</th>
                            <th className={T.th}>Comprobante</th>
                            <th className={T.th}>Bien o servicio</th>
                            <th className={T.thNum}>Depositado</th>
                            <th className={T.thNum}>De la factura</th>
                            <th className={T.th}>Constancia</th>
                        </tr>
                    </thead>
                    <tbody>
                        {proofs.slice(0, shown).map((p, i) => (
                            <ProofRow key={`${p.constancia}-${p.series}-${p.number}-${i}`} p={p} />
                        ))}
                    </tbody>
                </table>
            </div>
            <MoreButton shown={shown} total={proofs.length} onMore={onMore} />
        </>
    );
}

function AgeChip({ months }: { months: number | null }) {
    if (months == null) return null;
    if (months >= 2) return <Chip tone="danger">{months} meses</Chip>;
    if (months === 1) return <Chip tone="warn">el mes pasado</Chip>;
    return <Chip tone="muted">este mes</Chip>;
}

export function MissingTable({ rows, direction, shown, onMore }: { rows: MissingProof[]; direction: Dir; shown: number; onMore: () => void }) {
    if (!rows.length) return <Empty>Todas las facturas con detracción de este filtro tienen su constancia.</Empty>;
    return (
        <>
            <div className="overflow-x-auto">
                <table className={T.table}>
                    <thead>
                        <tr className={T.headRow}>
                            <th className={T.th}>Emisión</th>
                            <th className={T.th}>{partyLabel(direction)}</th>
                            <th className={T.th}>Comprobante</th>
                            <th className={T.thNum}>Total</th>
                            <th className={T.thNum}>Detracción</th>
                            <th className={T.th}>Antigüedad</th>
                            <th className={T.th}>Según</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.slice(0, shown).map((m, i) => (
                            <tr key={`${m.ruc}-${m.series}-${m.number}-${i}`} className={T.row}>
                                <td className={`${T.td} whitespace-nowrap`}>
                                    {dmy(m.issuedOn)}
                                    <div className={T.sub}>
                                        período {monthLabel(m.period)} · {m.direction === 'venta' ? 'Venta' : 'Compra'}
                                    </div>
                                </td>
                                <td className={T.td}>
                                    {m.name || m.ruc}
                                    <div className={T.sub}>{m.ruc}</div>
                                </td>
                                <td className={`${T.td} whitespace-nowrap`}>
                                    <DocLink pdf={m.invoicePdf}>{docNumber(m.series, m.number)}</DocLink>
                                </td>
                                <td className={T.tdNum}>{inCurrency(m.total ?? 0, m.currency)}</td>
                                <td className={T.tdNum}>
                                    <b>{soles(m.detraction)}</b>
                                </td>
                                <td className={T.td}>
                                    <AgeChip months={m.monthsSinceIssue} />
                                </td>
                                <td className={T.td}>
                                    <span className="text-xs text-ink-3">{m.source}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <MoreButton shown={shown} total={rows.length} onMore={onMore} />
        </>
    );
}
