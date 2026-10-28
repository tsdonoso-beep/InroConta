// The kardex summary per month (kardex_mes), the changes of the last days (cambio, entidad
// 'kardex') and the last reading (corrida, job 'kardex') from the v2 tables (migration 016).
import 'server-only';
import { ok, Result, type Result as R } from 'neverthrow';
import type { SourceError } from '../../../shared/errors.ts';
import { all, one } from '../../../shared/supabase/tables.ts';
import type { KardexPort } from '../application/ports/KardexPort.ts';
import type { KardexChange, KardexChangeType, KardexMonth, KardexRead } from '../domain/entities/Kardex.ts';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const n = (v: unknown) => (v == null ? 0 : Number(v));

const month = (r: Row): KardexMonth => ({
    month: s(r.mes),
    movements: n(r.movimientos),
    vouchers: n(r.vales),
    inQty: n(r.ingresos),
    outQty: n(r.salidas),
    voided: n(r.anulados),
});

function change(r: Row): KardexChange {
    const d = (r.detalle as Row | null) ?? {};
    return {
        id: n(r.id),
        key: s(r.clave),
        type: s(r.tipo) as KardexChangeType,
        field: s(r.campo),
        before: s(r.antes),
        after: s(r.despues),
        month: s(d.mes),
        closedMonth: d.mesCerrado === true,
        voucher: s(d.vale),
        movement: s(d.movimiento),
        sku: s(d.sku),
        product: s(d.producto),
        project: s(d.proyecto),
        responsible: s(d.responsable),
        at: s(r.ocurrido_en),
    };
}

export class SupabaseKardexAdapter implements KardexPort {
    async read(companyRuc: string, days: number): Promise<R<KardexRead, SourceError>> {
        const since = new Date(Date.now() - days * 86400_000).toISOString();
        const [months, changes, runs] = await Promise.all([
            all<Row>('kardex_mes', (c) =>
                c.from('kardex_mes').select('mes,movimientos,vales,ingresos,salidas,anulados').eq('empresa_ruc', companyRuc).order('mes', { ascending: false }),
            ),
            all<Row>('cambio (kardex)', (c) =>
                c
                    .from('cambio')
                    .select('id,clave,tipo,campo,antes,despues,detalle,ocurrido_en')
                    .eq('entidad', 'kardex')
                    .eq('detalle->>empresa_ruc', companyRuc)
                    .gte('ocurrido_en', since)
                    .order('ocurrido_en', { ascending: false })
                    .order('id', { ascending: false }),
            ),
            one<Row>('corrida (kardex)', (c) =>
                c
                    .from('corrida')
                    .select('terminada_en')
                    .eq('job', 'kardex')
                    .eq('empresa_ruc', companyRuc)
                    .in('resultado', ['OK', 'PARCIAL'])
                    .order('terminada_en', { ascending: false })
                    .limit(1),
            ),
        ]);
        return Result.combine([months, changes, runs]).andThen(([m, c, r]) =>
            ok({ months: m.map(month), changes: c.map(change), lastReadAt: s(r[0]?.terminada_en), readAt: new Date().toISOString() }),
        );
    }
}
