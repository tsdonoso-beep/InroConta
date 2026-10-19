// Old → v2 for the documents: cpe_comprobante (XML) + comprobantes_sunat (SIRE) → comprobante and
// registro_compras; cpe_item, cpe_cuota. Same rules as guardar_comprobantes_sunat and guardar_cpe
// (docs/database/v2/004_escrituras_comprobantes.sql). Detractions and withholdings: map-payments.mts.

import { uuidFor } from './pool.mts';
import { COMPANY, currency, date, docKey, fileId, int, num, number, serie, text, type Notes, type Row } from './helpers.mts';
import type { Taxpayers } from './map-core.mts';
import type { OldData } from './source.mts';

export type Documents = {
    comprobante: Row[];
    registro_compras: Row[];
    comprobante_item: Row[];
    comprobante_cuota: Row[];
    /** docKey → id, for whoever links to a comprobante later. */
    ids: Map<string, string>;
    /** comprobantes_sunat.id → 'periodo|llave' (for the old SIRE change log). */
    sireKey: Map<string, string>;
};

const twoDigits = (v: unknown) => (/^\d{2}$/.test(String(v ?? '')) ? String(v) : null);

export function documents(old: OldData, people: Taxpayers, notes: Notes): Documents {
    const docs = new Map<string, Row>();
    const byOldId = new Map<string, string>(); // cpe_comprobante.id → docKey

    // 1. The XML (guardar_cpe): what the document says.
    for (const c of old.cpe_comprobante) {
        const tipo = twoDigits(c.tipo_comprobante);
        if (!tipo || !text(c.serie) || !text(c.numero) || !['RECIBIDO', 'EMITIDO'].includes(c.origen)) {
            notes.add('comprobante: XML sin tipo, serie, número u origen');
            continue;
        }
        const emisor = people.see(c.proveedor_ruc ?? '0', c.proveedor_nombre)!;
        const rec = text(c.adquiriente_ruc) === '-' ? null : people.see(c.adquiriente_ruc, c.adquiriente_nombre);
        const key = docKey(emisor, tipo, c.serie, c.numero);
        byOldId.set(c.id, key);
        if (docs.has(key)) {
            notes.add('comprobante: XML repetido (queda uno)');
            continue;
        }
        const xml = fileId(c.xml_drive_url);
        const pdf = fileId(c.pdf_drive_url);
        docs.set(key, {
            id: uuidFor('comprobante', key),
            empresa_ruc: COMPANY,
            origen: c.origen,
            emisor_ruc: emisor,
            receptor_ruc: rec,
            tipo,
            serie: serie(c.serie),
            numero: number(c.numero),
            fecha_emision: date(c.fecha_emision),
            moneda: currency(c.moneda),
            subtotal: num(c.subtotal),
            igv: num(c.igv),
            total: num(c.total),
            anticipo_aplicado: num(c.anticipo_aplicado),
            tipo_cambio: null,
            forma_pago: text(c.forma_pago),
            guia_remision: text(c.guia_remision),
            orden_compra_xml: text(c.orden_compra),
            detraccion_codigo: text(c.detraccion_codigo_bien_servicio),
            detraccion_porcentaje: num(c.detraccion_porcentaje),
            detraccion_monto: num(c.detraccion_monto),
            detraccion_cuenta: text(c.detraccion_cuenta_banco),
            // The anticipo the XML discounts (AdditionalDocumentReference), not the note's target:
            // that one comes from the SIRE below (v2 010_documento_relacionado.sql).
            documento_relacionado: text(c.documento_relacionado),
            documento_relacionado_tipo: text(c.tipo_documento_relacionado),
            tipo_nota: null,
            modifica_tipo: null,
            modifica_serie: null,
            modifica_numero: null,
            modifica_fecha: null,
            xml_estado: 'OK',
            xml_drive_id: xml,
            pdf_drive_id: pdf,
            xml_en: c.importado_en,
            pdf_en: pdf ? (c.actualizado_en ?? c.importado_en) : null,
            creado_en: c.importado_en,
            actualizado_en: c.actualizado_en ?? c.importado_en,
        });
    }

    // 2. The SIRE lines (guardar_comprobantes_sunat): the comprobante if the XML did not bring it,
    //    and one registro_compras row per month.
    const lines = new Map<string, Row>();
    const sireKey = new Map<string, string>();
    for (const s of [...old.comprobantes_sunat].sort((a, z) => String(a.ultima_vez).localeCompare(String(z.ultima_vez)))) {
        const tipo = twoDigits(s.tipo_comprobante);
        if (!tipo || !text(s.serie) || !text(s.numero)) {
            notes.add('registro_compras: línea sin tipo, serie o número');
            continue;
        }
        const ruc = text(s.proveedor_ruc) ?? '0';
        const emisor = people.see(ruc, s.proveedor_nombre, tipo >= '50' && tipo <= '54' && !/^\d{11}$/.test(ruc) ? '0' : undefined)!;
        const key = docKey(emisor, tipo, s.serie, s.numero);
        let doc = docs.get(key);
        if (!doc) {
            doc = {
                id: uuidFor('comprobante', key),
                empresa_ruc: COMPANY,
                origen: 'RECIBIDO',
                emisor_ruc: emisor,
                receptor_ruc: COMPANY,
                tipo,
                serie: serie(s.serie),
                numero: number(s.numero),
                fecha_emision: null,
                moneda: null,
                subtotal: null,
                igv: null,
                total: null,
                anticipo_aplicado: null,
                tipo_cambio: null,
                forma_pago: null,
                guia_remision: null,
                orden_compra_xml: null,
                detraccion_codigo: null,
                detraccion_porcentaje: null,
                detraccion_monto: null,
                detraccion_cuenta: null,
                tipo_nota: null,
                modifica_tipo: null,
                modifica_serie: null,
                modifica_numero: null,
                modifica_fecha: null,
                xml_estado: ['01', '03', '07', '08'].includes(tipo) && emisor !== '0' ? 'PENDIENTE' : 'NO_APLICA',
                xml_drive_id: null,
                pdf_drive_id: null,
                xml_en: null,
                pdf_en: null,
                creado_en: s.primera_vez,
                actualizado_en: s.ultima_vez,
            };
            docs.set(key, doc);
        }
        // What the XML already set is not overwritten (coalesce(k.x, excluded.x)).
        doc.fecha_emision ??= date(s.fecha_emision);
        doc.moneda ??= currency(s.moneda);
        doc.tipo_cambio ??= num(s.tipo_cambio);
        doc.tipo_nota ??= text(s.tipo_nota);
        doc.modifica_tipo ??= twoDigits(s.modifica_tipo);
        doc.modifica_serie ??= text(s.modifica_serie) ? serie(s.modifica_serie) : null;
        doc.modifica_numero ??= text(s.modifica_numero) ? number(s.modifica_numero) || null : null;
        doc.modifica_fecha ??= date(s.modifica_fecha);
        if (s.primera_vez && (!doc.creado_en || s.primera_vez < doc.creado_en)) doc.creado_en = s.primera_vez;

        const periodo = int(s.periodo)!;
        const llave = text(s.car_sunat) ?? `${emisor}|${tipo}|${serie(s.serie)}|${number(s.numero)}`;
        sireKey.set(s.id, `${periodo}|${llave}`);
        if (lines.has(`${periodo}|${llave}`)) notes.add('registro_compras: línea repetida en el mes (queda la última)');
        lines.set(`${periodo}|${llave}`, {
            id: uuidFor('registro_compras', `${periodo}|${llave}`),
            empresa_ruc: COMPANY,
            periodo,
            llave,
            car_sunat: text(s.car_sunat),
            comprobante_id: doc.id,
            estado: text(s.estado),
            total: num(s.total),
            tipo_cambio: num(s.tipo_cambio),
            base_dg: num(s.base_dg),
            igv_dg: num(s.igv_dg),
            base_dgng: num(s.base_dgng),
            igv_dgng: num(s.igv_dgng),
            base_dng: num(s.base_dng),
            igv_dng: num(s.igv_dng),
            detraccion: num(s.detraccion),
            primera_vez: s.primera_vez,
            ultima_vez: s.ultima_vez,
        });
    }

    exchangeRates(docs, old, notes);

    const ids = new Map([...docs].map(([k, d]) => [k, d.id as string]));
    const idOfOld = (oldId: string) => ids.get(byOldId.get(oldId) ?? '');

    // 3. Items and instalments, one per (comprobante, line).
    const item = new Map<string, Row>();
    for (const i of old.cpe_item) {
        const id = idOfOld(i.comprobante_id);
        const linea = int(i.linea);
        if (!id || linea === null) {
            notes.add('comprobante_item: sin comprobante o sin línea');
            continue;
        }
        if (item.has(`${id}|${linea}`)) {
            notes.add('comprobante_item: línea repetida (queda una)');
            continue;
        }
        item.set(`${id}|${linea}`, {
            comprobante_id: id,
            linea,
            descripcion: text(i.descripcion),
            cantidad: num(i.cantidad),
            unidad: text(i.unidad),
            precio_unitario: num(i.precio_unitario),
            importe: num(i.importe),
        });
    }
    const cuota = new Map<string, Row>();
    for (const q of old.cpe_cuota) {
        const id = idOfOld(q.comprobante_id);
        const n = int(q.numero);
        if (!id || n === null) {
            notes.add('comprobante_cuota: sin comprobante o sin número');
            continue;
        }
        cuota.set(`${id}|${n}`, { comprobante_id: id, numero: n, monto: num(q.monto), fecha_vencimiento: date(q.fecha_vencimiento) });
    }

    return {
        comprobante: [...docs.values()],
        registro_compras: [...lines.values()],
        comprobante_item: [...item.values()],
        comprobante_cuota: [...cuota.values()],
        ids,
        sireKey,
    };
}

/**
 * The exchange rate for documents in another currency that have none (the XML does not bring
 * it), as cuadre_ventas_json found it on every read: the most common rate (> 1) the SIRE declared
 * for that currency on the latest day up to the document's date. Without one, *_pen stays null.
 */
function exchangeRates(docs: Map<string, Row>, old: OldData, notes: Notes) {
    const seen = new Map<string, Map<string, Map<number, number>>>(); // currency → day → rate → times
    for (const s of old.comprobantes_sunat) {
        const tc = num(s.tipo_cambio),
            m = currency(s.moneda),
            d = date(s.fecha_emision);
        if (!tc || tc <= 1 || !m || m === 'PEN' || !d) continue;
        const days = seen.get(m) ?? new Map<string, Map<number, number>>();
        const counts = days.get(d) ?? new Map<number, number>();
        counts.set(tc, (counts.get(tc) ?? 0) + 1);
        days.set(d, counts);
        seen.set(m, days);
    }
    // mode(): the most frequent; on a tie, the lowest (its order by).
    const mode = (counts: Map<number, number>) => [...counts].sort((a, z) => z[1] - a[1] || a[0] - z[0])[0][0];
    const byCurrency = new Map([...seen].map(([m, days]) => [m, [...days].map(([d, c]) => [d, mode(c)] as const).sort((a, z) => a[0].localeCompare(z[0]))]));
    for (const d of docs.values()) {
        if (d.tipo_cambio || !d.moneda || d.moneda === 'PEN') continue;
        const day = (byCurrency.get(d.moneda) ?? []).filter(([x]) => d.fecha_emision && x <= d.fecha_emision).at(-1);
        if (!day) {
            notes.add('comprobante: en moneda extranjera sin tipo de cambio');
            continue;
        }
        d.tipo_cambio = day[1];
        notes.add('comprobante: tipo de cambio tomado del SIRE (último día hasta su fecha)');
    }
}
