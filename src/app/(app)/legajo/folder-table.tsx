'use client';

// The table of OC folders: each row opens its detail below it, plus the note of what the search
// finds but the filter hides. Port of the table part of pintarLegajo().
import { Fragment } from 'react';
import { toUploadNames, type Folder, type FolderList } from '../../../modules/legajo/application/views.ts';
import { Empty, MoreButton, T, TextButton } from '../../../shared/ui/bits.tsx';
import { Chip } from '../../../shared/ui/card.tsx';
import { dayTime, dmy, driveFolder, money } from '../../../shared/ui/format.ts';
import { Hueco } from '../../../shared/ui/hueco.tsx';
import { folderStore } from '../_lib/stores.ts';
import { FolderDetailPanel } from './folder-detail.tsx';

function StatusChips({ x }: { x: Folder }) {
    if (x.status === 'OK') return <Chip tone="ok">Completo</Chip>;
    if (x.status === 'VACÍA') return <Chip tone="muted">Carpeta vacía</Chip>;
    if (!x.toUpload && !x.missingNowhere) return <Chip tone="danger">Falta: {x.missing}</Chip>;
    // Red: found nowhere. Amber ◐: exists (Almacén, COMEX or SUNAT), only needs uploading.
    return (
        <span className="inline-flex flex-wrap gap-1">
            {x.missingNowhere && <Chip tone="danger">Falta: {x.missingNowhere}</Chip>}
            {x.toUpload && (
                <Chip tone="warn" title={x.toUpload.split(' | ').join('\n')}>
                    ◐ Por subir: {toUploadNames(x.toUpload)}
                </Chip>
            )}
        </span>
    );
}

const HOVER_INTENT_MS = 150;
let hoverTimer: ReturnType<typeof setTimeout> | undefined;

function FolderRow({ x, open, onToggle }: { x: Folder; open: boolean; onToggle: () => void }) {
    return (
        <tr
            className={`${T.row} cursor-pointer hover:bg-surface-2 ${open ? 'bg-surface-2' : ''}`}
            title="Clic para ver sus documentos"
            // The detail costs ~0.9 s in the base (measured 13/10/2026): a hover that stays 150 ms
            // puts it first in the prefetch queue, so the click usually finds it here. Crossing the
            // table with the mouse asks for nothing.
            onMouseEnter={() => {
                clearTimeout(hoverTimer);
                if (x.folderId) hoverTimer = setTimeout(() => folderStore.prefetch(x.folderId), HOVER_INTENT_MS);
            }}
            onMouseLeave={() => clearTimeout(hoverTimer)}
            onClick={(e) => {
                if (!(e.target as HTMLElement).closest('a')) onToggle();
            }}
        >
            <td className={T.td}>
                <b>{x.oc}</b>
                {x.company !== 'INROPRIN' && (
                    <div className={`${T.sub} font-semibold text-warning-strong`} title={`Empresa según ${x.companySource}`}>
                        {x.company}
                    </div>
                )}
                <div className={T.sub}>{x.project}</div>
                {(x.ocDate || x.amountPen != null) && (
                    <div className={`${T.sub} whitespace-nowrap`}>
                        {dmy(x.ocDate)}
                        {x.amountPen != null && ` · ${money(x.amountPen, 'PEN')}`}
                    </div>
                )}
            </td>
            <td className={T.td}>
                {x.supplier}
                <div className={T.sub} title={x.documents}>
                    {x.documents}
                </div>
            </td>
            <td className={T.td} title={x.buyerSource ? `Comprador según ${x.buyerSource}` : undefined}>
                {x.buyer || <span className="text-xs text-ink-3">por identificar</span>}
                <div className={T.sub}>
                    {x.area}
                    {x.paymentStatus && ` · ${x.paymentStatus}`}
                </div>
            </td>
            <td className={T.td}>
                <StatusChips x={x} />
                {x.lastChange && (
                    <div className={T.sub}>
                        {dayTime(x.lastChangeAt)} · {x.lastChange}
                    </div>
                )}
            </td>
            <td className={T.tdNum}>{x.sunatInvoices || '—'}</td>
            <td className={T.td}>
                {x.folderId && (
                    <a className="font-semibold whitespace-nowrap text-primary" href={driveFolder(x.folderId)} target="_blank" rel="noopener">
                        Carpeta ↗
                    </a>
                )}
            </td>
        </tr>
    );
}

export function FolderTable({
    view,
    text,
    shown,
    onMore,
    indexOf,
    open,
    onToggle,
    onShowAll,
}: {
    view: FolderList | null;
    text: string;
    shown: number;
    onMore: () => void;
    indexOf: Map<Folder, number>;
    open: number | null;
    onToggle: (i: number) => void;
    onShowAll: (otherCompany: boolean) => void;
}) {
    const hidden = view?.hidden;
    return (
        <>
            {view && !view.list.length ? (
                <Empty>Ninguna carpeta con este filtro.</Empty>
            ) : (
                <div className="overflow-x-auto">
                    <table className={T.table}>
                        <thead>
                            <tr className={T.headRow}>
                                <th className={T.th}>OC</th>
                                <th className={T.th}>Proveedor</th>
                                <th className={T.th}>Comprador</th>
                                <th className={T.th}>Legajo</th>
                                <th className={T.thNum}>Facturas SUNAT</th>
                                <th className={T.th} />
                            </tr>
                        </thead>
                        <tbody>
                            {view
                                ? view.list.slice(0, shown).map((x) => {
                                      const i = indexOf.get(x) ?? -1;
                                      return (
                                          <Fragment key={i}>
                                              <FolderRow x={x} open={open === i} onToggle={() => onToggle(i)} />
                                              {open === i && (
                                                  <tr>
                                                      <td colSpan={6} className="bg-surface-2 px-3.5 pt-1 pb-[18px]">
                                                          <FolderDetailPanel folder={x} />
                                                      </td>
                                                  </tr>
                                              )}
                                          </Fragment>
                                      );
                                  })
                                : [0, 1, 2, 3, 4, 5].map((i) => (
                                      <tr key={i} className={T.row}>
                                          <td colSpan={6} className={T.td}>
                                              <Hueco className="h-9 w-full" />
                                          </td>
                                      </tr>
                                  ))}
                        </tbody>
                    </table>
                </div>
            )}
            {hidden && (
                <p className="mt-2.5 text-xs text-ink-3">
                    Con «{text.trim()}» hay {hidden.count} carpeta{hidden.count === 1 ? '' : 's'} más que este filtro no muestra (
                    {hidden.byKind.map(([k, n]) => `${n} ${k}`).join(', ')}: {hidden.sample.join(', ')}
                    {hidden.count > 5 ? '…' : ''}) · <TextButton onClick={() => onShowAll(hidden.otherCompany)}>Ver en «Todas»</TextButton>
                </p>
            )}
            {view && <MoreButton shown={shown} total={view.list.length} onMore={onMore} />}
        </>
    );
}
