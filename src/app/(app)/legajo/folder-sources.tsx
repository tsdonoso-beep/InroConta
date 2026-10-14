'use client';

// What Compras, COMEX and Almacén say of an OC: the Compras base (who, how much, how it is paid),
// COMEX's STATUS (arrival, DAM, costing) and Almacén's slips, plus what changed in them. Port of
// bloqueFuentes() of VistaEjecutivaPagina.html.
import type { ReactNode } from 'react';
import type { FolderDetail, WarehouseSlip } from '../../../modules/legajo/application/views.ts';
import { dayTime, dmy, money } from '../../../shared/ui/format.ts';
import { Datum, DetailList, LINK } from './detail-bits.tsx';

const Note = ({ children }: { children: ReactNode }) => <span className="text-xs text-ink-3">{children}</span>;

function Box({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="min-w-0 rounded-[10px] border border-line bg-surface px-3 py-2.5">
            <h4 className="mb-2 text-[11.5px] font-bold tracking-[.06em] text-ink-2 uppercase">{title}</h4>
            {children}
        </div>
    );
}

const Info = ({ children }: { children: ReactNode }) => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(115px,1fr))] gap-x-3 gap-y-2 text-[13px]">{children}</div>
);

function Slip({ v }: { v: WarehouseSlip }) {
    const doc = (v.tipo_documento ? `${v.tipo_documento.toLowerCase().replace('guia remision', 'guía')} ` : '') + (v.numero_documento ?? '');
    return (
        <div
            className={`border-t border-dashed border-line py-1.5 text-[12.5px] first:border-t-0 ${v.movimiento === 'ANULADO' ? 'text-ink-3 line-through' : ''}`}
        >
            <b>Vale {v.vale}</b> · {dmy(v.fecha)}
            {v.movimiento !== 'INGRESO' && ` · ${v.movimiento}`}
            {doc.trim() && ` · ${doc}`}
            {v.items
                ? ` · ${v.items} ${v.items === 1 ? 'producto' : 'productos'}${v.cantidad ? `, ${Number(v.cantidad).toLocaleString('es-PE')} und.` : ''}`
                : ''}
            {v.recepcionado && (
                <div className="text-xs text-ink-3">
                    recibió {v.recepcionado}
                    {v.registrado && v.registrado !== v.fecha ? ` · registrado el ${dmy(v.registrado)}` : ''}
                </div>
            )}
            {v.documento_url ? (
                <a href={v.documento_url} {...LINK}>
                    ver el escaneo ↗
                </a>
            ) : (
                v.tiene_escaneo && <Note>escaneo en la app de Almacén</Note>
            )}
        </div>
    );
}

const SOURCE: Record<string, string> = { ALMACEN: 'Almacén', COMEX: 'COMEX' };

export function FolderSources({ sources: fu, isImport, isService }: { sources: FolderDetail['fuentes']; isImport: boolean; isService: boolean }) {
    const slips = fu?.almacen ?? [];
    if (!fu || (!fu.compras && !fu.comex && !slips.length && !(fu.cambios ?? []).length)) {
        return fu?.copia ? (
            <DetailList title="Compras, COMEX y Almacén">
                <Note>Esta OC no aparece en la base de Compras, el STATUS de COMEX ni el kardex.</Note>
            </DetailList>
        ) : null;
    }
    const fc = fu.compras;
    const fx = fu.comex;
    const changes = (fu.cambios ?? []).slice(0, 8);
    return (
        <>
            <div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(290px,1fr))] gap-3">
                {fc ? (
                    <Box title={`Base de Compras${isImport ? ' (importaciones)' : ''}`}>
                        <Info>
                            <Datum label="Fecha" value={dmy(fc.fecha)} />
                            <Datum label="Elaborada por" value={fc.elaborado} />
                            <Datum label="Solicitado por" value={fc.solicitado} />
                            <Datum label="Requerimiento" value={fc.requerimiento} />
                            <Datum
                                label="Total"
                                value={
                                    fc.total != null &&
                                    (fc.moneda ? `${fc.moneda} ` : '') +
                                        Number(fc.total).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                }
                            />
                            <Datum label="Total en soles" value={fc.total_soles != null && money(Number(fc.total_soles), 'PEN')} />
                            <Datum label="Forma de pago" value={[fc.forma_pago, fc.condicion_pago].filter(Boolean).join(' · ')} />
                            <Datum label="Concepto" value={fc.concepto} />
                            <Datum label="Ítems" value={fc.items ? String(fc.items) : ''} />
                            {isImport ? (
                                <>
                                    <Datum label="País" value={fc.pais} />
                                    <Datum label="Incoterm" value={fc.incoterm} />
                                </>
                            ) : (
                                <>
                                    <Datum label="RUC" value={fc.proveedor_ruc} />
                                    <Datum label="Entrega" value={fc.lugar_entrega} />
                                </>
                            )}
                        </Info>
                    </Box>
                ) : (
                    <Box title="Base de Compras">
                        <Note>La OC no está en la base de Compras.</Note>
                    </Box>
                )}
                {isImport && (
                    <Box title="STATUS de COMEX">
                        {fx ? (
                            <Info>
                                <Datum label="Estado" value={fx.estado_compra} />
                                <Datum label="Comprador" value={fx.comprador} />
                                <Datum label="Envío" value={[fx.modalidad, fx.operador].filter(Boolean).join(' · ')} />
                                <Datum label="ETA" value={dmy(fx.eta)} />
                                <Datum label="ATA" value={dmy(fx.ata)} />
                                <Datum
                                    label="En planta"
                                    value={dmy(fx.fecha_real_planta) || (fx.fecha_aprox_planta ? `aprox. ${dmy(fx.fecha_aprox_planta)}` : '')}
                                />
                                <Datum label="Agente de aduanas" value={fx.agente_aduanas} />
                                <Datum label="DAM" value={fx.dam} />
                                <Datum label="Costeo" value={fx.costeo} />
                                <Datum
                                    label="DUA (DUAS-SUNAT)"
                                    value={
                                        fx.duas?.length &&
                                        fx.duas.map((u) => (
                                            <div key={u.dua}>
                                                {u.dua}
                                                {u.fecha && (
                                                    <Note>
                                                        {' '}
                                                        ({dmy(u.fecha)}
                                                        {u.subio_oc ? ` · ¿subió OC? ${u.subio_oc}` : ''})
                                                    </Note>
                                                )}
                                            </div>
                                        ))
                                    }
                                />
                                <Datum label="Observaciones" value={fx.observaciones} />
                            </Info>
                        ) : (
                            <Note>La OC no está en el STATUS de COMEX.</Note>
                        )}
                    </Box>
                )}
                <Box title="Almacén (kardex)">
                    {slips.length ? (
                        slips.map((v) => <Slip key={v.vale + v.movimiento} v={v} />)
                    ) : (
                        <Note>{isService ? 'Sin ingresos en Almacén (es un servicio).' : 'Almacén no registra ingresos con esta OC.'}</Note>
                    )}
                </Box>
            </div>
            {changes.length > 0 && (
                <DetailList title="Cambios en Compras, COMEX y Almacén">
                    {changes.map((k, i) => (
                        <div key={i}>
                            <span className="text-ink-3">
                                {dayTime(k.fecha)} · {SOURCE[k.fuente] ?? 'Compras'}
                            </span>{' '}
                            {k.campo === 'NUEVO' ? 'nuevo ingreso' : k.campo === 'ELIMINADO' ? 'eliminado' : String(k.campo).replace(/_/g, ' ')}:{' '}
                            {k.antes ? `${k.antes} → ` : ''}
                            {k.despues || '—'}
                        </div>
                    ))}
                </DetailList>
            )}
            {fu.copia && <div className="mt-1.5 text-xs text-ink-3">Compras, COMEX y Almacén: leído por el robot el {dayTime(fu.copia)}</div>}
        </>
    );
}
