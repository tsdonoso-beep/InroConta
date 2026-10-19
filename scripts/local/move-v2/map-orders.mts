// Old → v2 for purchase orders: fuente_compra_oc (COMPRAS), oc_legajo (LEGAJO), fuente_comex_oc
// (COMEX) and oc_base_cg (CG) → one orden_compra per OC, with the same source preference as
// guardar_fuente_oc (docs/database/v2/005_escrituras_oc.sql); plus orden_compra_centro_costo,
// orden_compra_dua and vale_almacen.

import { uuidFor } from './pool.mts';
import { COMPANY, currency, date, int, list, num, origin, parseOc, text, validRuc, type Notes, type Row } from './helpers.mts';
import type { CostCentres, Taxpayers } from './map-core.mts';
import type { OldData } from './source.mts';

type Proc = 'NACIONAL' | 'IMPORTACION';
const DATA_RANK: Record<string, number> = { COMPRAS: 4, LEGAJO: 3, COMEX: 2, CG: 1 };
const BUYER_RANK: Record<string, number> = { LEGAJO: 3, COMEX: 2, COMPRAS: 1 };
const OWN_COMPANY = /^(INDUSTRIAS ROLAND PRINT S\.?A\.?C\.?|INROPRIN)$/i;

export class Orders {
    rows = new Map<string, Row>();

    /** The OC of (procedencia, '0172-2026'), created if new. Null if the code has another shape. */
    get(proc: Proc | null, code: unknown): Row | null {
        const oc = parseOc(code);
        if (!proc || !oc) return null;
        const key = `${proc}|${oc.numero}|${oc.anio}`;
        let row = this.rows.get(key);
        if (!row) {
            row = { id: uuidFor('orden_compra', key), empresa_ruc: COMPANY, procedencia: proc, numero: oc.numero, anio: oc.anio };
            this.rows.set(key, row);
        }
        return row;
    }

    /** Only if it already exists (kardex, links: like v2, they never create an OC). */
    find(proc: Proc | null, code: unknown): Row | null {
        const oc = parseOc(code);
        return proc && oc ? (this.rows.get(`${proc}|${oc.numero}|${oc.anio}`) ?? null) : null;
    }

    /**
     * CG and the links do not say the procedencia (the old SQL padded imports to 4 digits too).
     * 3 digits is an import. A 4-digit code is NACIONAL, as the old base treated CG, unless the
     * supplier's RUC is the import's and not the national's: the 2025 national OCs are only in
     * CG, and 684 kardex vouchers marked «Nacional» point to them (dry run, 19/10/2026).
     */
    guess(code: unknown, ruc?: string | null): Proc {
        const oc = parseOc(code);
        if (/^\s*\d{3}-/.test(String(code))) return 'IMPORTACION';
        if (!oc || !ruc) return 'NACIONAL';
        const nac = this.rows.get(`NACIONAL|${oc.numero}|${oc.anio}`);
        const imp = this.rows.get(`IMPORTACION|${oc.numero}|${oc.anio}`);
        return imp?.proveedor_ruc === ruc && nac?.proveedor_ruc !== ruc ? 'IMPORTACION' : 'NACIONAL';
    }
}

/** Sets the resolved data (supplier, date, amount) if `source` ranks at least as high as what is there. */
function data(o: Row, source: string, v: Row) {
    if ((DATA_RANK[source] ?? 0) < (DATA_RANK[o.datos_segun] ?? 0)) return;
    Object.assign(o, v, { datos_segun: source });
}

function buyer(o: Row, source: string, who: string | null) {
    if (!who || (BUYER_RANK[source] ?? 0) < (BUYER_RANK[o.comprador_segun] ?? 0)) return;
    o.comprador = who;
    o.comprador_segun = source;
}

const skipped = (notes: Notes, what: string) => notes.add(`orden_compra: código de OC con otra forma en ${what}`);

/** The three sources that say their procedencia: Compras, the approvals table and COMEX. */
export function orders(old: OldData, oc: Orders, people: Taxpayers, cc: CostCentres, notes: Notes) {
    const skip = (what: string) => skipped(notes, what);
    for (const f of old.fuente_compra_oc) {
        const o = oc.get(origin(f.procedencia), f.oc);
        if (!o) {
            skip('Compras');
            continue;
        }
        const ruc = validRuc(f.proveedor_ruc);
        people.see(ruc, f.proveedor);
        const empresa = text(f.empresa);
        Object.assign(o, {
            tipo: /SERVICIO/i.test(f.tipo_documento ?? '') ? 'OS' : 'OC',
            consorcio: empresa && !OWN_COMPANY.test(empresa) ? empresa : null,
            requerimiento: text(f.requerimiento),
            solicitado: text(f.solicitado),
            elaborado: text(f.elaborado),
            proyecto: text(f.proyecto),
            concepto: text(f.concepto),
            forma_pago: o.forma_pago ?? text(f.forma_pago),
            condicion_pago: text(f.condicion_pago),
            incoterm: text(f.incoterm),
            lugar_entrega: text(f.lugar_entrega),
            tiempo_entrega: text(f.tiempo_entrega),
            items: int(f.items),
            compras_en: f.cargado_en,
        });
        buyer(o, 'COMPRAS', text(f.elaborado));
        data(o, 'COMPRAS', {
            proveedor_ruc: ruc,
            proveedor_nombre: text(f.proveedor),
            fecha_oc: date(f.fecha),
            moneda: currency(f.moneda),
            monto: num(f.total),
            monto_pen: num(f.total_soles),
        });
    }

    // The approvals table can list one OC in several folders: the most recently reviewed wins.
    const legajo = [...old.oc_legajo].sort((a, z) => String(a.revisado_en ?? a.cargado_en).localeCompare(String(z.revisado_en ?? z.cargado_en)));
    for (const l of legajo) {
        const o = oc.get(origin(l.procedencia), l.oc);
        if (!o) {
            skip('el legajo');
            continue;
        }
        const ruc = validRuc(l.proveedor_ruc);
        people.see(ruc, l.proveedor);
        Object.assign(o, {
            area: text(l.area) ?? o.area ?? null,
            situacion_pago: text(l.situacion_pago),
            estatus: text(l.estatus),
            estado_aprobacion: text(l.estado_aprobacion),
            forma_pago: text(l.forma_pago) ?? o.forma_pago ?? null,
            legajo_revision: text(l.estado_revision),
            legajo_le_falta: list(l.le_falta),
            legajo_en: l.cargado_en,
        });
        const ccId = cc.see(l.cc_codigo, l.cc_nombre);
        if (ccId) Object.assign(o, { centro_costo_id: ccId, centro_costo_segun: 'LEGAJO' });
        buyer(o, 'LEGAJO', text(l.comprador));
        data(o, 'LEGAJO', { proveedor_ruc: ruc, proveedor_nombre: text(l.proveedor), fecha_oc: date(l.fecha_oc), monto_pen: num(l.monto_soles) });
    }

    const duas = new Map<string, Row>();
    for (const c of old.fuente_comex_oc) {
        const o = oc.get('IMPORTACION', c.oc);
        if (!o) {
            skip('COMEX');
            continue;
        }
        const empresa = text(c.empresa);
        Object.assign(o, {
            consorcio: o.consorcio ?? (empresa && !OWN_COMPANY.test(empresa) ? empresa : null),
            comex_estado: text(c.estado_compra),
            comex_origen: text(c.origen),
            incoterm: o.incoterm ?? text(c.incoterm),
            modalidad: text(c.modalidad),
            operador: text(c.operador),
            awb_bl: text(c.awb_bl),
            etd: date(c.etd),
            eta: date(c.eta),
            ata: date(c.ata),
            llegada_planta_prevista: date(c.fecha_aprox_planta),
            llegada_planta: date(c.fecha_real_planta),
            agente_aduanas: text(c.agente_aduanas),
            documentos_enviados: text(c.documentos_enviados),
            dam: text(c.dam),
            costeo: text(c.costeo),
            embarques: int(c.embarques),
            comex_observaciones: text(c.observaciones),
            comex_en: c.cargado_en,
        });
        buyer(o, 'COMEX', text(c.comprador));
        data(o, 'COMEX', { proveedor_nombre: text(c.proveedor), fecha_oc: date(c.fecha_oc) });
        for (const d of Array.isArray(c.duas) ? c.duas : []) {
            if (!text(d.dua)) continue;
            const yes = String(d.subio_oc ?? '')
                .trim()
                .toUpperCase();
            duas.set(`${o.id}|${d.dua}`, {
                orden_compra_id: o.id,
                dua: text(d.dua),
                fecha: date(d.fecha),
                encargado: text(d.encargado),
                subio_oc: yes === 'SI' || yes === 'SÍ' ? true : yes === 'NO' ? false : null,
                fecha_subida: date(d.fecha_subida),
                observacion: text(d.observacion),
            });
        }
    }
    return { orden_compra_dua: [...duas.values()] };
}

/**
 * CG (base de Control de Gestión): one row per OC × cost centre, grouped; the principal is the
 * one with most lines. It runs after the folders, so guessing its procedencia sees every OC.
 */
export function controlBase(old: OldData, oc: Orders, people: Taxpayers, cc: CostCentres, notes: Notes) {
    const groups = new Map<string, { o: Row; cc: string; monto: number | null; lineas: number }>();
    for (const g of old.oc_base_cg) {
        const ruc = validRuc(g.proveedor_ruc);
        const o = oc.get(oc.guess(g.oc, ruc), g.oc);
        const ccId = cc.see(g.cc_codigo, g.cc_nombre);
        if (!o || !ccId) {
            skipped(notes, 'la base de CG');
            continue;
        }
        people.see(ruc);
        const k = `${o.id}|${ccId}`;
        const cur = groups.get(k) ?? { o, cc: ccId, monto: null, lineas: 0 };
        if (num(g.monto) !== null) cur.monto = (cur.monto ?? 0) + num(g.monto)!;
        cur.lineas += int(g.lineas) ?? 1;
        groups.set(k, cur);
        o.proveedor_ruc ??= ruc;
        o.fecha_oc ??= date(g.fecha_oc);
        o.moneda ??= currency(g.moneda);
        o.datos_segun ??= 'CG';
        o.cg_en = new Date().toISOString(); // oc_base_cg has no load time of its own
    }
    const byOc = new Map<Row, Row[]>();
    for (const g of groups.values()) {
        const r = {
            orden_compra_id: g.o.id,
            centro_costo_id: g.cc,
            monto: g.monto === null ? null : Math.round(g.monto * 100) / 100,
            lineas: g.lineas,
            principal: false,
        };
        byOc.set(g.o, [...(byOc.get(g.o) ?? []), r]);
    }
    for (const [o, rs] of byOc) {
        rs.sort((a, z) => z.lineas - a.lineas || (z.monto ?? -Infinity) - (a.monto ?? -Infinity));
        rs[0].principal = true;
        o.centros_costo_n = rs.length;
        // Without the approvals table or the folder, the cost centre is CG's principal one.
        if (!o.centro_costo_id) Object.assign(o, { centro_costo_id: rs[0].centro_costo_id, centro_costo_segun: 'CG' });
    }
    return { orden_compra_centro_costo: [...byOc.values()].flat() };
}

export function warehouse(old: OldData, oc: Orders, notes: Notes): Row[] {
    return old.kardex_vale
        .filter((v) => text(v.id))
        .map((v) => {
            const o = oc.find(origin(v.procedencia), v.oc);
            if (!o && text(v.oc)) notes.add('vale_almacen: su OC no está en ninguna fuente (orden_compra_id vacío)');
            return {
                id: v.id,
                empresa_ruc: COMPANY,
                orden_compra_id: o?.id ?? null,
                vale: text(v.vale),
                fecha_registro: date(v.fecha_registro),
                fecha_operacion: date(v.fecha_operacion),
                movimiento: text(v.movimiento),
                operacion: text(v.operacion),
                proveedor: text(v.proveedor),
                tipo_documento: text(v.tipo_documento),
                numero_documento: text(v.numero_documento),
                tipo_orden: text(v.tipo_orden),
                numero_orden: text(v.numero_orden),
                proyecto: text(v.proyecto),
                sede: text(v.sede),
                responsable: text(v.responsable),
                recepcionado: text(v.recepcionado),
                documento_ruta: text(v.documento_ruta),
                documento_url: text(v.documento_url),
                vale_url: text(v.vale_url),
                items: int(v.items),
                cantidad: num(v.cantidad),
                visto_desde: v.visto_desde,
                cargado_en: v.cargado_en,
            };
        });
}
