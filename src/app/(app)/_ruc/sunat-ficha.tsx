'use client';

// The full Consulta RUC ficha of one RUC (padron_ruc), asked when the RUC is opened. The port of
// loadSunatFicha and sunatFichaHtml (VistaConsultaRuc.html).
import type { ReactNode } from 'react';
import type { SunatFicha } from '../../../modules/ruc/application/views.ts';
import { Card } from '../../../shared/ui/card.tsx';
import { dmy } from '../../../shared/ui/format.ts';
import { Hueco } from '../../../shared/ui/hueco.tsx';
import { fichaStore } from '../_lib/stores.ts';

const date = (v: string | null) => (v ? dmy(v.slice(0, 10)) : '');

function List({ items }: { items: string[] | null }) {
    if (!items?.length) return null;
    return (
        <ul className="m-0 list-disc pl-[18px]">
            {items.map((x, i) => (
                <li key={i}>{x}</li>
            ))}
        </ul>
    );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
    if (!children) return null;
    return (
        <>
            <dt className="text-ink-2">{label}</dt>
            <dd className="m-0 max-sm:mb-1.5">{children}</dd>
        </>
    );
}

function Fields({ f }: { f: SunatFicha }) {
    const activities = (f.actividades ?? []).map((a) => `${a.kind} · ${a.code} · ${a.description}`);
    return (
        <>
            {f.aviso && (
                <div className="mb-2.5 rounded-[10px] border border-danger bg-danger-soft px-3 py-2">
                    <b>IMPORTANTE:</b> {f.aviso}
                </div>
            )}
            <dl className="m-0 grid grid-cols-[minmax(150px,max-content)_1fr] gap-x-3.5 gap-y-1.5 text-[13.5px] max-sm:grid-cols-1">
                <Row label="Estado">{f.estado || f.fecha_baja ? `${f.estado ?? ''}${f.fecha_baja ? ` (baja el ${date(f.fecha_baja)})` : ''}` : ''}</Row>
                <Row label="Condición">{f.condicion}</Row>
                <Row label="Tipo de contribuyente">{f.tipo_contribuyente}</Row>
                <Row label="Documento">{f.documento}</Row>
                <Row label="Nombre comercial">{f.nombre_comercial}</Row>
                <Row label="Fecha de inscripción">{date(f.fecha_inscripcion)}</Row>
                <Row label="Inicio de actividades">{date(f.fecha_inicio_actividades)}</Row>
                <Row label="Domicilio fiscal">{f.domicilio_fiscal}</Row>
                <Row label="Sistema de emisión">{f.sistema_emision}</Row>
                <Row label="Comercio exterior">{f.comercio_exterior}</Row>
                <Row label="Sistema de contabilidad">{f.sistema_contabilidad}</Row>
                <Row label="Actividades económicas">{activities.length > 0 && <List items={activities} />}</Row>
                <Row label="Comprobantes autorizados (impresión)">{!!f.comprobantes_impresion?.length && <List items={f.comprobantes_impresion} />}</Row>
                <Row label="Emisión electrónica">{!!f.emision_electronica?.length && <List items={f.emision_electronica} />}</Row>
                <Row label="Emisor electrónico desde">{date(f.emisor_electronico_desde)}</Row>
                <Row label="Comprobantes electrónicos">{f.comprobantes_electronicos}</Row>
                <Row label="Afiliado al PLE desde">{date(f.ple_desde)}</Row>
                <Row label="Padrones">{f.padrones_detalle || 'NINGUNO'}</Row>
            </dl>
        </>
    );
}

export function SunatFichaCard({ ruc }: { ruc: string }) {
    const { data, error } = fichaStore.use(ruc);
    const f = data?.ficha ?? null;
    return (
        <Card title="Ficha SUNAT" note={f ? `Consulta RUC al ${date(f.ficha_consultada_en)}` : undefined}>
            {error ? (
                <p className="text-xs text-ink-3">No se pudo traer la ficha: {error} El detalle está en el log del servidor.</p>
            ) : !data ? (
                <div className="flex flex-col gap-2">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <Hueco key={i} className="h-4 w-full max-w-md" />
                    ))}
                </div>
            ) : !f ? (
                <p className="text-xs text-ink-3">El robot del padrón todavía no consultó este RUC en SUNAT.</p>
            ) : (
                <Fields f={f} />
            )}
        </Card>
    );
}
