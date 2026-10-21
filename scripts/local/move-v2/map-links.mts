// Old → v2 for Drive and what was derived from it: oc_carpeta + oc_legajo + oc_archivo +
// lectura_archivo → carpeta_oc and archivo; vinculos_oc() → comprobante_oc; facturas_sin_oc() →
// the sin_oc_* columns of comprobante; proyecto_centro_costo → regla_centro_costo; proveedor_sin_oc.

import { COMPANY, docKey, fileId, folderId, int, list, number, origin, serie, text, validRuc, type Notes, type Row } from './helpers.mts';
import type { CostCentres, Taxpayers } from './map-core.mts';
import type { Orders } from './map-orders.mts';
import type { OldData } from './source.mts';

const FOLDER_STATE: Record<string, string> = { OK: 'OK', INCOMPLETA: 'INCOMPLETA', VACÍA: 'VACIA', VACIA: 'VACIA' };
const LEGAJO_STATE: Record<string, string> = { OK: 'COMPLETO', INCOMPLETA: 'FALTA', VACIA: 'VACIA' };
const CC_SEGUN = new Set(['CG', 'CUADRO', 'PROYECTO', 'NOMBRE', 'ADMINISTRATIVO', 'MANUAL']);

/** 'Factura 1 · OC 1 · Guía de remisión 1' → {"Factura": 1, "OC": 1, "Guía de remisión": 1}. */
function documentsOf(v: unknown): Row | null {
    const s = text(v);
    if (!s) return null;
    const out: Row = {};
    for (const part of s.split('·')) {
        const m = part.trim().match(/^(.*\S)\s+(\d+)$/);
        if (m) out[m[1]] = Number(m[2]);
    }
    return Object.keys(out).length ? out : null;
}

export function folders(old: OldData, oc: Orders, cc: CostCentres, notes: Notes) {
    const carpetas = new Map<string, Row>();
    for (const k of old.oc_carpeta) {
        const id = folderId(k.carpeta_url);
        const proc = origin(k.procedencia);
        if (!id || !proc) {
            notes.keep('carpeta_oc: carpeta sin enlace o procedencia', 'oc_carpeta', k);
            continue;
        }
        if (carpetas.has(id)) {
            notes.keep('carpeta_oc: la misma carpeta con dos OC (queda una)', 'oc_carpeta', k);
            continue;
        }
        const o = oc.get(proc, k.oc);
        const estado = FOLDER_STATE[String(k.estado ?? '').toUpperCase()] ?? null;
        carpetas.set(id, {
            drive_id: id,
            orden_compra_id: o?.id ?? null,
            empresa_ruc: COMPANY,
            procedencia: proc,
            nombre: text(k.carpeta_nombre) ?? id,
            visto_carpeta_en: k.cargado_en,
            visto_legajo_en: null,
            tipo: ['OC', 'OS'].includes(k.tipo) ? k.tipo : null,
            proveedor: text(k.proveedor),
            proyecto: text(k.proyecto),
            proyecto_carpeta: text(k.proyecto_carpeta),
            archivos: int(k.archivos) ?? 0,
            documentos: documentsOf(k.documentos),
            le_falta: list(k.le_falta),
            estado,
            calculado_en: k.cargado_en,
            // What the walk counted, and the folder's own cost centre (the OC's is in orden_compra).
            comprobantes: int(k.comprobantes),
            series: text(k.series),
            rucs: text(k.rucs),
            centro_costo_id: cc.see(k.cc_codigo, k.cc_nombre),
            centro_costo_segun: text(k.cc_fuente)?.replace(/\s+/g, '_') ?? null,
        });
        if (!o) continue;
        // What the old script calculated for the OC from its folder (v2: guardar_calculos_oc).
        const ccId = o.centro_costo_segun === 'LEGAJO' ? null : cc.see(k.cc_codigo, k.cc_nombre);
        if (ccId && CC_SEGUN.has(k.cc_fuente)) Object.assign(o, { centro_costo_id: ccId, centro_costo_segun: k.cc_fuente });
        if (estado) Object.assign(o, { legajo_estado: LEGAJO_STATE[estado], le_falta: list(k.le_falta), calculado_en: k.cargado_en });
    }
    // The folders the approvals table links (LEGAJO walk).
    let unnamed = 0;
    for (const l of old.oc_legajo) {
        const id = folderId(l.carpeta_url);
        const proc = origin(l.procedencia);
        if (!id || !proc) continue;
        const c = carpetas.get(id);
        if (c) {
            c.visto_legajo_en = l.cargado_en;
            continue;
        }
        unnamed++;
        carpetas.set(id, {
            drive_id: id,
            orden_compra_id: oc.get(proc, l.oc)?.id ?? null,
            empresa_ruc: COMPANY,
            procedencia: proc,
            nombre: `Legajo ${l.oc}`,
            visto_carpeta_en: null,
            visto_legajo_en: l.cargado_en,
            tipo: null,
            proveedor: text(l.proveedor),
            proyecto: text(l.proyecto),
            proyecto_carpeta: null,
            archivos: 0,
            documentos: null,
            le_falta: null,
            estado: null,
            calculado_en: null,
        });
    }
    if (unnamed) notes.add('carpeta_oc: carpetas del legajo sin nombre (se llaman «Legajo <OC>» hasta la próxima corrida)', unnamed);

    const reads = new Map(old.lectura_archivo.map((r) => [String(r.archivo_id), r]));
    const archivos = new Map<string, Row>();
    for (const a of old.oc_archivo) {
        const id = fileId(a.url);
        if (!id) {
            notes.keep('archivo: sin enlace de Drive', 'oc_archivo', a);
            continue;
        }
        const folder = folderId(a.carpeta_url);
        const row = archivos.get(id) ?? {
            drive_id: id,
            carpeta_id: null,
            nombre: text(a.nombre) ?? id,
            mime: null,
            modificado: a.modificado,
            visto_carpeta_en: null,
            visto_legajo_en: null,
            parece: text(a.parece),
            serie_en_nombre: text(a.serie_en_nombre)?.toUpperCase() ?? null,
            rucs_en_nombre: [],
            visto_captura_en: null,
            origenes: [],
            ...reading(reads.get(id), a),
        };
        // Each walk that saw it, with everything it said (oc_archivo had one row per walk).
        const { empresa_ruc, ...seen } = a;
        void empresa_ruc;
        row.origenes.push(seen);
        if (a.origen === 'CARPETA') row.visto_carpeta_en = a.cargado_en;
        if (a.origen === 'LEGAJO') row.visto_legajo_en = a.cargado_en;
        if (a.origen === 'CAPTURA') row.visto_captura_en = a.cargado_en;
        if (folder && carpetas.has(folder) && (!row.carpeta_id || a.origen === 'CARPETA')) row.carpeta_id = folder;
        archivos.set(id, row);
    }
    for (const r of old.lectura_archivo)
        if (!archivos.has(String(r.archivo_id))) notes.keep('archivo: lectura de un archivo que ningún recorrido vio', 'lectura_archivo', r);
    return { carpeta_oc: [...carpetas.values()], archivo: [...archivos.values()] };
}

/** guardar_lecturas_archivo(): lectura_archivo first, the old columns of oc_archivo if not. */
function reading(r: Row | undefined, a: Row): Row {
    const estado = (v: unknown) => {
        const s = String(v ?? '')
            .toUpperCase()
            .replace('Í', 'I')
            .replace('É', 'E')
            .replace(/ /g, '_');
        return ['LEIDO', 'SIN_COMPROBANTE', 'SIN_TEXTO', 'ERROR'].includes(s) ? s : null;
    };
    if (r) {
        const tipo = String(r.tipo ?? '');
        return {
            lectura_estado: estado(r.estado),
            lectura_metodo: text(r.metodo),
            lectura_modificado: r.modificado,
            leido_tipo: /^\d{2}$/.test(tipo) ? tipo : null,
            leido_serie: text(r.serie)?.toUpperCase() ?? null,
            leido_ruc: validRuc(r.ruc),
            leido_claves: list(r.claves)?.map((c) => c.toUpperCase()) ?? null,
            leido_oc: text(r.oc_referencia),
            lectura_detalle: text(r.detalle),
            leido_en: r.leido_en,
        };
    }
    return {
        lectura_estado: estado(a.estado_lectura),
        lectura_metodo: null,
        lectura_modificado: null,
        leido_tipo: null,
        leido_serie: text(a.serie_leida)?.toUpperCase() ?? null,
        leido_ruc: validRuc(a.ruc_leido),
        leido_claves: null,
        leido_oc: null,
        lectura_detalle: null,
        leido_en: null,
    };
}

const EVIDENCE = (fuente: string) => (/^Lectura/.test(fuente) ? 'LECTURA' : /número sin serie/.test(fuente) ? 'NUMERO' : 'NOMBRE');

/** vinculos_oc() as stored rows. The procedencia comes from the folder the evidence was in. */
export function links(old: OldData, ids: Map<string, string>, oc: Orders, folderRows: Row[], fileIds: Set<string>, notes: Notes): Row[] {
    const folderProc = new Map(folderRows.map((c) => [c.drive_id as string, c.procedencia as 'NACIONAL' | 'IMPORTACION']));
    const out = new Map<string, Row>();
    for (const v of old.vinculos_oc) {
        const comprobante_id = ids.get(docKey(String(v.proveedor_ruc), String(v.tipo_comprobante), v.serie, v.numero));
        const proc = folderProc.get(folderId(v.carpeta_url) ?? '') ?? oc.guess(v.oc, v.proveedor_ruc);
        const o = oc.find(proc, v.oc);
        if (!comprobante_id || !o) {
            notes.keep(`comprobante_oc: vínculo sin ${comprobante_id ? 'su OC' : 'su comprobante'}`, 'vinculos_oc', v);
            continue;
        }
        const archivo = fileId(v.archivo_url);
        out.set(`${comprobante_id}|${o.id}`, {
            comprobante_id,
            orden_compra_id: o.id,
            evidencia: EVIDENCE(String(v.fuente ?? '')),
            archivo_id: archivo && fileIds.has(archivo) ? archivo : null,
            principal: false,
            codigo: String(v.oc),
            alertas: list(v.alertas, /\s*;\s*/),
            calculado_en: new Date().toISOString(),
        });
    }
    // Exactly one principal per comprobante: the first by OC code (as guardar_calculos_oc).
    const first = new Map<string, Row>();
    for (const r of [...out.values()].sort((a, z) => a.codigo.localeCompare(z.codigo))) if (!first.has(r.comprobante_id)) first.set(r.comprobante_id, r);
    for (const r of first.values()) r.principal = true;
    for (const r of out.values()) delete r.codigo;
    return [...out.values()];
}

/** facturas_sin_oc() → the sin_oc_* columns of each comprobante (it does not return the type: 01 first). */
export function withoutOc(old: OldData, docs: Row[], notes: Notes) {
    const byNumber = new Map<string, Row[]>();
    for (const d of docs) {
        const k = `${d.emisor_ruc}|${d.serie}|${d.numero}`;
        byNumber.set(k, [...(byNumber.get(k) ?? []), d]);
    }
    const now = new Date().toISOString();
    for (const f of old.facturas_sin_oc) {
        const found = byNumber.get(`${f.proveedor_ruc}|${serie(f.serie)}|${number(f.numero)}`) ?? [];
        const d = found.find((x) => x.tipo === '01') ?? found[0];
        if (!d) {
            notes.keep('comprobante: factura sin OC que no está', 'facturas_sin_oc', f);
            continue;
        }
        const gasto = text(f.gasto_tipico);
        Object.assign(d, {
            sin_oc_senal: ['ALTA', 'MEDIA'].includes(f.senal) ? f.senal : null,
            sin_oc_razon: text(f.razon) ?? (gasto ? `gasto típico: ${gasto}` : null),
            area_probable: text(f.area_probable),
            oc_calculado_en: now,
        });
    }
}

export function rules(old: OldData, cc: CostCentres, people: Taxpayers, notes: Notes) {
    const regla_centro_costo = old.proyecto_centro_costo.flatMap((p) => {
        const proc = origin(p.procedencia);
        const segun = String(p.fuente ?? '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '_');
        if (!proc || !text(p.proyecto_carpeta) || !['CG', 'NOMBRE', 'ADMINISTRATIVO', 'MANUAL', 'SIN_ASIGNAR'].includes(segun)) {
            notes.keep('regla_centro_costo: sin procedencia, carpeta o fuente conocida', 'proyecto_centro_costo', p);
            return [];
        }
        return [
            {
                empresa_ruc: COMPANY,
                procedencia: proc,
                proyecto_carpeta: p.proyecto_carpeta,
                centro_costo_id: cc.see(p.cc_codigo, p.cc_nombre),
                segun,
                detalle: text(p.detalle),
                revisar: !!p.revisar,
                ocs: int(p.ocs),
                ocs_en_cg: int(p.ocs_en_cg),
                actualizado_en: p.actualizado_en,
            },
        ];
    });
    const proveedor_sin_oc = old.proveedor_sin_oc.flatMap((p) => {
        const ruc = people.see(p.proveedor_ruc);
        return ruc ? [{ empresa_ruc: COMPANY, proveedor_ruc: ruc, motivo: p.motivo, marcado_por: text(p.marcado_por), marcado_en: p.marcado_en }] : [];
    });
    return { regla_centro_costo, proveedor_sin_oc };
}
