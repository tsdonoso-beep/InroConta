// Everything the OC calculations need, read from the v2 tables (read only, paged): the orders with
// what CG and the approvals table say of them, the folders and files of every walk, the received
// invoices and the suppliers Contabilidad marked as «never with OC».

import { allRows, type Base } from './base.mts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export interface State {
    orders: Row[];
    costCentreRows: Row[];
    approvalRows: Row[];
    folders: Row[];
    files: Row[];
    invoices: Row[];
    register: Row[];
    noOcSuppliers: Row[];
    manualLinks: Row[];
    vouchers: Row[];
    duas: Row[];
    costCentres: Row[];
}

export async function readState(sb: Base, companyRuc: string): Promise<State> {
    const own = (q: Row) => q.eq('empresa_ruc', companyRuc);
    const [orders, costCentreRows, approvalRows, folders, files, invoices, register, noOcSuppliers, manualLinks, vouchers, duas, costCentres] =
        await Promise.all([
            allRows<Row>(
                sb,
                'orden_compra',
                'id,procedencia,codigo,numero,anio,proveedor_ruc,fecha_oc,moneda,datos_segun,legajo_en,situacion_pago,comprador,comprador_segun,area,centro_costo_id,centro_costo_segun,dam,costeo',
                ['id'],
                own,
            ),
            allRows<Row>(sb, 'orden_compra_centro_costo', 'orden_compra_id,monto,lineas,lineas_cg', ['orden_compra_id', 'centro_costo_id']),
            allRows<Row>(sb, 'orden_compra_legajo', 'orden_compra_id,carpeta_id,proveedor_ruc', ['orden_compra_id', 'carpeta_id']),
            allRows<Row>(sb, 'carpeta_oc', 'drive_id,orden_compra_id,procedencia,visto_carpeta_en', ['drive_id'], own),
            allRows<Row>(
                sb,
                'archivo',
                'drive_id,carpeta_id,nombre,parece,serie_en_nombre,rucs_en_nombre,lectura_estado,leido_ruc,leido_serie,visto_carpeta_en,visto_legajo_en,visto_captura_en,origenes',
                ['drive_id'],
            ),
            allRows<Row>(sb, 'comprobante', 'id,emisor_ruc,tipo,serie,numero,fecha_emision,moneda,total,emisor_nombre,xml_estado', ['id'], (q) =>
                own(q).eq('origen', 'RECIBIDO').in('tipo', ['01', '03', '07', '08']),
            ),
            allRows<Row>(sb, 'registro_compras', 'comprobante_id,periodo,total,proveedor_nombre', ['comprobante_id', 'periodo'], own),
            allRows<Row>(sb, 'proveedor_sin_oc', 'proveedor_ruc,motivo', ['proveedor_ruc'], own),
            allRows<Row>(sb, 'comprobante_oc', 'comprobante_id,orden_compra_id,archivo_id,alertas', ['comprobante_id', 'orden_compra_id'], (q) =>
                q.eq('evidencia', 'MANUAL'),
            ),
            allRows<Row>(
                sb,
                'vale_almacen',
                'id,orden_compra_id,vale,fecha_operacion,fecha_registro,movimiento,operacion,tipo_documento,numero_documento,documento_url',
                ['id'],
                (q) => own(q).eq('movimiento', 'INGRESO').not('orden_compra_id', 'is', null),
            ),
            allRows<Row>(sb, 'orden_compra_dua', 'orden_compra_id,dua,fecha', ['orden_compra_id', 'dua']),
            allRows<Row>(sb, 'centro_costo', 'codigo,nombre,codigo_normal', ['codigo'], own),
        ]);
    return { orders, costCentreRows, approvalRows, folders, files, invoices, register, noOcSuppliers, manualLinks, vouchers, duas, costCentres };
}
