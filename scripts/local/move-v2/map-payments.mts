// Old → v2 for what is paid around an invoice: detraccion_constancia (SPOT) and the IGV
// withholdings (retencion_comprobante + retencion_documento). Same rules as guardar_detracciones
// and guardar_retenciones (docs/database/v2/004_escrituras_comprobantes.sql).

import { uuidFor } from './pool.mts';
import { COMPANY, currency, date, docKey, fileId, int, num, number, serie, text, type Notes, type Row } from './helpers.mts';
import type { Taxpayers } from './map-core.mts';
import type { OldData } from './source.mts';

const twoDigits = (v: unknown) => (/^\d{2}$/.test(String(v ?? '')) ? String(v) : null);

/** `ids`: docKey → comprobante id. A constancia whose invoice is not there yet keeps comprobante_id null. */
export function detractions(old: OldData, people: Taxpayers, ids: Map<string, string>, notes: Notes): Row[] {
    return old.detraccion_constancia
        .filter((d) => text(d.numero_constancia) && ['COMPRA', 'VENTA'].includes(d.sentido))
        .map((d) => {
            const emisor = people.see(d.proveedor_ruc, d.proveedor_nombre);
            const tipoDoc = String(d.adquiriente_tipo_doc ?? '').replace(/^0(?=\d)/, '');
            const adq = people.see(d.adquiriente_numero, d.adquiriente_nombre, /^[014679A]$/.test(tipoDoc) ? tipoDoc : undefined);
            const tipo = twoDigits(d.tipo_comprobante),
                s = text(d.serie) ? serie(d.serie) : null,
                n = number(d.numero) || null;
            // In a COMPRA the supplier issues the invoice; in a VENTA, us.
            const comprobante_id = tipo && s && n ? (ids.get(docKey(emisor ?? COMPANY, tipo, s, n)) ?? null) : null;
            if (!comprobante_id) notes.add('detraccion_constancia: su factura aún no está (comprobante_id vacío)');
            return {
                numero_constancia: text(d.numero_constancia),
                empresa_ruc: COMPANY,
                sentido: d.sentido,
                comprobante_id,
                emisor_ruc: emisor,
                tipo,
                serie: s,
                numero: n,
                adquiriente_ruc: adq,
                tipo_cuenta: text(d.tipo_cuenta),
                numero_cuenta: text(d.numero_cuenta),
                fecha_pago: date(d.fecha_pago),
                fecha_hora_pago: d.fecha_hora_pago,
                periodo: int(d.periodo),
                tipo_operacion: text(d.tipo_operacion),
                codigo_bien_servicio: text(d.codigo_bien_servicio),
                monto: num(d.monto),
                numero_operacion: text(d.numero_operacion),
                numero_pago_detracciones: text(d.numero_pago_detracciones),
                origen: text(d.origen),
                usuario_sol: text(d.usuario_sol),
                tipo_consulta: text(d.tipo_consulta),
                pdf_drive_id: fileId(d.pdf_drive_url),
                html_drive_id: fileId(d.html_drive_url),
                primera_vez: d.primera_vez,
                ultima_vez: d.ultima_vez,
            };
        });
}

export function withholdings(old: OldData, people: Taxpayers, ids: Map<string, string>, notes: Notes) {
    const cre = new Map<string, Row>();
    for (const r of old.retencion_comprobante) {
        if (!['COMPRA', 'VENTA'].includes(r.sentido) || !['EMITIDO', 'REVERTIDO'].includes(r.estado) || int(r.numero) === null) {
            notes.add('retencion_comprobante: sin sentido, estado o número');
            continue;
        }
        const emisor = people.see(r.emisor_ruc)!;
        const k = `${emisor}|${serie(r.serie)}|${int(r.numero)}`;
        cre.set(k, {
            id: uuidFor('retencion_comprobante', k),
            empresa_ruc: COMPANY,
            sentido: r.sentido,
            emisor_ruc: emisor,
            receptor_ruc: people.see(r.receptor_ruc, r.receptor_nombre),
            serie: serie(r.serie),
            numero: int(r.numero),
            fecha_emision: date(r.fecha_emision),
            periodo: int(r.periodo),
            regimen: text(r.regimen),
            monto_base: num(r.monto_base),
            monto_retenido: num(r.monto_retenido),
            monto_pagado: num(r.monto_pagado),
            estado: r.estado,
            fecha_reversion: date(r.fecha_reversion),
            motivo_reversion: text(r.motivo_reversion),
            ticket: text(r.ticket),
            pdf_drive_id: fileId(r.pdf_drive_url),
            xml_drive_id: fileId(r.xml_drive_url),
            primera_vez: r.primera_vez,
            ultima_vez: r.ultima_vez,
        });
    }
    const docs = new Map<string, Row>();
    for (const d of old.retencion_documento) {
        const c = cre.get(`${text(d.emisor_ruc)}|${serie(d.cre_serie)}|${int(d.cre_numero)}`);
        const tipo = twoDigits(d.tipo_comprobante);
        if (!c || !tipo || !text(d.serie) || !text(d.numero)) {
            notes.add('retencion_documento: sin su CRE o sin tipo/serie/número');
            continue;
        }
        const pago = text(d.numero_pago) ?? '1';
        // The invoice is the supplier's: in a COMPRA, the CRE's receiver; in a VENTA, us.
        const emisor = c.sentido === 'COMPRA' ? c.receptor_ruc : COMPANY;
        const comprobante_id = ids.get(docKey(emisor ?? '', tipo, d.serie, d.numero)) ?? null;
        if (!comprobante_id) notes.add('retencion_documento: su factura aún no está (comprobante_id vacío)');
        docs.set(`${c.id}|${tipo}|${serie(d.serie)}|${number(d.numero)}|${pago}`, {
            retencion_id: c.id,
            tipo,
            serie: serie(d.serie),
            numero: number(d.numero),
            numero_pago: pago,
            comprobante_id,
            fecha_pago: date(d.fecha_pago),
            monto_pago: num(d.monto_pago),
            moneda_pago: currency(d.moneda_pago),
            monto_retenido: num(d.monto_retenido),
            fecha_retencion: date(d.fecha_retencion),
            monto_pagado: num(d.monto_pagado),
            tipo_cambio: num(d.tipo_cambio),
        });
    }
    return { retencion_comprobante: [...cre.values()], retencion_documento: [...docs.values()] };
}
