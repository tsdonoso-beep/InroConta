'use client';

// The filters of a list of documents (date of issue, kind, origin, currency, amount and order) and
// the list of one RUC's documents with us (Consulta RUC) that uses them. Buscar factura uses the same
// filters over its rows. Everything is already in the browser (the docs store), so a filter answers
// at once; only the page on screen is drawn (shared/ui/pager.tsx). The filters, the order and the
// page go in the URL (?emision=&clase=&cv=&mon=&desde=&hasta=&cpe_orden=&cpe_pag=): the two screens
// never show it at once, so they share one store.
import { useMemo } from 'react';
import {
    currenciesOf,
    DOC_LIST_DEFAULT,
    isFiltered,
    issueMonths,
    listDocs,
    sumsByCurrency,
    type Doc,
    type DocListFilter,
    type DocSort,
} from '../../../modules/comprobantes/application/views.ts';
import { CONTROL, Empty, FilterRow, Select, TextButton } from '../../../shared/ui/bits.tsx';
import { Card } from '../../../shared/ui/card.tsx';
import { money, thousands } from '../../../shared/ui/format.ts';
import { Pager, SortSelect, usePaged } from '../../../shared/ui/pager.tsx';
import { PeriodPicker } from '../../../shared/ui/period-picker.tsx';
import { urlState } from '../_lib/url-state.ts';
import { DocsTable, KIND_NAMES } from './docs-table.tsx';

const SORTS: { value: DocSort; label: string }[] = [
    { value: 'date-desc', label: 'Más recientes' },
    { value: 'date-asc', label: 'Más antiguos' },
    { value: 'amount-desc', label: 'Monto mayor' },
    { value: 'amount-asc', label: 'Monto menor' },
    { value: 'number', label: 'Número' },
];
const CURRENCY_NAMES: Record<string, string> = { PEN: 'Soles', USD: 'Dólares' };

/** '' → null (open bound); a typed amount → its number, commas aside. */
const bound = (v: string) => (v.trim() === '' || isNaN(Number(v.replace(/,/g, ''))) ? null : Number(v.replace(/,/g, '')));

/** What the filters keep: as typed (the amounts too, so «12.» stays while writing). */
type DocListText = Omit<DocListFilter, 'min' | 'max'> & { min: string; max: string; page: string };

/** Not remembered: the documents of the next RUC open without the last one's filters. */
export const docList$ = urlState<DocListText>(
    { ...DOC_LIST_DEFAULT, min: '', max: '', page: '1' },
    { period: 'emision', kind: 'clase', origin: 'cv', currency: 'mon', min: 'desde', max: 'hasta', sort: 'cpe_orden', page: 'cpe_pag' },
    { kind: ['', ...Object.keys(KIND_NAMES)], origin: ['', 'compra', 'venta'], sort: SORTS.map((s) => s.value) },
    false,
);

function AmountBox({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
    return (
        <input
            inputMode="decimal"
            aria-label={placeholder}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${CONTROL} w-[120px]`}
        />
    );
}

export interface DocList {
    filter: DocListFilter;
    /** The amounts as typed. */
    text: { min: string; max: string };
    set: (patch: Partial<DocListText>) => void;
    /** The documents that pass, in order. */
    list: Doc[];
    clear: () => void;
}

export function useDocList(docs: Doc[]): DocList {
    const t = docList$.use();
    const filter = useMemo<DocListFilter>(
        () => ({ period: t.period, kind: t.kind, origin: t.origin, currency: t.currency, min: bound(t.min), max: bound(t.max), sort: t.sort }),
        [t],
    );
    const list = useMemo(() => listDocs(docs, filter), [docs, filter]);
    return {
        filter,
        text: { min: t.min, max: t.max },
        list,
        set: docList$.set,
        clear: () => docList$.set({ ...DOC_LIST_DEFAULT, min: '', max: '', sort: t.sort }),
    };
}

/** The filter bar. The kind, origin and currency choices show only what `docs` has. */
export function DocFilters({ docs, state }: { docs: Doc[]; state: DocList }) {
    const { filter, set } = state;
    const months = useMemo(() => issueMonths(docs), [docs]);
    const currencies = useMemo(() => currenciesOf(docs), [docs]);
    const kinds = useMemo(() => (Object.keys(KIND_NAMES) as Doc['kind'][]).filter((k) => docs.some((d) => d.kind === k)), [docs]);
    const origins = useMemo(() => new Set(docs.map((d) => d.origin)), [docs]);
    return (
        <FilterRow>
            <PeriodPicker value={filter.period} onChange={(period) => set({ period })} months={months} allLabel="Toda fecha de emisión" />
            {kinds.length > 1 && (
                <Select label="Tipo" value={filter.kind} onChange={(v) => set({ kind: v as DocListFilter['kind'] })}>
                    <option value="">Todo tipo</option>
                    {kinds.map((k) => (
                        <option key={k} value={k}>
                            {KIND_NAMES[k]}
                        </option>
                    ))}
                </Select>
            )}
            {origins.size > 1 && (
                <Select label="Compra o venta" value={filter.origin} onChange={(v) => set({ origin: v as DocListFilter['origin'] })}>
                    <option value="">Compras y ventas</option>
                    <option value="compra">Compras</option>
                    <option value="venta">Ventas</option>
                </Select>
            )}
            {currencies.length > 1 && (
                <Select label="Moneda" value={filter.currency} onChange={(currency) => set({ currency })}>
                    <option value="">Toda moneda</option>
                    {currencies.map((c) => (
                        <option key={c} value={c}>
                            {CURRENCY_NAMES[c] ?? c}
                        </option>
                    ))}
                </Select>
            )}
            <span className="flex items-center gap-1.5">
                <AmountBox placeholder="Monto desde" value={state.text.min} onChange={(min) => set({ min })} />
                <AmountBox placeholder="hasta" value={state.text.max} onChange={(max) => set({ max })} />
            </span>
            <SortSelect value={filter.sort} onChange={(sort) => set({ sort })} options={SORTS} />
            {isFiltered(filter) && <TextButton onClick={state.clear}>Quitar filtros</TextButton>}
        </FilterRow>
    );
}

/** «40 de 128 comprobantes» when filtered; the sums per currency of what passes. */
export function listTitle(state: DocList, all: number, noun: string) {
    const n = state.list.length;
    return {
        title: isFiltered(state.filter) ? `${thousands(n)} de ${thousands(all)} ${noun}` : `${thousands(all)} ${noun}`,
        sums: n
            ? sumsByCurrency(state.list)
                  .map((s) => money(s.amount, s.currency))
                  .join(' · ')
            : undefined,
    };
}

export function DocsList({ docs }: { docs: Doc[] }) {
    const state = useDocList(docs);
    const paged = usePaged(state.list, null, undefined, docList$.usePage());
    const { title, sums } = listTitle(state, docs.length, 'comprobantes con nosotros');
    return (
        <Card title={title} note={sums}>
            <DocFilters docs={docs} state={state} />
            {paged.total ? <DocsTable docs={paged.rows} withProvider={false} /> : <Empty>Ningún comprobante con esos filtros.</Empty>}
            <Pager paged={paged} />
        </Card>
    );
}
