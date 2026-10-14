'use client';

// Legajo por OC: the OC folders with what their legajo lacks, by area, state, company and buyer,
// and the ranking per buyer. Port of the «legajo» section (pintarLegajo and arrancarBase).
import { useEffect, useMemo, useState } from 'react';
import {
    ALL_COMPANIES,
    DEFAULT_FOLDER_FILTERS,
    UNKNOWN_BUYER,
    buyersOf,
    companiesOf,
    effectiveCompany,
    folderList,
    latestInstant,
    type FolderArea,
    type FolderFilters,
    type FolderKpis,
    type FolderState,
} from '../../../modules/legajo/application/views.ts';
import { BarRow, FilterRow, Notice, Ring, SearchBox, SectionTitle, Select } from '../../../shared/ui/bits.tsx';
import { Card, Kpi, KpiNote, Segmented } from '../../../shared/ui/card.tsx';
import { dayTime, thousands } from '../../../shared/ui/format.ts';
import { Hueco } from '../../../shared/ui/hueco.tsx';
import { KpiGrid } from '../_comprobantes/kpi-cards.tsx';
import { folderStore, foldersStore } from '../_lib/stores.ts';
import { FolderTable } from './folder-table.tsx';

const PAGE = 50;

const AREAS: { value: FolderArea; label: string }[] = [
    { value: '', label: 'Todas' },
    { value: '0', label: 'Nacionales' },
    { value: '1', label: 'COMEX' },
];
const STATES: { value: FolderState; label: string; title?: string }[] = [
    { value: 'INC', label: 'Incompletas' },
    { value: 'SUBIR', label: '◐ Por subir', title: 'El documento existe en Almacén, COMEX o SUNAT, pero no está en la carpeta' },
    { value: 'OK', label: 'Completas' },
    { value: 'VACÍA', label: 'Vacías' },
    { value: '', label: 'Todas' },
];

function LegajoKpis({ k }: { k: FolderKpis | null }) {
    const n = (v: number) => thousands(v);
    return (
        <KpiGrid>
            <Kpi label="Carpetas de OC" value={k && n(k.total)}>
                {k && <KpiNote>{n(k.distinctOcs)} OC distintas</KpiNote>}
            </Kpi>
            <Kpi
                label="Legajo completo"
                value={
                    k && (
                        <Ring pct={k.total ? Math.round((100 * k.complete) / k.total) : 0} color="success">
                            {n(k.complete)} de {n(k.total)}
                            <br />
                            con todo lo que le corresponde
                        </Ring>
                    )
                }
            />
            {k && !k.withSources ? (
                <>
                    <Kpi label="Les falta la guía" value={n(k.missing.guide)} risk>
                        <KpiNote>guía de remisión (bienes)</KpiNote>
                    </Kpi>
                    <Kpi label="Les falta la factura" value={n(k.missing.invoice)}>
                        <KpiNote>
                            acta: {n(k.missing.act)} · DAM: {n(k.missing.dam)} · costeo: {n(k.missing.costing)}
                        </KpiNote>
                    </Kpi>
                </>
            ) : (
                <>
                    <Kpi label="Falta y no está en ningún lado" value={k && n(k.missingNowhere.total)} risk={!!k}>
                        {k && (
                            <KpiNote>
                                guía: {n(k.missingNowhere.guide)} · factura: {n(k.missingNowhere.invoice)} · acta: {n(k.missingNowhere.act)} · DAM:{' '}
                                {n(k.missingNowhere.dam)} · costeo: {n(k.missingNowhere.costing)}
                            </KpiNote>
                        )}
                    </Kpi>
                    <Kpi label="◐ Existe, falta subirla" value={k && n(k.toUpload.total)}>
                        {k && (
                            <KpiNote>
                                guía en Almacén: {n(k.toUpload.guideInWarehouse)} · DAM / costeo en COMEX: {n(k.toUpload.damOrCostingInComex)} · factura en
                                SUNAT: {n(k.toUpload.invoiceInSunat)}
                                <br />
                                sigue incompleta hasta que esté en la carpeta
                            </KpiNote>
                        )}
                    </Kpi>
                </>
            )}
            <Kpi label="Sin factura de SUNAT" value={k && n(k.withoutSunatInvoice)}>
                {k && <KpiNote>carpetas sin ninguna factura unida</KpiNote>}
            </Kpi>
        </KpiGrid>
    );
}

export function LegajoView() {
    const { data, error } = foldersStore.use();
    const [filters, setFilters] = useState<FolderFilters>(DEFAULT_FOLDER_FILTERS);
    const [shown, setShown] = useState(PAGE);
    const [open, setOpen] = useState<number | null>(null);

    const folders = useMemo(() => data?.folders ?? [], [data]);
    const company = effectiveCompany(folders, filters.company);
    const f = useMemo(() => ({ ...filters, company }), [filters, company]);
    const view = useMemo(() => (data ? folderList(folders, f) : null), [data, folders, f]);
    const buyers = useMemo(() => buyersOf(folders), [folders]);
    const companies = useMemo(() => companiesOf(folders), [folders]);
    const indexOf = useMemo(() => new Map(folders.map((x, i) => [x, i])), [folders]);

    // The details of every row on screen, one at a time in the background (the store queues them)
    // and kept in this tab's memory: opening one of them is then instant. A hover puts its row
    // first; «Ver más» adds the new rows at the end. Each costs the base ~0.9 s (P-012: the base
    // recomputes the company-wide crosses per folder; until that is fixed, this hides it).
    useEffect(() => {
        if (!view) return;
        const ids = view.list
            .slice(0, shown)
            .map((x) => x.folderId)
            .filter(Boolean);
        const t = setTimeout(() => folderStore.prefetchAll(ids), 400);
        return () => clearTimeout(t);
    }, [view, shown]);

    const change = (patch: Partial<FolderFilters>) => {
        setFilters((old) => ({ ...old, ...patch }));
        setShown(PAGE);
    };
    const robotRead = data && latestInstant(folders.map((x) => x.loadedAt));
    const sourcesRead = data && latestInstant(data.copies.map((c) => c.leido_en));

    return (
        <>
            <SectionTitle
                title="Legajo por OC"
                note={
                    data ? (
                        <>
                            Lectura del robot: {dayTime(robotRead)}
                            {sourcesRead ? ` · Compras, COMEX y Almacén: ${dayTime(sourcesRead)}` : ''}
                        </>
                    ) : (
                        !error && <Hueco className="h-3.5 w-56" />
                    )
                }
            />
            {error && <Notice>No se pudieron leer las carpetas de OC de la base: {error} El detalle está en el log del servidor.</Notice>}
            <FilterRow>
                <Segmented options={AREAS} value={filters.area} onChange={(area) => change({ area })} />
                <Segmented options={STATES} value={filters.state} onChange={(state) => change({ state })} />
                <Select
                    label="Empresa"
                    title="La contabilidad se lleva por empresa: INROPRIN o cada consorcio"
                    value={company}
                    onChange={(v) => {
                        change({ company: v });
                        setOpen(null);
                    }}
                >
                    {data ? (
                        companies.map((c) => (
                            <option key={c.company} value={c.company}>
                                {c.company} ({thousands(c.count)})
                            </option>
                        ))
                    ) : (
                        <option value={filters.company}>{filters.company}</option>
                    )}
                    <option value={ALL_COMPANIES}>Todas las empresas{data ? ` (${thousands(folders.length)})` : ''}</option>
                </Select>
                <Select label="Comprador" value={filters.buyer} onChange={(buyer) => change({ buyer })}>
                    <option value="">Todos los compradores</option>
                    {buyers.map((b) => (
                        <option key={b} value={b}>
                            {b}
                        </option>
                    ))}
                    <option value={UNKNOWN_BUYER}>Comprador por identificar</option>
                </Select>
                <SearchBox value={filters.text} onChange={(text) => change({ text })} placeholder="OC, proveedor, proyecto o lo que falta (guía, DAM…)" />
            </FilterRow>
            <LegajoKpis k={view?.kpis ?? null} />
            <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_300px]">
                <Card title="Carpetas de OC" note={view ? `${thousands(view.list.length)} carpetas` : <Hueco className="h-3.5 w-20" />}>
                    <FolderTable
                        view={view}
                        text={filters.text}
                        shown={shown}
                        onMore={() => setShown((s) => s + PAGE)}
                        indexOf={indexOf}
                        open={open}
                        onToggle={(i) => setOpen((o) => (o === i ? null : i))}
                        onShowAll={(otherCompany) => change({ state: '', ...(otherCompany ? { company: ALL_COMPANIES } : {}) })}
                    />
                </Card>
                <Card title="Por comprador" note="% de sus carpetas con el legajo completo">
                    {view
                        ? view.ranking.map((r) => (
                              <BarRow
                                  key={r.buyer}
                                  label={r.buyer === UNKNOWN_BUYER ? 'Por identificar' : r.buyer}
                                  figures={
                                      <>
                                          <b>{r.pct}%</b> · {r.complete} de {r.count}
                                      </>
                                  }
                                  pct={r.pct}
                                  color={r.pct >= 80 ? 'success' : r.pct >= 50 ? 'primary' : 'warning'}
                                  title="Ver sus carpetas"
                                  chosen={filters.buyer === r.buyer}
                                  onClick={() => change({ buyer: r.buyer })}
                              />
                          ))
                        : !error && [0, 1, 2, 3, 4].map((i) => <Hueco key={i} className="mb-4 h-8 w-full" />)}
                </Card>
            </div>
        </>
    );
}
