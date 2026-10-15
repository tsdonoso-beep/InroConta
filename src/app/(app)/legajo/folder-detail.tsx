'use client';

// One OC folder opened: the 12 documents of its legajo with their mark, its data, what Compras,
// COMEX and Almacén say of it, its SUNAT invoices, other files, changes and the same OC elsewhere.
// Port of detalleCarpeta() of VistaEjecutivaPagina.html; asked only when the row opens.
import {
    legajoDocs,
    otherFiles,
    isImportFolder,
    type DocMark,
    type Folder,
    type FolderDetail,
    type LegajoDoc,
} from '../../../modules/legajo/application/views.ts';
import { Empty } from '../../../shared/ui/bits.tsx';
import { buttonClass } from '../../../shared/ui/button.tsx';
import { dayTime, dmy, driveFolder, money } from '../../../shared/ui/format.ts';
import { folderStore } from '../_lib/stores.ts';
import { Datum, DetailList, LINK } from './detail-bits.tsx';
import { FolderSources } from './folder-sources.tsx';

const MARK: Record<DocMark, { icon: string; title: string; mark: string; box: string }> = {
    s: { icon: '✓', title: 'lo tiene', mark: 'text-primary', box: 'border-line bg-surface' },
    n: { icon: '✗', title: 'falta y no está en ningún lado', mark: 'text-danger', box: 'border-danger-line bg-danger-soft' },
    p: { icon: '◐', title: 'existe en otro lado: falta subirla a la carpeta', mark: 'text-warning-strong', box: 'border-warning bg-warning-soft' },
    x: { icon: '—', title: 'no le corresponde (solo importaciones)', mark: 'text-ink-3', box: 'border-line bg-surface' },
    o: { icon: '○', title: 'no está (no se exige)', mark: 'text-ink-3', box: 'border-line bg-surface' },
};

function DocBox({ d }: { d: LegajoDoc }) {
    const m = MARK[d.mark];
    return (
        <div className={`rounded-[10px] border px-2.5 py-2 text-[13px] ${m.box}`} title={m.title}>
            <span className={`mr-1.5 font-extrabold ${m.mark}`}>{m.icon}</span>
            {d.label}
            {d.evidence && (
                <div className="mt-1 text-xs leading-snug text-warning-strong">
                    {d.evidence.evidencia}
                    {d.evidence.enlace && (
                        <>
                            {' · '}
                            <a href={d.evidence.enlace} target="_blank" rel="noopener" className="text-warning-strong underline">
                                ver ↗
                            </a>
                        </>
                    )}
                </div>
            )}
            {d.files.length > 1 && <span className="text-xs text-ink-3"> ({d.files.length})</span>}
            {d.files.length > 0 && (
                <div className="mt-1 flex flex-col gap-0.5">
                    {d.files.slice(0, 4).map((a) => (
                        <a key={a.url} href={a.url} {...LINK} title={a.nombre} className={`truncate text-xs ${LINK.className}`}>
                            ↗ {a.serie || a.nombre}
                        </a>
                    ))}
                    {d.files.length > 4 && <span className="text-xs text-ink-3">… y {d.files.length - 4} más</span>}
                </div>
            )}
        </div>
    );
}

function Detail({ x, d }: { x: Folder; d: FolderDetail }) {
    const c = d.carpeta;
    const lg = d.legajo;
    const fc = d.fuentes?.compras ?? null;
    const others = otherFiles(d);
    const cc = `${c.cc_codigo && c.cc_codigo !== '-' ? `${c.cc_codigo} ` : ''}${c.cc_nombre ?? ''}`;
    const amount = lg?.monto_soles ? money(Number(lg.monto_soles), 'PEN') : fc?.total_soles != null ? money(Number(fc.total_soles), 'PEN') : '';
    return (
        <>
            <div className="mt-1.5 mb-3.5 grid grid-cols-[repeat(auto-fill,minmax(215px,1fr))] gap-2">
                {legajoDocs(d).map((doc) => (
                    <DocBox key={doc.key} d={doc} />
                ))}
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-x-[18px] gap-y-2.5 text-[13px]">
                <Datum label="Empresa" value={x.company + (x.companySource ? ` (según ${x.companySource})` : '')} />
                <Datum label="Proyecto (carpeta)" value={c.proyecto} />
                <Datum label="Centro de costo" value={cc} />
                <Datum label="Centro de costo según" value={c.cc_segun} />
                <Datum label="Comprador" value={(lg?.comprador || x.buyer) + (!lg?.comprador && x.buyerSource ? ` (según ${x.buyerSource})` : '')} />
                <Datum label="Área" value={lg?.area || x.area} />
                <Datum label="Fecha OC" value={lg?.fecha_oc || dmy(fc?.fecha)} />
                <Datum label="Monto en soles" value={amount} />
                <Datum label="Situación del pago" value={lg?.situacion_pago} />
                <Datum label="Forma de pago" value={lg?.forma_pago || [fc?.forma_pago, fc?.condicion_pago].filter(Boolean).join(' · ')} />
                <Datum label="Estatus en el cuadro" value={[lg?.estatus, lg?.estado_aprobacion].filter(Boolean).join(' · ')} />
                <Datum label="Tipo" value={c.tipo === 'OS' ? 'Servicio (OS)' : 'Bien (OC)'} />
                <Datum label="Leída por el robot" value={dayTime(c.leida)} />
            </div>
            <FolderSources sources={d.fuentes} isImport={isImportFolder(d)} isService={c.tipo === 'OS'} />
            <DetailList title="Facturas de SUNAT unidas">
                {d.facturas.length ? (
                    d.facturas.map((f, i) => (
                        <span key={f.comprobante + f.ruc}>
                            {i > 0 && ' · '}
                            {f.archivo_url ? (
                                <>
                                    <a href={f.archivo_url} {...LINK}>
                                        {f.comprobante}
                                    </a>{' '}
                                    <span className="text-ink-3">
                                        ({f.ruc} · {f.fuente ?? ''})
                                    </span>
                                </>
                            ) : (
                                <>
                                    {f.comprobante} <span className="text-ink-3">({f.ruc})</span>
                                </>
                            )}
                        </span>
                    ))
                ) : (
                    <span className="text-ink-3">ninguna todavía</span>
                )}
            </DetailList>
            {others.length > 0 && (
                <DetailList title="Otros archivos de la carpeta">
                    {others.map((a, i) => (
                        <span key={a.url}>
                            {i > 0 && ' · '}
                            <a href={a.url} {...LINK}>
                                {a.nombre}
                            </a>
                        </span>
                    ))}
                </DetailList>
            )}
            {d.cambios.length > 0 && (
                <DetailList title="Últimos cambios">
                    {d.cambios.slice(0, 6).map((k, i) => (
                        <div key={i}>
                            <span className="text-ink-3">{dayTime(k.fecha)}</span> {k.tipo}
                            {k.detalle ? `: ${k.detalle}` : ''}
                        </div>
                    ))}
                </DetailList>
            )}
            {d.otras.length > 0 && (
                <DetailList title="La misma OC en otra carpeta">
                    {d.otras.map((o, i) => (
                        <span key={o.url}>
                            {i > 0 && ' · '}
                            <a href={o.url} {...LINK}>
                                {(o.proyecto ? `${o.proyecto} / ` : '') + o.nombre}
                            </a>
                        </span>
                    ))}
                </DetailList>
            )}
            <div className="mt-3.5">
                <a href={driveFolder(x.folderId)} target="_blank" rel="noopener" className={buttonClass()}>
                    Abrir la carpeta de la OC ↗
                </a>
            </div>
        </>
    );
}

export function FolderDetailPanel({ folder }: { folder: Folder }) {
    const { data, error } = folderStore.use(folder.folderId || null);
    if (!folder.folderId) return <Empty>Sin enlace de carpeta.</Empty>;
    if (error) return <Empty>No se pudo leer el detalle: {error}</Empty>;
    if (!data)
        return (
            <p className="flex items-center gap-2 py-3 text-[13px] text-ink-3">
                <span className="size-3.5 animate-spin rounded-full border-2 border-control border-t-primary" /> Leyendo los archivos de la carpeta…
            </p>
        );
    return <Detail x={folder} d={data} />;
}
