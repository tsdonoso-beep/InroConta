// What changed in Compras, COMEX and Almacén since the last load: the new rows (fuentes.ts) against
// what v2 holds. Port of the change log of the old cargar_fuentes_compras() (fuente_cambio); v2's
// guardar_fuente_oc stores these in `cambio` in the same transaction (p_cambios). Only the columns
// the load really overwrites are compared, so a value v2 keeps does not show up as a change daily.

import { currency, isoDate, nul, type Proc, type Row } from './fuentes.ts';
import { parseOc } from './base-cg.ts';

export interface Change {
    entidad: 'orden_compra' | 'vale_almacen';
    clave: string;
    tipo: 'CAMBIO' | 'NUEVO' | 'ELIMINADO';
    campo: string | null;
    antes: string | null;
    despues: string | null;
    detalle: Row;
}

/** The OC as orden_compra.codigo writes it (0172-2026 national, 172-2026 import). */
export function ocCode(procedencia: Proc, code: string): string | null {
    const oc = parseOc(code);
    return oc ? `${oc.numero.padStart(procedencia === 'NACIONAL' ? 4 : 3, '0')}-${oc.anio}` : null;
}

/** The key of an OC in v2: procedencia|numero|anio. */
export const orderKey = (procedencia: Proc | null, code: string | null) => {
    const oc = procedencia && code ? parseOc(code) : null;
    return oc ? `${procedencia}|${oc.numero}|${oc.anio}` : null;
};

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const same = (a: unknown, b: unknown) => {
    if (typeof a === 'number' || typeof b === 'number') return a !== null && b !== null && a !== '' && b !== '' && Number(a) === Number(b);
    return str(a) === str(b);
};

/** campo (the old fuente_cambio name) → [column in the new row, column in orden_compra]. */
const COMPRAS_FIELDS: Array<[string, string, string]> = [
    ['total_soles', 'monto_pen', 'monto_pen'],
    ['moneda', 'moneda', 'moneda'],
    ['proveedor_ruc', 'proveedor_ruc', 'proveedor_ruc'],
    ['proveedor', 'proveedor_nombre', 'proveedor_nombre'],
    ['elaborado', 'elaborado', 'elaborado'],
    ['items', 'items', 'items'],
];
const RESOLVED = new Set(['total_soles', 'moneda', 'proveedor_ruc', 'proveedor']);
/** The old sheet row's cells, normalized as the new rows are. */
const RAW: Record<string, (v: unknown) => unknown> = {
    moneda: (v) => currency(v as string),
    fecha_real_planta: (v) => isoDate(v as string),
    proveedor_ruc: (v) => nul(v as string),
};
const COMEX_FIELDS: Array<[string, string, string]> = [
    ['estado_compra', 'comex_estado', 'comex_estado'],
    ['fecha_real_planta', 'llegada_planta', 'llegada_planta'],
    ['agente_aduanas', 'agente_aduanas', 'agente_aduanas'],
    ['dam', 'dam', 'dam'],
    ['costeo', 'costeo', 'costeo'],
];
const VALE_FIELDS = ['movimiento', 'operacion', 'tipo_documento', 'numero_documento', 'numero_orden', 'fecha_operacion', 'items', 'cantidad', 'documento_ruta'];

const change = (entidad: Change['entidad'], clave: string, campo: string, antes: unknown, despues: unknown, detalle: Row): Change => ({
    entidad,
    clave,
    tipo: antes === null ? 'NUEVO' : despues === null ? 'ELIMINADO' : 'CAMBIO',
    campo,
    antes: antes === null ? null : str(antes),
    despues: despues === null ? null : str(despues),
    detalle,
});

/**
 * The changes of one load. `orders` are v2's orden_compra rows by orderKey, `duas` the DUA list of
 * each order id, `vouchers` v2's vale_almacen rows by id. `complete`: the load replaces everything
 * (what did not come is gone). Nothing is logged on the first load of a source.
 */
export function sourceChanges(
    source: 'COMPRAS' | 'COMEX' | 'ALMACEN',
    rows: Row[],
    v2: { orders: Map<string, Row>; duas: Map<string, string[]>; vouchers: Map<string, Row> },
    complete: boolean,
): Change[] {
    const out: Change[] = [];
    const orders = [...v2.orders.values()];
    if (source === 'COMPRAS' || source === 'COMEX') {
        const stamp = source === 'COMPRAS' ? 'compras_en' : 'comex_en';
        if (!orders.some((o) => o[stamp])) return out;
        const seen = new Set<string>();
        for (const r of rows) {
            const k = orderKey(r.procedencia, r.oc);
            const o = k ? v2.orders.get(k) : undefined;
            if (k) seen.add(k);
            if (!o?.[stamp]) continue;
            const clave = `${o.procedencia}|${o.codigo}`;
            const detalle = { fuente: source, oc: o.codigo };
            // Until v2 loads the source once, the row db:mudanza kept (*_fila) says what the sheet said.
            const raw = o[source === 'COMPRAS' ? 'compras_fila' : 'comex_fila'];
            const fresh = !!raw?.cargado_en && Date.parse(raw.cargado_en) >= Date.parse(o[stamp]) - 1000;
            for (const [campo, mine, theirs] of source === 'COMPRAS' ? COMPRAS_FIELDS : COMEX_FIELDS) {
                const before = fresh ? (RAW[campo] ?? ((v: unknown) => v))(raw[campo]) : o[theirs];
                // The supplier, currency and amount are resolved over every source (CG fills what Compras
                // leaves blank): only a value that replaces another is a change.
                if (!fresh && RESOLVED.has(campo) && (str(before) === '' || str(r[mine]) === '')) continue;
                if (campo === 'total_soles' && Math.abs(Number(before ?? 0) - Number(r[mine] ?? 0)) < 0.5) continue;
                if (!same(before, r[mine])) out.push({ ...change('orden_compra', clave, campo, before ?? '', r[mine] ?? '', detalle), tipo: 'CAMBIO' });
            }
            if (source === 'COMEX') {
                const before = [...(v2.duas.get(o.id) ?? [])].sort().join(' / ');
                const after = [...new Set((r.duas as Row[]).map((d) => d.dua as string))].sort().join(' / ');
                if (before !== after) out.push({ ...change('orden_compra', clave, 'duas', before, after, detalle), tipo: 'CAMBIO' });
                if (o.comprador_segun === 'COMEX' && r.comprador && !same(o.comprador, r.comprador))
                    out.push({ ...change('orden_compra', clave, 'comprador', o.comprador ?? '', r.comprador, detalle), tipo: 'CAMBIO' });
            }
        }
        if (source === 'COMPRAS' && complete)
            for (const [k, o] of v2.orders)
                if (o.compras_en && !seen.has(k))
                    out.push(
                        change('orden_compra', `${o.procedencia}|${o.codigo}`, 'ELIMINADO', `${o.proveedor_nombre ?? ''} · S/ ${o.monto_pen ?? '—'}`, null, {
                            fuente: source,
                            oc: o.codigo,
                        }),
                    );
        return out;
    }

    if (!v2.vouchers.size) return out;
    const label = (v: Row) => `Vale ${v.vale ?? ''} · ${v.tipo_documento || 'documento'} ${v.numero_documento ?? ''}`.trim();
    const claveOf = (v: Row, fallback?: Row) => {
        const p = (v.procedencia ?? fallback?.procedencia ?? 'NACIONAL') as Proc;
        return `${p}|${ocCode(p, v.oc ?? '') ?? fallback?.codigo ?? v.oc ?? v.id}`;
    };
    const ids = new Set<string>();
    for (const r of rows) {
        ids.add(r.id);
        const v = v2.vouchers.get(r.id);
        const detalle = { fuente: source, oc: r.oc ?? null, clave_fuente: r.id };
        if (!v) {
            if (r.oc) out.push(change('vale_almacen', claveOf(r), 'NUEVO', null, label(r), detalle));
            continue;
        }
        for (const campo of VALE_FIELDS)
            if (!same(v[campo], r[campo]))
                out.push({ ...change('vale_almacen', claveOf(r, v.orden), campo, v[campo] ?? '', r[campo] ?? '', detalle), tipo: 'CAMBIO' });
    }
    if (complete)
        for (const [id, v] of v2.vouchers)
            if (!ids.has(id))
                out.push(change('vale_almacen', claveOf({ id, ...v.orden }, v.orden), 'ELIMINADO', label(v), null, { fuente: source, clave_fuente: id }));
    return out;
}
