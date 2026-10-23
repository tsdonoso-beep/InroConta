// El detalle de comprobantes, como hoja
//
// Una fila por ítem. Es la salida que responde «¿en qué se gastó?», que la
// hoja de cabeceras (`comprobantes-sunat.ts`) no puede: allá una factura es
// una línea; acá es tantas líneas como productos tenga.
//
// Sale de la función `detalle_cpe`, que ya trae la cabecera del comprobante
// repetida en cada ítem. Como la otra hoja, cada columna se manda con su tipo
// para que Google no adivine —y ordene mal— fechas y series.

import { fechaCorta, nombreDeTipo, type TipoColumna } from './comprobantes-sunat.ts';

/** Una línea de detalle, tal como la devuelve `detalle_cpe`. */
export interface FilaDetalleCpe {
    periodo: string | null;
    origen: string | null;
    proveedorRuc: string | null;
    proveedorNombre: string | null;
    tipoComprobante: string | null;
    serie: string | null;
    numero: string | null;
    fechaEmision: string | null;
    moneda: string | null;
    linea: number | null;
    descripcion: string | null;
    cantidad: number | null;
    unidad: string | null;
    precioUnitario: number | null;
    importe: number | null;
    totalComprobante: number | null;
    /** El PDF archivado en Drive, si el scraper lo subió: el que de verdad se abre. */
    enlacePdf: string | null;
    /** El XML, de donde sale el detalle de ítems. */
    enlaceXml: string | null;
    /** "Contado" o "Credito", tal como lo declara el emisor. */
    formaPago: string | null;
    guiaRemision: string | null;
    ordenCompra: string | null;
    /** El comprobante que este referencia, típico en anticipos y valorizaciones. */
    documentoRelacionado: string | null;
    tipoDocumentoRelacionado: string | null;
    anticipoAplicado: number | null;
    /** null si el comprobante no está sujeto a detracción. */
    detraccionPorcentaje: number | null;
    detraccionMonto: number | null;
    /** La cuenta del Banco de la Nación. */
    detraccionCuentaBanco: string | null;
    /** El código del bien/servicio detraído, catálogo 54 de SUNAT. */
    detraccionCodigoBienServicio: string | null;
    /** La OC en cuya carpeta de Drive está la factura (varias, con « / »). */
    ocCarpeta?: string | null;
    /** El centro de costo de esa OC en la base de Control de Gestión. */
    centroCostoCg?: string | null;
    /** El código de CONCAR, solo si la equivalencia está confirmada. */
    codigoConcar?: string | null;
    /** El archivo (de la carpeta de OC en Drive) que confirmó este vínculo. */
    archivoOc?: string | null;
    /** Su enlace, para verificar el vínculo sin buscarlo a mano. */
    archivoOcUrl?: string | null;
    /** Del legajo por OC: situación del pago, comprador, área, legajo y carpeta. */
    situacionPagoOc?: string | null;
    compradorOc?: string | null;
    areaOc?: string | null;
    legajoOc?: string | null;
    carpetaOcUrl?: string | null;
    /** De la carpeta madre de compras: el proyecto, de dónde salió el centro de costo y qué documentos tiene. */
    proyectoOc?: string | null;
    centroCostoSegun?: string | null;
    documentosOc?: string | null;
    /** Del comprobante (SIRE, o XML si no está en el SIRE): el IGV desglosado, el total en soles y la detracción a revisar. */
    baseGravada?: number | null;
    igvComprobante?: number | null;
    noGravado?: number | null;
    desgloseSegun?: string | null;
    tipoCambio?: number | null;
    totalSoles?: number | null;
    detraccionRevisar?: string | null;
    /** De las constancias de depósito de detracción (migración 066): números, fecha del último pago, lo depositado y sus enlaces en Drive. */
    detraccionConstancia?: string | null;
    detraccionFechaPago?: string | null;
    detraccionDepositado?: number | null;
    detraccionPdf?: string | null;
    detraccionHtml?: string | null;
    /** «Con constancia», «Revisar monto», «Falta constancia» o vacío. */
    detraccionConstanciaEstado?: string | null;
    /** De los comprobantes de retención (migración 070): los CRE, la fecha del último pago, lo retenido y sus enlaces en Drive. */
    retencionComprobante?: string | null;
    retencionFechaPago?: string | null;
    retencionMonto?: number | null;
    retencionPdf?: string | null;
    retencionXml?: string | null;
    /** «Emitido», «Revertido», «Emitido y revertido» (con « · revisar: también tiene detracción» si la tiene) o vacío. */
    retencionEstado?: string | null;
}

// El orden importa: lo que se busca primero —de qué comprobante es, qué se
// compró— a la izquierda; lo numérico al final. Se decide una vez porque
// cambiarlo rompe lo que alguien arme encima.
export const CABECERAS_ITEMS = [
    'Período',
    'Origen',
    'RUC proveedor',
    'Proveedor',
    'Tipo',
    'Serie',
    'Número',
    'Fecha de emisión',
    'Moneda',
    'Forma de pago',
    'Guía de remisión',
    'Orden de compra',
    'Documento relacionado',
    'Tipo doc. relacionado',
    'Anticipo aplicado',
    '% Detracción',
    'Detracción',
    'Cuenta detracción',
    'Código bien/servicio detracción',
    'Línea',
    'Descripción',
    'Cantidad',
    'Unidad',
    'Precio unitario',
    'Importe',
    'Total del comprobante',
    'PDF',
    'XML',
    // Al final, para no correr lo que alguien ya tenga armado encima.
    'OC (carpeta)',
    'Centro de costo (CG)',
    'Código CONCAR',
    'Archivo que confirma la OC',
    'Enlace del archivo (OC)',
    'Situación del pago (OC)',
    'Comprador (OC)',
    'Área que completa el legajo',
    'Legajo de la OC',
    'Carpeta de la OC',
    'Proyecto de la OC',
    'Centro de costo según',
    'Documentos de la OC',
    'Base gravada',
    'IGV del comprobante',
    'No gravado (inafecto / exonerado)',
    'Desglose según',
    'Tipo de cambio',
    'Total en soles',
    'Detracción: revisar',
    'Constancia de detracción',
    'Fecha de pago (detracción)',
    'Detracción depositada',
    'PDF constancia de detracción',
    'HTML constancia de detracción',
    'Detracción: constancia',
    'Comprobante de retención',
    'Fecha de pago (retención)',
    'Retención',
    'PDF comprobante de retención',
    'XML comprobante de retención',
    'Retención: estado',
];

export const TIPOS_ITEMS: TipoColumna[] = [
    'texto', // Período
    'texto', // Origen
    'texto', // RUC proveedor
    'texto', // Proveedor
    'texto', // Tipo
    'texto', // Serie
    'texto', // Número
    'fecha', // Fecha de emisión
    'texto', // Moneda
    'texto', // Forma de pago
    'texto', // Guía de remisión
    'texto', // Orden de compra
    'texto', // Documento relacionado
    'texto', // Tipo doc. relacionado
    'numero', // Anticipo aplicado
    'numero', // % Detracción
    'numero', // Detracción
    'texto', // Cuenta detracción
    'texto', // Código bien/servicio detracción
    'numero', // Línea
    'texto', // Descripción
    'numero', // Cantidad
    'texto', // Unidad
    'numero', // Precio unitario
    'numero', // Importe
    'numero', // Total del comprobante
    'texto', // PDF
    'texto', // XML
    'texto', // OC (carpeta)
    'texto', // Centro de costo (CG)
    'texto', // Código CONCAR
    'texto', // Archivo que confirma la OC
    'texto', // Enlace del archivo (OC)
    'texto', // Situación del pago (OC)
    'texto', // Comprador (OC)
    'texto', // Área que completa el legajo
    'texto', // Legajo de la OC
    'texto', // Carpeta de la OC
    'texto', // Proyecto de la OC
    'texto', // Centro de costo según
    'texto', // Documentos de la OC
    'numero', // Base gravada
    'numero', // IGV del comprobante
    'numero', // No gravado (inafecto / exonerado)
    'texto', // Desglose según
    'numero', // Tipo de cambio
    'numero', // Total en soles
    'texto', // Detracción: revisar
    'texto', // Constancia de detracción
    'fecha', // Fecha de pago (detracción)
    'numero', // Detracción depositada
    'texto', // PDF constancia de detracción
    'texto', // HTML constancia de detracción
    'texto', // Detracción: constancia
    'texto', // Comprobante de retención
    'fecha', // Fecha de pago (retención)
    'numero', // Retención
    'texto', // PDF comprobante de retención
    'texto', // XML comprobante de retención
    'texto', // Retención: estado
];

// Vacío cuando no hay dato, no un cero: distinguir un importe ausente de uno
// que es cero de verdad.
const num = (v: number | null, dec = 2) => (v == null ? '' : Number(v).toFixed(dec));

const ORIGEN: Record<string, string> = {
    RECIBIDO: 'Recibido',
    EMITIDO: 'Emitido',
    OTRO: 'Otro',
};

export function filasItemsSunat(filas: FilaDetalleCpe[]): string[][] {
    return [
        CABECERAS_ITEMS,
        ...filas.map((f) => [
            f.periodo ?? '',
            ORIGEN[f.origen ?? ''] ?? f.origen ?? '',
            f.proveedorRuc ?? '',
            f.proveedorNombre ?? '',
            nombreDeTipo(f.tipoComprobante),
            f.serie ?? '',
            f.numero ?? '',
            fechaCorta(f.fechaEmision),
            f.moneda ?? '',
            f.formaPago ?? '',
            f.guiaRemision ?? '',
            f.ordenCompra ?? '',
            f.documentoRelacionado ?? '',
            f.tipoDocumentoRelacionado ?? '',
            num(f.anticipoAplicado, 2),
            num(f.detraccionPorcentaje, 2),
            num(f.detraccionMonto, 2),
            f.detraccionCuentaBanco ?? '',
            f.detraccionCodigoBienServicio ?? '',
            f.linea == null ? '' : String(f.linea),
            f.descripcion ?? '',
            num(f.cantidad, 2),
            f.unidad ?? '',
            num(f.precioUnitario, 4),
            num(f.importe, 2),
            num(f.totalComprobante, 2),
            f.enlacePdf ?? '',
            f.enlaceXml ?? '',
            f.ocCarpeta ?? '',
            f.centroCostoCg ?? '',
            f.codigoConcar ?? '',
            f.archivoOc ?? '',
            f.archivoOcUrl ?? '',
            f.situacionPagoOc ?? '',
            f.compradorOc ?? '',
            f.areaOc ?? '',
            f.legajoOc ?? '',
            f.carpetaOcUrl ?? '',
            (f.proyectoOc ?? '').trim(),
            f.centroCostoSegun ?? '',
            f.documentosOc ?? '',
            num(f.baseGravada ?? null, 2),
            num(f.igvComprobante ?? null, 2),
            num(f.noGravado ?? null, 2),
            f.desgloseSegun ?? '',
            num(f.tipoCambio ?? null, 3),
            num(f.totalSoles ?? null, 2),
            f.detraccionRevisar ?? '',
            f.detraccionConstancia ?? '',
            fechaCorta(f.detraccionFechaPago ?? null),
            num(f.detraccionDepositado ?? null, 2),
            f.detraccionPdf ?? '',
            f.detraccionHtml ?? '',
            f.detraccionConstanciaEstado ?? '',
            f.retencionComprobante ?? '',
            fechaCorta(f.retencionFechaPago ?? null),
            num(f.retencionMonto ?? null, 2),
            f.retencionPdf ?? '',
            f.retencionXml ?? '',
            f.retencionEstado ?? '',
        ]),
    ];
}

/** El nombre del archivo/hoja. Va aparte del de cabeceras para no pisarlo. */
export function nombreArchivoItems(periodo: string | null): string {
    return periodo ? `COMPROBANTES SUNAT - DETALLE ${periodo}.csv` : 'COMPROBANTES SUNAT - DETALLE.csv';
}
