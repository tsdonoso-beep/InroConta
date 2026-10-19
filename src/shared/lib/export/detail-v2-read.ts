// The rows the DETALLE lines are built from, read from the v2 tables: eight reads at once, each
// paged (allPages). Any client with the secret key will do: the web app's server
// (serviceClient) and, later, the robot that publishes the tab. detail-v2.ts builds the lines.
import type { SupabaseClient } from '@supabase/supabase-js';
import { allPages } from '../../supabase/paging.ts';

export type Row = Record<string, unknown>;

export interface DetailSource {
    docs: Row[];
    items: Row[];
    sire: Row[];
    links: Row[];
    orders: Row[];
    folders: Row[];
    proofs: Row[];
    withholdings: Row[];
}

const DOC =
    'id,origen,emisor_ruc,tipo,serie,numero,fecha_emision,periodo,moneda,subtotal,igv,total,anticipo_aplicado,tipo_cambio,forma_pago,' +
    'guia_remision,orden_compra_xml,detraccion_codigo,detraccion_porcentaje,detraccion_monto,detraccion_cuenta,documento_relacionado,' +
    'documento_relacionado_tipo,xml_drive_id,pdf_drive_id,emisor:emisor_ruc(razon_social)';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any;

function reader(sb: SupabaseClient) {
    return (table: string, select: string, build: (q: Query) => Query = (q) => q) =>
        allPages<Row>(async (from, size) => {
            const { data, error } = await build(sb.from(table).select(select)).range(from, from + size - 1);
            if (error) throw Object.assign(new Error(`${table}: ${error.message}`), { code: error.code });
            return (data ?? []) as Row[];
        });
}

export async function readDetailSource(sb: SupabaseClient, companyRuc: string): Promise<DetailSource> {
    const read = reader(sb);
    const [docs, items, sire, links, orders, folders, proofs, withholdings] = await Promise.all([
        read('comprobante', DOC, (q) => q.eq('empresa_ruc', companyRuc).order('id')),
        read('comprobante_item', 'comprobante_id,linea,descripcion,cantidad,unidad,precio_unitario,importe', (q) => q.order('comprobante_id').order('linea')),
        read('registro_compras', 'id,comprobante_id,total,tipo_cambio,base_dg,igv_dg,base_dgng,igv_dgng,base_dng,igv_dng,ultima_vez', (q) =>
            q.eq('empresa_ruc', companyRuc).order('id'),
        ),
        read('comprobante_oc', 'comprobante_id,orden_compra_id,archivo:archivo_id(drive_id,nombre,carpeta_id)', (q) =>
            q.order('comprobante_id').order('orden_compra_id'),
        ),
        read(
            'orden_compra',
            'id,codigo,procedencia,situacion_pago,comprador,comprador_segun,area,legajo_en,legajo_revision,legajo_le_falta,centro_costo_segun,' +
                'centro_costo:centro_costo_id(codigo,nombre,es_area,concar_codigo)',
            (q) => q.eq('empresa_ruc', companyRuc).order('id'),
        ),
        read('carpeta_oc', 'drive_id,orden_compra_id,proyecto_carpeta,documentos,le_falta,estado,visto_carpeta_en', (q) =>
            q.eq('empresa_ruc', companyRuc).not('visto_carpeta_en', 'is', null).order('drive_id'),
        ),
        read('detraccion_constancia', 'numero_constancia,comprobante_id,fecha_pago,monto,pdf_drive_id,html_drive_id', (q) =>
            q.eq('empresa_ruc', companyRuc).not('comprobante_id', 'is', null).order('numero_constancia'),
        ),
        read(
            'retencion_documento',
            'retencion_id,tipo,serie,numero,numero_pago,comprobante_id,fecha_pago,monto_retenido,retencion:retencion_id(serie,numero,estado,sentido,pdf_drive_id,xml_drive_id)',
            (q) => q.not('comprobante_id', 'is', null).order('retencion_id').order('tipo').order('serie').order('numero').order('numero_pago'),
        ),
    ]);
    return { docs, items, sire, links, orders, folders, proofs, withholdings };
}
