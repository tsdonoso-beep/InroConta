// The documents of a RUC (Consulta RUC) or of the SSCO suppliers (from Resumen's warning). The
// port of docsTable (VistaConsultaRuc.html).
import type { Doc } from '../../../modules/comprobantes/application/views.ts';
import { T } from '../../../shared/ui/bits.tsx';
import { driveFile, money } from '../../../shared/ui/format.ts';

export const KIND_NAMES = { F: 'Factura', B: 'Boleta', C: 'Nota de crédito', D: 'Nota de débito', O: 'Otro' } as const;

export function DocsTable({ docs, withProvider }: { docs: Doc[]; withProvider: boolean }) {
    return (
        <div className="overflow-x-auto">
            <table className={T.table}>
                <thead>
                    <tr className={T.headRow}>
                        {withProvider && <th className={T.th}>Proveedor</th>}
                        <th className={T.th}>Comprobante</th>
                        <th className={T.th}>Tipo</th>
                        <th className={T.th}>Emisión</th>
                        <th className={T.th} />
                        <th className={T.thNum}>Monto</th>
                    </tr>
                </thead>
                <tbody>
                    {docs.map((d) => (
                        <tr key={`${d.ruc}|${d.kind}|${d.number}|${d.origin}`} className={T.row}>
                            {withProvider && (
                                <td className={T.td}>
                                    {d.name || d.ruc}
                                    <div className={T.sub}>RUC {d.ruc}</div>
                                </td>
                            )}
                            <td className={`${T.td} whitespace-nowrap`}>
                                {d.pdf ? (
                                    <a href={driveFile(d.pdf)} target="_blank" rel="noopener">
                                        {d.number}
                                    </a>
                                ) : (
                                    d.number
                                )}
                            </td>
                            <td className={T.td}>{KIND_NAMES[d.kind]}</td>
                            <td className={`${T.td} whitespace-nowrap`}>{d.issuedOn || '—'}</td>
                            <td className={T.td}>{d.origin === 'compra' ? 'Compra' : d.origin === 'venta' ? 'Venta' : ''}</td>
                            <td className={T.tdNum}>{money(d.total, d.currency)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
