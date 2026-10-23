// What fuentes-compras.mts reads from and writes to the v2 base: the orders, DUAs and vouchers
// as they are now (to log what changed and to tell CG's procedencia), guardar_fuente_oc once per
// source, and the copy times of the private sheet (corrida, job copia-fuentes).

import type { KnownOrder } from '../../../src/shared/lib/oc/base-cg.ts';
import { orderKey, sourceChanges } from '../../../src/shared/lib/oc/cambios-fuentes.ts';
import { parseOc } from '../../../src/shared/lib/oc/base-cg.ts';
import type { Row } from '../../../src/shared/lib/oc/fuentes.ts';
import { allRows, call, type Base } from './base.mts';

export type Source = 'COMPRAS' | 'COMEX' | 'CG' | 'ALMACEN';

export interface SourcesState {
    orders: Map<string, Row>;
    duas: Map<string, string[]>;
    vouchers: Map<string, Row>;
    cgRows: number;
    costCentres: Row[];
}

export async function readSourcesState(sb: Base, companyRuc: string): Promise<SourcesState> {
    const [orders, duas, vouchers, cg, costCentres] = await Promise.all([
        allRows<Row>(
            sb,
            'orden_compra',
            'id,procedencia,codigo,numero,anio,proveedor_ruc,proveedor_nombre,fecha_oc,monto_pen,moneda,elaborado,items,compras_en,comex_en,comex_estado,llegada_planta,agente_aduanas,dam,costeo,comprador,comprador_segun,compras_fila,comex_fila',
            ['id'],
            (q) => q.eq('empresa_ruc', companyRuc),
        ),
        allRows<Row>(sb, 'orden_compra_dua', 'orden_compra_id,dua', ['orden_compra_id', 'dua']),
        allRows<Row>(
            sb,
            'vale_almacen',
            'id,vale,movimiento,operacion,tipo_documento,numero_documento,numero_orden,fecha_operacion,items,cantidad,documento_ruta,orden:orden_compra_id(procedencia,codigo)',
            ['id'],
            (q) => q.eq('empresa_ruc', companyRuc),
        ),
        allRows<Row>(sb, 'orden_compra_centro_costo', 'orden_compra_id,orden_compra!inner(empresa_ruc)', ['orden_compra_id', 'centro_costo_id'], (q) =>
            q.eq('orden_compra.empresa_ruc', companyRuc),
        ),
        allRows<Row>(sb, 'centro_costo', 'codigo,codigo_normal', ['codigo'], (q) => q.eq('empresa_ruc', companyRuc)),
    ]);
    const duasOf = new Map<string, string[]>();
    for (const d of duas) duasOf.set(d.orden_compra_id, [...(duasOf.get(d.orden_compra_id) ?? []), d.dua]);
    return {
        orders: new Map(orders.map((o) => [`${o.procedencia}|${o.numero}|${o.anio}`, o])),
        duas: duasOf,
        vouchers: new Map(vouchers.map((v) => [v.id as string, v])),
        cgRows: cg.length,
        costCentres,
    };
}

/** How many rows of the source v2 holds (guardar_fuente_oc refuses a complete load of less than half). */
export function rowsBefore(s: SourcesState, source: Source): number {
    const orders = [...s.orders.values()];
    if (source === 'COMPRAS') return orders.filter((o) => o.compras_en).length;
    if (source === 'COMEX') return orders.filter((o) => o.comex_en).length;
    return source === 'CG' ? s.cgRows : s.vouchers.size;
}

/** The orders v2 knows, with the supplier Compras gives now, to tell CG's procedencia. */
export function knownOrders(s: SourcesState, compras: Row[]): Map<string, KnownOrder> {
    const out = new Map<string, KnownOrder>();
    for (const [k, o] of s.orders) out.set(k, { procedencia: o.procedencia, numero: o.numero, anio: o.anio, proveedor_ruc: o.proveedor_ruc ?? null });
    for (const c of compras) {
        const k = orderKey(c.procedencia, c.oc);
        const oc = parseOc(c.oc);
        if (k && oc) out.set(k, { procedencia: c.procedencia, numero: oc.numero, anio: oc.anio, proveedor_ruc: c.proveedor_ruc ?? null });
    }
    return out;
}

/** A cost-centre code as v2 has it («PROY-2024- 032» → «PROY-2024-032»), so the base does not make a twin. */
export function canonicalCode(s: SourcesState) {
    const byNormal = new Map(s.costCentres.map((c) => [c.codigo_normal as string, c.codigo as string]));
    return (code: string) => byNormal.get(code.replace(/\s+/g, '').toUpperCase()) ?? code;
}

/** One source, with what changed since the last load. `complete`: what did not come is removed. */
export async function loadSource(sb: Base, companyRuc: string, s: SourcesState, source: Source, rows: Row[], complete: boolean) {
    const cambios = source === 'CG' ? [] : sourceChanges(source, rows, s, complete);
    const r = await call<{ filas: number; habia: number; quitadas: number; cambios: number }>(sb, 'guardar_fuente_oc', {
        p_empresa_ruc: companyRuc,
        p_fuente: source,
        p_filas: rows,
        p_completa: complete,
        p_cambios: cambios,
    });
    return r;
}

/** The copy times of the private sheet, one corrida per tab; a copy already logged is not repeated. */
export async function saveCopies(sb: Base, companyRuc: string, runs: Row[]): Promise<number> {
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();
    const logged = await allRows<Row>(sb, 'corrida', 'id,terminada_en,resumen', ['id'], (q) =>
        q.eq('job', 'copia-fuentes').eq('empresa_ruc', companyRuc).gte('iniciada_en', since),
    );
    const seen = new Set(logged.map((c) => `${c.resumen?.pestana}|${c.resumen?.fin ?? ''}`));
    const fresh = runs.filter((r) => !seen.has(`${r.resumen.pestana}|${r.resumen.fin ?? ''}`));
    if (!fresh.length) return 0;
    const { error } = await sb.from('corrida').insert(fresh);
    if (error) throw new Error(`corrida (copia-fuentes): ${error.message}`);
    return fresh.length;
}
