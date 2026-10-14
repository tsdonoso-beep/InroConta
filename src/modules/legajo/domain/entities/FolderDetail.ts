// One OC folder opened (detalle_de_carpeta): its files with the document each one is, the OC's
// data, the SUNAT invoices tied to it, its changes, the other folders with the same OC, and what
// Compras, COMEX and Almacén say of it. The shape is the function's JSON, as it comes.

export interface FolderFile {
    nombre: string;
    url: string;
    parece: string | null;
    serie: string | null;
    /** The legajo documents this file is (FACTURA, OC, GUIA…). */
    docs: string[];
}

export interface PurchaseSource {
    fecha?: string | null;
    elaborado?: string | null;
    solicitado?: string | null;
    requerimiento?: string | null;
    moneda?: string | null;
    total?: number | null;
    total_soles?: number | null;
    forma_pago?: string | null;
    condicion_pago?: string | null;
    concepto?: string | null;
    items?: number | null;
    pais?: string | null;
    incoterm?: string | null;
    proveedor_ruc?: string | null;
    lugar_entrega?: string | null;
}

export interface ComexSource {
    estado_compra?: string | null;
    comprador?: string | null;
    modalidad?: string | null;
    operador?: string | null;
    eta?: string | null;
    ata?: string | null;
    fecha_real_planta?: string | null;
    fecha_aprox_planta?: string | null;
    agente_aduanas?: string | null;
    dam?: string | null;
    costeo?: string | null;
    duas?: { dua: string; fecha?: string | null; subio_oc?: string | null }[] | null;
    observaciones?: string | null;
}

export interface WarehouseSlip {
    vale: string;
    fecha: string | null;
    registrado: string | null;
    movimiento: string;
    tipo_documento: string | null;
    numero_documento: string | null;
    items: number | null;
    cantidad: number | null;
    recepcionado: string | null;
    documento_url: string | null;
    tiene_escaneo: boolean;
}

export interface FolderDetail {
    carpeta: {
        oc: string;
        tipo: string;
        procedencia: string;
        proveedor: string | null;
        proyecto: string | null;
        nombre: string;
        url: string;
        estado: string;
        le_falta: string | null;
        documentos: string | null;
        cc_codigo: string | null;
        cc_nombre: string | null;
        cc_segun: string | null;
        leida: string | null;
    };
    archivos: FolderFile[];
    legajo: {
        comprador: string | null;
        area: string | null;
        situacion_pago: string | null;
        estatus: string | null;
        estado_aprobacion: string | null;
        fecha_oc: string | null;
        monto_soles: number | null;
        forma_pago: string | null;
    } | null;
    facturas: { comprobante: string; ruc: string; tipo: string; fuente: string | null; archivo: string | null; archivo_url: string | null }[];
    cambios: { fecha: string; tipo: string; detalle: string | null }[];
    otras: { nombre: string; proyecto: string | null; url: string }[];
    fuentes: {
        compras: PurchaseSource | null;
        comex: ComexSource | null;
        almacen: WarehouseSlip[];
        por_subir: { doc: string; evidencia: string; enlace: string | null }[];
        cambios: { fecha: string; fuente: string; campo: string; antes: string | null; despues: string | null }[];
        copia: string | null;
    } | null;
}
