// The table of invoices without OC: one row per invoice, as the old pintarSinOc() drew it.
import { supplierOcsShort, type NoOcInvoice } from '../../../modules/legajo/application/views.ts';
import { Chip } from '../../../shared/ui/card.tsx';
import { Empty, T } from '../../../shared/ui/bits.tsx';
import { LINK_CLASS } from '../../../shared/ui/button.tsx';
import { dmy, driveFile, money } from '../../../shared/ui/format.ts';
import { Hueco } from '../../../shared/ui/hueco.tsx';

const HEADERS = ['Señal', 'Fecha', 'Proveedor', 'Comprobante', 'Total', 'A quién le toca', 'Por qué'];

function Head() {
    return (
        <thead>
            <tr className={T.headRow}>
                {HEADERS.map((h) => (
                    <th key={h} className={h === 'Total' ? T.thNum : T.th}>
                        {h}
                    </th>
                ))}
            </tr>
        </thead>
    );
}

function Row({ x }: { x: NoOcInvoice }) {
    const ocs = supplierOcsShort(x.supplierOcs);
    return (
        <tr className={T.row}>
            <td className={T.td}>
                <Chip tone={x.signal === 'ALTA' ? 'danger' : 'warn'}>{x.signal}</Chip>
            </td>
            <td className={`${T.td} whitespace-nowrap`}>{dmy(x.issuedOn)}</td>
            <td className={T.td}>
                {x.name}
                <div className={T.sub}>{x.ruc}</div>
            </td>
            <td className={`${T.td} whitespace-nowrap`}>
                {x.pdf ? (
                    <a href={driveFile(x.pdf)} target="_blank" rel="noopener" className={LINK_CLASS}>
                        {x.number}
                    </a>
                ) : (
                    x.number
                )}
            </td>
            <td className={T.tdNum}>
                <b>{money(x.total, x.currency)}</b>
            </td>
            <td className={T.td}>
                {x.likelyBuyer || <span className="text-ink-3">por identificar</span>}
                <div className={T.sub}>{x.likelyArea}</div>
            </td>
            <td className={T.td}>
                <div className="text-[11.5px] text-ink-3">
                    {x.reason}
                    {ocs && (
                        <>
                            <br />
                            OC del proveedor: {ocs}
                        </>
                    )}
                </div>
            </td>
        </tr>
    );
}

export function NoOcTable({ rows }: { rows: NoOcInvoice[] }) {
    if (!rows.length) return <Empty>Ninguna factura con este filtro.</Empty>;
    return (
        <div className="overflow-x-auto">
            <table className={T.table}>
                <Head />
                <tbody>
                    {rows.map((x, i) => (
                        <Row key={`${x.ruc}-${x.number}-${i}`} x={x} />
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/** The table while the board travels: the real header, rows of gaps. */
export function NoOcTableGap() {
    return (
        <div className="overflow-x-auto">
            <table className={T.table}>
                <Head />
                <tbody>
                    {Array.from({ length: 6 }, (_, i) => (
                        <tr key={i} className={T.row}>
                            {HEADERS.map((h) => (
                                <td key={h} className={T.td}>
                                    <Hueco className="h-4 w-20" />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
