import 'server-only';
import { err, ok, type Result } from 'neverthrow';
import { robotClient } from '../../../shared/supabase/robot.ts';
import type { SalesTaxMonth, SalesTaxPort } from '../application/ports/SalesTaxPort.ts';
import { sourceFailed, type ComprobantesError } from '../domain/errors.ts';

const NUMBERS = [
    'n_ventas',
    'base_ventas',
    'igv_ventas',
    'n_notas',
    'base_notas',
    'igv_notas',
    'base_neta',
    'igv_neto',
    'no_gravado',
    'n_anticipos',
    'anticipos',
    'cubiertas_por_anticipo',
    'total_neto',
] as const;

/** cuadre_ventas_json (migration 063): the whole list in one call, migration 058's *_json style. */
export class SupabaseSalesTaxAdapter implements SalesTaxPort {
    async readMonths(companyRuc: string): Promise<Result<SalesTaxMonth[], ComprobantesError>> {
        try {
            const { data, error } = await (await robotClient()).rpc('cuadre_ventas_json', { p_empresa_ruc: companyRuc });
            if (error) {
                console.error('[comprobantes] cuadre_ventas_json failed', {
                    code: error.code,
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
                });
                return err({ kind: 'source-failed', message: error.message });
            }
            const list = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
            return ok(
                list.map((r) => {
                    const month = { periodo: String(r.periodo ?? '') } as SalesTaxMonth;
                    for (const k of NUMBERS) month[k] = Number(r[k]) || 0;
                    return month;
                }),
            );
        } catch (e) {
            console.error('[comprobantes] cuadre_ventas_json threw', e);
            return err(sourceFailed(e));
        }
    }
}
