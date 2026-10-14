// Everything bought, one entry per product × unit × currency × supplier, with its price month by
// month: the «¿Cuánto pagamos por…?» finder (Precios). The port of the «productos» part of
// datosCompactosVista_ (apps-script/inroconta/VistaEjecutiva.gs), same rules.
import { nombreDeTipo } from '../../../../shared/lib/export/comprobantes-sunat.ts';
import type { FilaDetalleCpe } from '../../../../shared/lib/export/items-sunat.ts';
import { nameCase, sentenceCase } from '../../../../shared/text.ts';
import { driveId } from '../entities/Doc.ts';

export interface Product {
    description: string;
    unit: string;
    currency: string;
    ruc: string;
    supplier: string;
    /** Lines bought. */
    times: number;
    spent: number;
    /** [YYYYMM, unit price] per month, oldest first: amount ÷ quantity, or the average price. */
    prices: [string, number][];
    /** The PDF of the last purchase. */
    pdf: string;
}

export interface ProductList {
    products: Product[];
    /** Before keeping only the MAX_PRODUCTS of most spend. */
    total: number;
}

/** What travels to the browser for the finder (the most spent first). */
export const MAX_PRODUCTS = 7000;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const text = (v: string | null | undefined) => (v ?? '').trim();

interface Month {
    qty: number;
    amount: number;
    sum: number;
    n: number;
}

export function productsFromLines(rows: FilaDetalleCpe[]): ProductList {
    const acc = new Map<string, Omit<Product, 'prices'> & { months: Map<string, Month>; last: string }>();
    for (const f of rows) {
        // Real purchases only: no sales, no notes, no advance lines in negative.
        if (f.origen !== 'RECIBIDO' || /nota/i.test(nombreDeTipo(f.tipoComprobante))) continue;
        const description = text(f.descripcion).replace(/\s+/g, ' ');
        const price = f.precioUnitario ?? 0;
        if (description.length < 3 || !(price > 0)) continue;
        const unit = text(f.unidad);
        const currency = text(f.moneda) || 'PEN';
        const ruc = text(f.proveedorRuc);
        const key = [description.toUpperCase(), unit.toUpperCase(), currency, ruc || text(f.proveedorNombre)].join('|');
        let p = acc.get(key);
        if (!p) {
            p = {
                description: sentenceCase(description),
                unit,
                currency,
                ruc,
                supplier: nameCase(f.proveedorNombre),
                times: 0,
                spent: 0,
                pdf: '',
                months: new Map(),
                last: '',
            };
            acc.set(key, p);
        }
        const period = text(f.periodo);
        const qty = f.cantidad ?? 0;
        const amount = f.importe ?? 0;
        let m = p.months.get(period);
        if (!m) p.months.set(period, (m = { qty: 0, amount: 0, sum: 0, n: 0 }));
        if (qty > 0 && amount > 0) {
            m.qty += qty;
            m.amount += amount;
        }
        m.sum += price;
        m.n++;
        p.times++;
        p.spent += amount > 0 ? amount : price * (qty || 1);
        if (period >= p.last) {
            p.last = period;
            p.pdf = driveId(f.enlacePdf) || p.pdf;
        }
    }
    const list: Product[] = [...acc.values()].map(({ months, ...p }) => ({
        unit: p.unit,
        currency: p.currency,
        ruc: p.ruc,
        supplier: p.supplier,
        times: p.times,
        pdf: p.pdf,
        description: p.description.slice(0, 140),
        spent: round2(p.spent),
        prices: [...months.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([period, m]) => [period, round4(m.qty > 0 ? m.amount / m.qty : m.sum / m.n)]),
    }));
    list.sort((a, b) => b.spent - a.spent);
    return { products: list.slice(0, MAX_PRODUCTS), total: list.length };
}
