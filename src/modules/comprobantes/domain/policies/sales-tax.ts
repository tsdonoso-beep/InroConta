// The sales and IGV check per month, as the PDT 621 is built (meeting with Contabilidad,
// 06/10/2026). Before, cuadre_ventas_json (old migration 063) did this in the base on every read;
// now the server adds up the issued documents it reads from v2.
//   · An invoice that applies an advance brings its base and IGV already NET of the advance (the
//     advance paid its IGV the month it was invoiced); anticipo_aplicado says how much.
//   · Credit notes (07) subtract. What is not taxed (export, unaffected, exempt) goes apart.
//   · In soles with the document's exchange rate (1 if it has none, as before).

/** One issued document (01, 03, 07, 08), as v2's comprobante keeps it. */
export interface SalesDoc {
    periodo: number;
    tipo: string;
    moneda: string | null;
    subtotal: number | null;
    igv: number | null;
    total: number | null;
    anticipo: number | null;
    tipoCambio: number | null;
}

/** One month of the check, in soles. */
export interface SalesTaxMonth {
    periodo: string;
    n_ventas: number;
    base_ventas: number;
    igv_ventas: number;
    n_notas: number;
    base_notas: number;
    igv_notas: number;
    base_neta: number;
    igv_neto: number;
    no_gravado: number;
    n_anticipos: number;
    anticipos: number;
    cubiertas_por_anticipo: number;
    total_neto: number;
}

/** SQL's round(x, 2): half away from zero, without the float error of 1.005 * 100. */
const round2 = (x: number) => (Math.sign(x) * Math.round(Math.abs(x) * 100 + 1e-9)) / 100;

export function salesTaxByMonth(docs: SalesDoc[]): SalesTaxMonth[] {
    const months = new Map<number, SalesTaxMonth>();
    for (const d of docs) {
        let m = months.get(d.periodo);
        if (!m) {
            m = {
                periodo: String(d.periodo),
                n_ventas: 0,
                base_ventas: 0,
                igv_ventas: 0,
                n_notas: 0,
                base_notas: 0,
                igv_notas: 0,
                base_neta: 0,
                igv_neto: 0,
                no_gravado: 0,
                n_anticipos: 0,
                anticipos: 0,
                cubiertas_por_anticipo: 0,
                total_neto: 0,
            };
            months.set(d.periodo, m);
        }
        const tc = d.moneda === 'PEN' ? 1 : (d.tipoCambio ?? 1);
        const igv = d.igv ?? 0,
            subtotal = d.subtotal ?? 0,
            total = d.total ?? 0,
            anticipo = d.anticipo ?? 0;
        const base = round2((igv / 0.18) * tc);
        const sign = d.tipo === '07' ? -1 : 1;
        if (d.tipo === '07') {
            m.n_notas++;
            m.base_notas += base;
            m.igv_notas += round2(igv * tc);
        } else {
            m.n_ventas++;
            m.base_ventas += base;
            m.igv_ventas += round2(igv * tc);
            m.anticipos += round2(anticipo * tc);
            if (anticipo > 0) m.n_anticipos++;
            if (anticipo > 0 && total === 0) m.cubiertas_por_anticipo++;
        }
        m.no_gravado += sign * round2(Math.max(subtotal - igv / 0.18, 0) * tc);
        m.total_neto += sign * round2(total * tc);
    }
    return [...months.values()]
        .sort((a, z) => a.periodo.localeCompare(z.periodo))
        .map((m) => {
            for (const k of ['base_ventas', 'igv_ventas', 'base_notas', 'igv_notas', 'no_gravado', 'anticipos', 'total_neto'] as const) m[k] = round2(m[k]);
            return { ...m, base_neta: round2(m.base_ventas - m.base_notas), igv_neto: round2(m.igv_ventas - m.igv_notas) };
        });
}
