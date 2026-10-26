'use client';

// The local expenses of each import PO (freight, customs, courier…): the port of pintarImpo()
// of the Apps Script view. All the POs, found by OC or supplier, in the order asked and in pages;
// the search, the order and the page go in the URL (?impo=&impo_orden=&impo_pag=), for a link.
import { useMemo } from 'react';
import { importsByPo, legajoTone, pickImports, type Doc, type ImportSort } from '../../../modules/comprobantes/application/views.ts';
import { Empty, FilterRow, SearchBox, T } from '../../../shared/ui/bits.tsx';
import { Chip } from '../../../shared/ui/card.tsx';
import { parsePeriod, periodLabel } from '../../../shared/period.ts';
import { money } from '../../../shared/ui/format.ts';
import { Pager, SortSelect, usePaged } from '../../../shared/ui/pager.tsx';
import { urlState } from '../_lib/url-state.ts';

const SORTS: { value: ImportSort; label: string }[] = [
    { value: 'spend-desc', label: 'Más gasto' },
    { value: 'spend-asc', label: 'Menos gasto' },
    { value: 'docs', label: 'Más comprobantes' },
    { value: 'oc', label: 'Número de OC' },
];

const view$ = urlState(
    { text: '', sort: 'spend-desc' as ImportSort, page: '1' },
    { text: 'impo', sort: 'impo_orden', page: 'impo_pag' },
    { sort: SORTS.map((s) => s.value) },
);

export function Imports({ docs, period, currency }: { docs: Doc[]; period: string; currency: string }) {
    const all = useMemo(() => importsByPo(docs, period, currency), [docs, period, currency]);
    const { text, sort } = view$.use();
    const setText = (t: string) => view$.set({ text: t });
    const setSort = (s: ImportSort) => view$.set({ sort: s });
    const list = useMemo(() => pickImports(all, text, sort), [all, text, sort]);
    const paged = usePaged(list, null, 10, view$.usePage());
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
