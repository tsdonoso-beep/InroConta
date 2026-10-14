'use client';

// Cambios del robot: what changed in the OC folders, day by day (Lima days), with the filters of
// kind, area and text. The port of the «cambios» section (pintarCambios) of the Apps Script view.
import { useState } from 'react';
import {
    CHANGE_DEFAULT,
    changeMonths,
    changesByDay,
    changeTone,
    filterChanges,
    type ChangeArea,
    type ChangeDay,
    type ChangeFilter,
    type ChangeKind,
} from '../../../modules/legajo/application/views.ts';
import { Card, Chip, Segmented } from '../../../shared/ui/card.tsx';
import { Empty, FilterRow, Notice, SearchBox, SectionTitle, T } from '../../../shared/ui/bits.tsx';
import { PeriodPicker } from '../../../shared/ui/period-picker.tsx';
import { driveFolder, limaDateTime } from '../../../shared/ui/format.ts';
import { Hueco } from '../../../shared/ui/hueco.tsx';
import { changesStore } from '../_lib/stores.ts';

const KINDS: { value: ChangeKind; label: string }[] = [
    { value: '', label: 'Todos' },
    { value: 'COMPL', label: 'Completó' },
    { value: 'FALTA', label: 'Ahora le falta' },
    { value: 'NUEV', label: 'Nuevos' },
    { value: 'ELIM', label: 'Eliminados' },
];
const AREAS: { value: ChangeArea; label: string }[] = [
    { value: '', label: 'Todas' },
    { value: 'nat', label: 'Nacionales' },
    { value: 'imp', label: 'COMEX' },
];

function Day({ d }: { d: ChangeDay }) {
    return (
        <>
            <div className="mt-4 mb-1.5 text-[12.5px] font-bold text-ink-2 first:mt-0">{d.day}</div>
            <div className="overflow-x-auto">
                <table className={T.table}>
                    <tbody>
                        {d.rows.map(({ change: x, time }, i) => (
                            <tr key={i} className={T.row}>
                                <td className={`${T.td} w-[60px] text-ink-3`}>{time}</td>
                                <td className={`${T.td} w-[170px]`}>
                                    <Chip tone={changeTone(x.type)}>{x.type}</Chip>
                                </td>
                                <td className={`${T.td} w-[110px]`}>
                                    <b>{x.oc}</b>
                                    <div className={T.sub}>{x.isImport ? 'COMEX' : 'Nacional'}</div>
                                </td>
                                <td className={T.td}>{x.detail}</td>
                                <td className={`${T.td} w-[90px] whitespace-nowrap`}>
                                    {x.folderId && (
                                        <a
                                            href={driveFolder(x.folderId)}
                                            target="_blank"
                                            rel="noopener"
                                            className="text-[12.5px] font-semibold text-primary hover:text-primary-strong"
                                        >
                                            Carpeta ↗
                                        </a>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

function ListGap() {
    return (
        <div className="grid gap-3">
            <Hueco className="h-4 w-24" />
            {Array.from({ length: 6 }, (_, i) => (
                <Hueco key={i} className="h-5 w-full" />
            ))}
        </div>
    );
}

export function CambiosView() {
    const { data, error } = changesStore.use();
    const [f, setF] = useState<ChangeFilter>(CHANGE_DEFAULT);
    const set = (patch: Partial<ChangeFilter>) => setF((old) => ({ ...old, ...patch }));
    const days = data ? changesByDay(filterChanges(data.changes, f)) : null;
    return (
        <>
            <SectionTitle
                title="Cambios del robot"
                note={data ? `De la base · leída el ${limaDateTime(data.readAt)}` : !error && <Hueco className="h-3 w-56" />}
            />
            {error && <Notice>No se pudieron leer los cambios de la base: {error} El detalle está en el log del servidor.</Notice>}
            <FilterRow>
                <Segmented options={KINDS} value={f.kind} onChange={(kind) => set({ kind })} />
                <Segmented options={AREAS} value={f.area} onChange={(area) => set({ area })} />
                <PeriodPicker
                    value={f.period}
                    onChange={(period) => set({ period })}
                    months={data ? changeMonths(data.changes) : []}
                    disabled={!data}
                    allLabel="Todas las fechas"
                />
                <SearchBox value={f.text} onChange={(text) => set({ text })} placeholder="OC o archivo" />
            </FilterRow>
            {!error && (
                <Card title="Lo que cambió en las carpetas" note="Lo anota el robot en cada lectura (dos veces al día) · los últimos 500 cambios">
                    {!days ? (
                        <ListGap />
                    ) : days.length ? (
                        days.map((d, i) => <Day key={`${d.day}-${i}`} d={d} />)
                    ) : (
                        <Empty>Sin cambios con este filtro. El robot los anota desde el 02/10/2026.</Empty>
                    )}
                </Card>
            )}
        </>
    );
}
