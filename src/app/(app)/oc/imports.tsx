// The local expenses of each import PO (freight, customs, courier…): the port of pintarImpo()
// of the Apps Script view. The first 10 POs, the biggest first.
import { importsByPo, legajoTone, type Doc } from '../../../modules/comprobantes/application/views.ts';
import { Empty, T } from '../../../shared/ui/bits.tsx';
import { Chip } from '../../../shared/ui/card.tsx';
import { parsePeriod, periodLabel } from '../../../shared/period.ts';
import { money } from '../../../shared/ui/format.ts';

const SHOWN = 10;

export function Imports({ docs, period, currency }: { docs: Doc[]; period: string; currency: string }) {
    const list = importsByPo(docs, period, currency);
    if (!list.length) return <Empty>Todavía no hay facturas unidas a OC de importación{period ? ` en ${periodLabel(parsePeriod(period))}` : ''}.</Empty>;
    return (
        <>
            <div className="overflow-x-auto">
                <table className={T.table}>
                    <thead>
                        <tr className={T.headRow}>
                            <th className={T.th}>OC</th>
                            <th className={T.th}>Proveedores en Perú</th>
                            <th className={T.thNum}>Gastos</th>
                            <th className={T.th}>Legajo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {list.slice(0, SHOWN).map((o) => (
                            <tr key={o.oc} className={T.row}>
                                <td className={T.td}>
                                    <b>{o.oc}</b>
                                    <div className={T.sub}>{o.status}</div>
                                </td>
                                <td className={T.td}>
                                    {o.suppliers.join(' / ')}
                                    <div className={T.sub}>
                                        {o.docs} {o.docs === 1 ? 'comprobante' : 'comprobantes'}
                                    </div>
                                </td>
                                <td className={T.tdNum}>
                                    {Object.entries(o.byCurrency).map(([c, n]) => (
                                        <b key={c} className="block">
                                            {money(n, c)}
                                        </b>
                                    ))}
                                </td>
                                <td className={`${T.td} [&>span]:whitespace-normal`}>{o.legajo && <Chip tone={legajoTone(o.legajo)}>{o.legajo}</Chip>}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {list.length > SHOWN && <p className="mt-2 text-xs text-ink-3">y {list.length - SHOWN} importaciones más (las de menos gasto).</p>}
        </>
    );
}
