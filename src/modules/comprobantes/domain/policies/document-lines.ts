// The lines of ONE document, when someone opens it in Buscar factura. The port of
// detalleDelComprobante (VistaEjecutiva.gs): there it searched the sheet with a TextFinder; here
// the lines are already in the server's memory, indexed once per read.
import type { FilaDetalleCpe } from '../../../../shared/lib/export/items-sunat.ts';

export interface DocumentLine {
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    amount: number;
}

export interface DocumentLines {
    lines: DocumentLine[];
    paymentForm: string;
    dispatchGuide: string;
    /** The OC the supplier cites in its invoice. */
    supplierOc: string;
    costCenter: string;
    buyer: string;
    detraction: number;
}

const noZeros = (v: string | null | undefined) => (v ?? '').trim().replace(/^0+(?=\d)/, '');

/** «RUC|SERIE|NUMBER» without the zeros on the left: the same key the browser builds from a Doc. */
export const lineKey = (ruc: string | null | undefined, series: string | null | undefined, number: string | null | undefined) =>
    `${(ruc ?? '').trim()}|${(series ?? '').trim().toUpperCase()}|${noZeros(number)}`;

export function indexLines(rows: FilaDetalleCpe[]): Map<string, FilaDetalleCpe[]> {
    const index = new Map<string, FilaDetalleCpe[]>();
    for (const f of rows) {
        if (!f.serie) continue;
        const k = lineKey(f.proveedorRuc, f.serie, f.numero);
        const list = index.get(k);
        if (list) list.push(f);
        else index.set(k, [f]);
    }
    return index;
}

export function documentLines(rows: FilaDetalleCpe[]): DocumentLines {
    const sorted = [...rows].sort((a, b) => (a.linea ?? 0) - (b.linea ?? 0));
    const f0 = sorted[0];
    return {
        lines: sorted.map((f) => ({
            description: f.descripcion ?? '',
            quantity: f.cantidad ?? 0,
            unit: f.unidad ?? '',
            unitPrice: f.precioUnitario ?? 0,
            amount: f.importe ?? 0,
        })),
        paymentForm: f0?.formaPago ?? '',
        dispatchGuide: f0?.guiaRemision ?? '',
        supplierOc: f0?.ordenCompra ?? '',
        costCenter: f0?.centroCostoCg ?? '',
        buyer: f0?.compradorOc ?? '',
        detraction: f0?.detraccionMonto ?? 0,
    };
}
