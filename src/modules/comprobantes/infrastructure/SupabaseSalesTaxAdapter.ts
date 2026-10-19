// The issued documents of the year from v2's comprobante; the month check is a domain policy
// (salesTaxByMonth). The exchange rate is stored with each document (before, cuadre_ventas_json
// looked it up in the SIRE with mode() on every read).
import 'server-only';
import type { Result } from 'neverthrow';
import { all } from '../../../shared/supabase/tables.ts';
import type { SalesTaxPort } from '../application/ports/SalesTaxPort.ts';
import type { ComprobantesError } from '../domain/errors.ts';
import { salesTaxByMonth, type SalesDoc, type SalesTaxMonth } from '../domain/policies/sales-tax.ts';

type Row = Record<string, unknown>;
const n = (v: unknown) => (v == null ? null : Number(v));

export class SupabaseSalesTaxAdapter implements SalesTaxPort {
    async readMonths(companyRuc: string): Promise<Result<SalesTaxMonth[], ComprobantesError>> {
        const year = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }).slice(0, 4));
        const rows = await all<Row>('comprobante (ventas)', (c) =>
            c
                .from('comprobante')
                .select('id,periodo,tipo,moneda,subtotal,igv,total,anticipo_aplicado,tipo_cambio')
                .eq('empresa_ruc', companyRuc)
                .eq('origen', 'EMITIDO')
                .in('tipo', ['01', '03', '07', '08'])
                .gte('periodo', year * 100)
                .lte('periodo', year * 100 + 12)
                .order('id'),
        );
        return rows
            .mapErr((e): ComprobantesError => ({ kind: 'source-failed', message: e.message }))
            .map((list) =>
                salesTaxByMonth(
                    list.map((r): SalesDoc => ({
                        periodo: Number(r.periodo),
                        tipo: String(r.tipo),
                        moneda: (r.moneda as string) ?? null,
                        subtotal: n(r.subtotal),
                        igv: n(r.igv),
                        total: n(r.total),
                        anticipo: n(r.anticipo_aplicado),
                        tipoCambio: n(r.tipo_cambio),
                    })),
                ),
            );
    }
}
