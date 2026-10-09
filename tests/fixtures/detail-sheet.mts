// A small «COMPROBANTES SUNAT - DETALLE» tab: one row per item line, with the
// column names the robot publishes (src/shared/lib/export/items-sunat.ts) and
// the INROCONTA view reads (apps-script/inroconta/VistaEjecutiva.gs). Each case covers a branch
// of the view: several lines of one invoice, a credit note, dollars, a sale,
// a withholding (detracción) with its deposit, and an import order.
import type { Cell } from '../helpers/apps-script.mts';

export const DETAIL_TAB = 'COMPROBANTES SUNAT - DETALLE';

const COLUMNS = [
    'Período',
    'Origen',
    'RUC proveedor',
    'Proveedor',
    'Tipo',
    'Serie',
    'Número',
    'Fecha de emisión',
    'Moneda',
    'Total del comprobante',
    'Detracción',
    'Descripción',
    'Unidad',
    'Cantidad',
    'Precio unitario',
    'Importe',
    'PDF',
    'XML',
    'OC (carpeta)',
    'Centro de costo (CG)',
    'Área que completa el legajo',
    'Total en soles',
    'Base gravada',
    'IGV del comprobante',
    'Tipo de cambio',
    'Constancia de detracción',
    'Fecha de pago (detracción)',
    'Detracción depositada',
    'Detracción: constancia',
] as const;

type Column = (typeof COLUMNS)[number];
type Row = Partial<Record<Column, Cell>>;

const drive = (id: string) => `https://drive.google.com/file/d/${id}/view`;

/** The rows of the fixture, as they would come from the sheet. */
export const DETAIL_ROWS: Row[] = [
    // A purchase invoice with two lines (one document, two products).
    {
        Período: '202608',
        Origen: 'Recibido',
        'RUC proveedor': '20100000001',
        Proveedor: 'TONER PERU SAC',
        Tipo: 'Factura',
        Serie: 'F001',
        Número: '00000123',
        'Fecha de emisión': new Date('2026-08-14T12:00:00-05:00'),
        Moneda: 'PEN',
        'Total del comprobante': 1180,
        Descripción: 'TONER HP 85A',
        Unidad: 'UND',
        Cantidad: 2,
        'Precio unitario': 250,
        Importe: 500,
        PDF: drive('pdf000000000000000000001'),
        XML: drive('xml000000000000000000001'),
        'OC (carpeta)': 'OC 2026 - 0200',
        'Centro de costo (CG)': 'ADMINISTRACION',
        'Base gravada': 1000,
        'IGV del comprobante': 180,
    },
    {
        Período: '202608',
        Origen: 'Recibido',
        'RUC proveedor': '20100000001',
        Proveedor: 'TONER PERU SAC',
        Tipo: 'Factura',
        Serie: 'F001',
        Número: '00000123',
        Moneda: 'PEN',
        'Total del comprobante': 1180,
        Descripción: 'PAPEL BOND A4',
        Unidad: 'MILLAR',
        Cantidad: 20,
        'Precio unitario': 25,
        Importe: 500,
    },
    // Its credit note: it must subtract.
    {
        Período: '202609',
        Origen: 'Recibido',
        'RUC proveedor': '20100000001',
        Proveedor: 'TONER PERU SAC',
        Tipo: 'Nota de crédito',
        Serie: 'FC01',
        Número: '7',
        Moneda: 'PEN',
        'Total del comprobante': 118,
        Descripción: 'DEVOLUCION TONER',
        'Precio unitario': 100,
    },
    // A service in dollars with a withholding already deposited.
    {
        Período: '202609',
        Origen: 'Recibido',
        'RUC proveedor': '20200000002',
        Proveedor: 'TRANSPORTES ANDINOS EIRL',
        Tipo: 'Factura',
        Serie: 'E001',
        Número: '45',
        Moneda: 'USD',
        'Total del comprobante': 1000,
        Detracción: 40,
        Descripción: 'SERVICIO DE TRANSPORTE',
        Cantidad: 1,
        'Precio unitario': 1000,
        Importe: 1000,
        'Total en soles': 3750,
        'Tipo de cambio': 3.75,
        'Constancia de detracción': '123456789',
        'Fecha de pago (detracción)': new Date('2026-09-20T12:00:00-05:00'),
        'Detracción depositada': 150,
        'Detracción: constancia': 'Con constancia',
    },
    // An import (three-digit order number, like the approvals table).
    {
        Período: '202609',
        Origen: 'Recibido',
        'RUC proveedor': '20300000003',
        Proveedor: 'AGENCIA DE ADUANAS SAC',
        Tipo: 'Factura',
        Serie: 'F002',
        Número: '9',
        Moneda: 'PEN',
        'Total del comprobante': 590,
        'OC (carpeta)': '172-2026',
        Descripción: 'AGENCIAMIENTO',
        'Precio unitario': 500,
    },
    // A sale: counts as a document, never as a purchased product.
    {
        Período: '202609',
        Origen: 'Emitido',
        'RUC proveedor': '20400000004',
        Proveedor: 'CLIENTE INDUSTRIAL SA',
        Tipo: 'Factura',
        Serie: 'F001',
        Número: '880',
        Moneda: 'PEN',
        'Total del comprobante': 5900,
        Descripción: 'IMPRESION DE ETIQUETAS',
        'Precio unitario': 5000,
    },
];

/** The tab as a grid: the header, then each row in column order ('' where a row has no value). */
export function detailGrid(rows: Row[] = DETAIL_ROWS, columns: readonly string[] = COLUMNS): Cell[][] {
    return [[...columns], ...rows.map((row) => columns.map((c) => row[c as Column] ?? ''))];
}
