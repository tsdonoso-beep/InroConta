'use client';

// Every RUC with us in Consulta RUC, searched by what is typed (words of the RUC or the name):
// suppliers or customers, companies or people, what SUNAT says of each (good taxpayer, agents,
// state, SSCO) and the order (the last or the first document with us, how many, how much, the
// name). Below, the SSCO subjects the search names that we never dealt with. The filters, the
// order and the page go in the URL (?rol=&tipo=&sunat=&orden=&pag=), so a shared link shows the
// same list and coming back from a RUC («‹ Volver») finds it as it was.
import { useEffect, useMemo, useRef } from 'react';
import { partiesByLastDoc, type Party } from '../../../modules/comprobantes/application/views.ts';
import {
    flagNeedsLists,
    isOdd,
    isPartyFiltered,
    listParties,
    PARTY_FILTER_DEFAULT,
    sscoByName,
    type PartyFlag,
    type PartyRole,
    type PartySort,
    type PartyType,
} from '../../../modules/ruc/application/views.ts';
import { Empty, FilterRow, Select, TextButton } from '../../../shared/ui/bits.tsx';
import { Card, Chip, Segmented } from '../../../shared/ui/card.tsx';
import { money, thousands } from '../../../shared/ui/format.ts';
import { Hueco } from '../../../shared/ui/hueco.tsx';
import { Pager, SortSelect, usePaged } from '../../../shared/ui/pager.tsx';
import { useDocs } from '../_comprobantes/docs-store.ts';
import { useRucIndex, type RucIndex } from '../_lib/stores.ts';
import { urlState } from '../_lib/url-state.ts';
import { openRuc } from './query-store.ts';

const ROLES: { value: PartyRole; label: string }[] = [
    { value: '', label: 'Todos' },
    { value: 'supplier', label: 'Proveedores' },
    { value: 'customer', label: 'Clientes' },
];
const FLAGS: { value: PartyFlag; label: string }[] = [
    { value: 'good', label: 'Buen contribuyente' },
    { value: 'withholding', label: 'Agente de retención' },
    { value: 'perception', label: 'Agente de percepción' },
    { value: 'odd', label: 'No activo o no habido' },
    { value: 'ssco', label: 'En la lista SSCO' },
    { value: 'no-card', label: 'Sin ficha de SUNAT' },
];
const SORTS: { value: PartySort; label: string }[] = [
    { value: 'last-desc', label: 'Último comprobante' },
    { value: 'last-asc', label: 'Sin movimiento hace más' },
    { value: 'first-asc', label: 'Con nosotros hace más' },
    { value: 'first-desc', label: 'Nuevos con nosotros' },
    { value: 'docs-desc', label: 'Más comprobantes' },
    { value: 'amount-desc', label: 'Monto mayor (S/)' },
    { value: 'name', label: 'Razón social' },
];

const list$ = urlState(
    { ...PARTY_FILTER_DEFAULT, page: '1' },
    { role: 'rol', type: 'tipo', flag: 'sunat', sort: 'orden', page: 'pag' },
    { role: ROLES.map((r) => r.value), type: ['', 'company', 'person'], flag: ['', ...FLAGS.map((f) => f.value)], sort: SORTS.map((s) => s.value) },
);

/** A name search shorter than this does not look through the whole country's SSCO list. */
const SSCO_MIN = 3;

function Badges({ ruc, idx }: { ruc: string; idx: RucIndex }) {
    const card = idx.card(ruc);
    const ssco = idx.ssco(ruc);
    const odd = card && isOdd(card);
    if (!card?.goodTaxpayer && !card?.withholdingAgent && !card?.perceptionAgent && !odd && !ssco) return null;
    return (
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {ssco && <Chip tone="danger">SSCO</Chip>}
            {odd && (
                <span className="flex items-center gap-1 text-xs font-semibold text-danger-strong">
                    <span aria-hidden className="size-2 rounded-full bg-danger" />
                    {[card.state !== 'ACTIVO' && card.state, card.condition !== 'HABIDO' && card.condition].filter(Boolean).join(' · ')}
                </span>
            )}
            {card?.goodTaxpayer && <Chip tone="ok">Buen contribuyente</Chip>}
            {card?.withholdingAgent && <Chip tone="info">Agente de retención</Chip>}
            {card?.perceptionAgent && <Chip tone="info">Agente de percepción</Chip>}
        </span>
    );
}

const ROW =
    'flex cursor-pointer items-start justify-between gap-3 border-b border-line px-1.5 py-2 text-left last:border-b-0 hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-2 focus-visible:outline-primary';

function PartyRow({ p, idx }: { p: Party; idx: RucIndex }) {
    const role = p.purchases && p.sales ? 'Proveedor y cliente' : p.sales ? 'Cliente' : 'Proveedor';
    return (
        <button type="button" onClick={() => openRuc(p.ruc)} className={ROW}>
            <span className="min-w-0">
                <b>{p.name || p.ruc}</b>
                <span className="block text-xs text-ink-3">
                    RUC {p.ruc} · {role}
                </span>
                <Badges ruc={p.ruc} idx={idx} />
            </span>
            <span className="shrink-0 text-right text-xs text-ink-3 tabular-nums">
                {p.lastOn && <span className="block">Último: {p.lastOn}</span>}
                {p.firstOn && p.docs > 1 && <span className="block">Primero: {p.firstOn}</span>}
                {thousands(p.docs)} {p.docs === 1 ? 'comprobante' : 'comprobantes'}
                {p.totalPen !== 0 && <span className="block">{money(p.totalPen, 'PEN')}</span>}
            </span>
        </button>
    );
}

const Rows = ({ n }: { n: number }) => (
    <div className="flex flex-col gap-2">
        {Array.from({ length: n }, (_, i) => (
            <Hueco key={i} className="h-8 w-full" />
        ))}
    </div>
);

function SscoMatches({ q, withUs, idx }: { q: string; withUs: (ruc: string) => boolean; idx: RucIndex }) {
    const found = useMemo(() => (q.replace(/\s/g, '').length < SSCO_MIN ? [] : sscoByName(q, idx.lists?.ssco ?? null, withUs)), [q, idx.lists, withUs]);
    const paged = usePaged(found, q);
    if (!found.length) return null;
    return (
        <Card title={`${thousands(found.length)} en la lista SSCO, sin comprobantes con nosotros`} className="mt-3.5">
            <div className="flex flex-col">
                {paged.rows.map((s) => (
                    <button key={s.ruc} type="button" onClick={() => openRuc(s.ruc)} className={ROW}>
                        <span className="min-w-0">
                            <b>{s.name || s.ruc}</b>
                            <span className="block text-xs text-ink-3">RUC {s.ruc}</span>
                        </span>
                        <Chip tone="danger">SSCO</Chip>
                    </button>
                ))}
            </div>
            <Pager paged={paged} />
        </Card>
    );
}

export function AllRucs({ q }: { q: string }) {
    const { snapshot, error } = useDocs();
    const idx = useRucIndex();
    const filter = list$.use();
    const set = list$.set;
    // A new search starts on page 1 (the search itself is Consulta RUC's ?ruc=).
    const lastQ = useRef(q);
    useEffect(() => {
        if (lastQ.current === q) return;
        lastQ.current = q;
        set({});
    }, [q, set]);
    const parties = useMemo(() => partiesByLastDoc(snapshot?.docs ?? []), [snapshot]);
    const both = parties.some((p) => p.purchases) && parties.some((p) => p.sales);
    // A SUNAT flag cannot answer until the cards and the SSCO list are here.
    const waiting = flagNeedsLists(filter) && !idx.ready && !idx.error;
    const list = useMemo(() => listParties(parties, filter, idx, q), [parties, filter, idx, q]);
    const withUs = useMemo(() => {
        const rucs = new Set(parties.map((p) => p.ruc));
        return (ruc: string) => rucs.has(ruc);
    }, [parties]);
    const paged = usePaged(list, null, undefined, list$.usePage());
    if (!snapshot) return error ? null : <Rows n={4} />;
    const title =
        isPartyFiltered(filter) || q
            ? `${thousands(list.length)} de ${thousands(parties.length)} RUC con nosotros`
            : `${thousands(parties.length)} RUC con nosotros`;
    return (
        <>
            <Card title={title}>
                <FilterRow>
                    {both && <Segmented options={ROLES} value={filter.role} onChange={(role) => set({ role })} />}
                    <Select label="Empresa o persona" value={filter.type} onChange={(v) => set({ type: v as PartyType })}>
                        <option value="">Empresas y personas</option>
                        <option value="company">Empresas</option>
                        <option value="person">Personas naturales</option>
                    </Select>
                    <Select label="Qué dice SUNAT" value={filter.flag} onChange={(v) => set({ flag: v as PartyFlag })}>
                        <option value="">Toda condición en SUNAT</option>
                        {FLAGS.map((f) => (
                            <option key={f.value} value={f.value}>
                                {f.label}
                            </option>
                        ))}
                    </Select>
                    <SortSelect value={filter.sort} onChange={(sort) => set({ sort })} options={SORTS} />
                    {isPartyFiltered(filter) && <TextButton onClick={() => set({ ...PARTY_FILTER_DEFAULT, sort: filter.sort })}>Quitar filtros</TextButton>}
                </FilterRow>
                {waiting ? (
                    <Rows n={4} />
                ) : paged.total ? (
                    <div className="flex flex-col">
                        {paged.rows.map((p) => (
                            <PartyRow key={p.ruc} p={p} idx={idx} />
                        ))}
                    </div>
                ) : (
                    <Empty>
                        {!parties.length
                            ? 'Todavía no hay comprobantes con nosotros.'
                            : q
                              ? `Ningún RUC con «${q}» en nuestros comprobantes${isPartyFiltered(filter) ? ' con esos filtros' : ''}.`
                              : 'Ningún RUC con esos filtros.'}
                    </Empty>
                )}
                <Pager paged={paged} />
            </Card>
            <SscoMatches q={q} withUs={withUs} idx={idx} />
        </>
    );
}
