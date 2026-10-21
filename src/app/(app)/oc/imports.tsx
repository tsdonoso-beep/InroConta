'use client';

// The local expenses of each import PO (freight, customs, courier…): the port of pintarImpo()
// of the Apps Script view. All the POs, found by OC or supplier, in the order asked and in pages.
import { useMemo, useState } from 'react';
import { importsByPo, legajoTone, pickImports, type Doc, type ImportSort } from '../../../modules/comprobantes/application/views.ts';
import { Empty, FilterRow, SearchBox, T } from '../../../shared/ui/bits.tsx';
import { Chip } from '../../../shared/ui/card.tsx';
import { parsePeriod, periodLabel } from '../../../shared/period.ts';
import { money } from '../../../shared/ui/format.ts';
import { Pager, SortSelect, usePaged } from '../../../shared/ui/pager.tsx';

const SORTS: { value: ImportSort; label: string }[] = [
    { value: 'spend-desc', label: 'Más gasto' },
    { value: 'spend-asc', label: 'Menos gasto' },
    { value: 'docs', label: 'Más comprobantes' },
    { value: 'oc', label: 'Número de OC' },
];

export function Imports({ docs, period, currency }: { docs: Doc[]; period: string; currency: string }) {
    const all = useMemo(() => importsByPo(docs, period, currency), [docs, period, currency]);
    const [text, setText] = useState('');
    const [sort, setSort] = useState<ImportSort>('spend-desc');
    const list = useMemo(() => pickImports(all, text, sort), [all, text, sort]);
    const paged = usePaged(list, `${text}|${sort}|${period}|${currency}`, 10);
    if (!all.length) return <Empty>Todavía no hay facturas unidas a OC de importación{period ? ` en ${periodLabel(parsePeriod(period))}` : ''}.</Empty>;
    return (
        <>
            {all.length > 10 && (
                <FilterRow>
                    <SearchBox value={text} onChange={setText} placeholder="OC o proveedor" />
                    <SortSelect value={sort} onChange={setSort} options={SORTS} />
                </FilterRow>
            )}
            {!list.length && <Empty>Ninguna importación con «{text.trim()}».</Empty>}
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
                        {paged.rows.map((o) => (
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
            <Pager paged={paged} />
        </>
    );
}
