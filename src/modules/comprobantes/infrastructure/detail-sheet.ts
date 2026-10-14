// The DETALLE tab of the book back to detail lines (FilaDetalleCpe), the reverse of
// filasItemsSunat: the robots build that tab from the base, so reading it gives the same
// lines as the base, already computed. Measured 13/10/2026: the tab, 27 463 rows, in 7.5 s;
// the same lines from the base (detalle_cpe_hoja_con_detraccion, by pages), 93 s.
//
// Columns are found by their header (CABECERAS_ITEMS), as the Apps Script view does; one that
// is missing reads as empty, so an older tab still works.
import type { FilaDetalleCpe } from '../../../shared/lib/export/items-sunat.ts';

type Field = keyof FilaDetalleCpe;
type Kind = 'text' | 'number' | 'date';

const COLUMNS: [header: string, field: Field, kind: Kind][] = [
    ['Período', 'periodo', 'text'],
    ['Origen', 'origen', 'text'],
    ['RUC proveedor', 'proveedorRuc', 'text'],
    ['Proveedor', 'proveedorNombre', 'text'],
    ['Tipo', 'tipoComprobante', 'text'],
    ['Serie', 'serie', 'text'],
    ['Número', 'numero', 'text'],
    ['Fecha de emisión', 'fechaEmision', 'date'],
    ['Moneda', 'moneda', 'text'],
    ['Detracción', 'detraccionMonto', 'number'],
    ['Línea', 'linea', 'number'],
    ['Descripción', 'descripcion', 'text'],
    ['Cantidad', 'cantidad', 'number'],
    ['Unidad', 'unidad', 'text'],
    ['Precio unitario', 'precioUnitario', 'number'],
    ['Importe', 'importe', 'number'],
    ['Total del comprobante', 'totalComprobante', 'number'],
    ['PDF', 'enlacePdf', 'text'],
    ['XML', 'enlaceXml', 'text'],
    ['Forma de pago', 'formaPago', 'text'],
    ['Guía de remisión', 'guiaRemision', 'text'],
    ['Orden de compra', 'ordenCompra', 'text'],
    ['OC (carpeta)', 'ocCarpeta', 'text'],
    ['Centro de costo (CG)', 'centroCostoCg', 'text'],
    ['Situación del pago (OC)', 'situacionPagoOc', 'text'],
    ['Comprador (OC)', 'compradorOc', 'text'],
    ['Área que completa el legajo', 'areaOc', 'text'],
    ['Legajo de la OC', 'legajoOc', 'text'],
    ['Carpeta de la OC', 'carpetaOcUrl', 'text'],
    ['Base gravada', 'baseGravada', 'number'],
    ['IGV del comprobante', 'igvComprobante', 'number'],
    ['No gravado (inafecto / exonerado)', 'noGravado', 'number'],
    ['Tipo de cambio', 'tipoCambio', 'number'],
    ['Total en soles', 'totalSoles', 'number'],
    ['Detracción: revisar', 'detraccionRevisar', 'text'],
    ['Constancia de detracción', 'detraccionConstancia', 'text'],
    ['Fecha de pago (detracción)', 'detraccionFechaPago', 'date'],
    ['Detracción depositada', 'detraccionDepositado', 'number'],
    ['PDF constancia de detracción', 'detraccionPdf', 'text'],
    ['HTML constancia de detracción', 'detraccionHtml', 'text'],
    ['Detracción: constancia', 'detraccionConstanciaEstado', 'text'],
];

const isBlank = (v: unknown) => v == null || String(v).trim() === '';

/** «12/09/2026» (or an ISO date) → «2026-09-12»; anything else → null. */
export function isoDate(v: unknown): string | null {
    const s = String(v ?? '').trim();
    const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

function value(v: unknown, kind: Kind): string | number | null {
    if (isBlank(v)) return null;
    if (kind === 'number') {
        const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
        return isNaN(n) ? null : n;
    }
    if (kind === 'date') return isoDate(v);
    return String(v).trim();
}

/** The tab's values (header first, numbers unformatted, dates as dd/mm/yyyy) as detail lines. */
export function detailFromSheet(values: unknown[][]): FilaDetalleCpe[] {
    const head = (values[0] ?? []).map((h) => String(h ?? '').trim());
    const cols = COLUMNS.map(([header, field, kind]) => ({ i: head.indexOf(header), field, kind })).filter((c) => c.i >= 0);
    if (!cols.some((c) => c.field === 'serie') || !cols.some((c) => c.field === 'totalComprobante')) {
        throw new Error('La pestaña DETALLE no trae las columnas «Serie» y «Total del comprobante».');
    }
    return values.slice(1).map((row) => {
        const line = {} as Record<Field, unknown>;
        for (const c of cols) line[c.field] = value(row[c.i], c.kind);
        // «Recibido» in the tab, RECIBIDO in the base.
        if (typeof line.origen === 'string') line.origen = line.origen.toUpperCase();
        return line as unknown as FilaDetalleCpe;
    });
}
