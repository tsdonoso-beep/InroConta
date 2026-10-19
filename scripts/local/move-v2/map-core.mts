// Old → v2 for the shared pieces: contribuyente (padron_ruc + ruc_domicilio + every RUC that
// appears anywhere), lista_ssco, centro_costo (+ equivalencia_centro_costo), corrida and cambio.

import { uuidFor } from './pool.mts';
import { COMPANY, date, docType, folderId, int, origin, parseOc, text, type Notes, type Row } from './helpers.mts';
import type { OldData } from './source.mts';

/** Every RUC the move touches. Whoever sees one first with a name gives it its name. */
export class Taxpayers {
    private rows = new Map<string, Row>();
    private ssco: Set<string>;
    constructor(ssco: Set<string>) {
        this.ssco = ssco; // no parameter properties: node's type stripping does not support them
    }

    /** A RUC (or DNI, or '0') with what this source knows. Returns the key to use, or null. */
    see(ruc: unknown, name?: unknown, type?: string): string | null {
        const r = text(ruc);
        if (!r) return null;
        let row = this.rows.get(r);
        if (!row) {
            const t = type && (type !== '6' || /^\d{11}$/.test(r)) ? type : docType(r);
            row = blank(r, t, this.ssco.has(r));
            this.rows.set(r, row);
        }
        row.razon_social ??= text(name);
        return r;
    }

    /** The full row from the RUC lookups (padron_ruc), which wins over names seen elsewhere. */
    fill(ruc: string, values: Row) {
        const row = this.rows.get(ruc) ?? blank(ruc, docType(ruc), this.ssco.has(ruc));
        for (const [k, v] of Object.entries(values)) if (v !== null && v !== undefined) row[k] = v;
        this.rows.set(ruc, row);
    }

    all(): Row[] {
        return [...this.rows.values()];
    }
}

function blank(ruc: string, tipo: string, ssco: boolean): Row {
    return {
        ruc,
        tipo_documento: tipo,
        razon_social: null,
        nombre_comercial: null,
        documento: null,
        tipo_contribuyente: null,
        estado: null,
        condicion: null,
        buen_contribuyente: null,
        agente_retencion: null,
        agente_percepcion: null,
        padrones_detalle: null,
        ssco,
        direccion: null,
        ubigeo: null,
        departamento: null,
        provincia: null,
        distrito: null,
        fecha_inscripcion: null,
        fecha_inicio_actividades: null,
        fecha_baja: null,
        sistema_emision: null,
        comercio_exterior: null,
        sistema_contabilidad: null,
        actividades: null,
        comprobantes_impresion: null,
        emision_electronica: null,
        emisor_electronico_desde: null,
        comprobantes_electronicos: null,
        ple_desde: null,
        aviso: null,
        padron_en: null,
        ficha_en: null,
        domicilio_en: null,
    };
}

/** padron_ruc and ruc_domicilio into the registry (before anything else names a RUC). */
export function lookups(old: OldData, people: Taxpayers) {
    for (const p of old.padron_ruc) {
        const ruc = text(p.ruc);
        if (!ruc) continue;
        people.fill(ruc, {
            razon_social: text(p.razon_social),
            nombre_comercial: text(p.nombre_comercial),
            documento: text(p.documento),
            tipo_contribuyente: text(p.tipo_contribuyente),
            estado: text(p.estado),
            condicion: text(p.condicion),
            buen_contribuyente: p.buen_contribuyente,
            agente_retencion: p.agente_retencion,
            agente_percepcion: p.agente_percepcion,
            padrones_detalle: text(p.padrones_detalle),
            direccion: text(p.domicilio_fiscal),
            fecha_inscripcion: date(p.fecha_inscripcion),
            fecha_inicio_actividades: date(p.fecha_inicio_actividades),
            fecha_baja: date(p.fecha_baja),
            sistema_emision: text(p.sistema_emision),
            comercio_exterior: text(p.comercio_exterior),
            sistema_contabilidad: text(p.sistema_contabilidad),
            actividades: p.actividades,
            comprobantes_impresion: p.comprobantes_impresion,
            emision_electronica: p.emision_electronica,
            emisor_electronico_desde: date(p.emisor_electronico_desde),
            comprobantes_electronicos: text(p.comprobantes_electronicos),
            ple_desde: date(p.ple_desde),
            aviso: text(p.aviso),
            padron_en: p.consultado_en,
            ficha_en: p.ficha_consultada_en,
        });
    }
    // The reduced roll's address wins over the one in the RUC card.
    for (const d of old.ruc_domicilio) {
        const ruc = text(d.ruc);
        if (!ruc) continue;
        const ubigeo = text(d.ubigeo);
        people.fill(ruc, {
            razon_social: text(d.razon_social),
            estado: text(d.estado),
            condicion: text(d.condicion),
            direccion: text(d.direccion),
            ubigeo: ubigeo && /^\d{6}$/.test(ubigeo) ? ubigeo : null,
            departamento: text(d.departamento),
            provincia: text(d.provincia),
            distrito: text(d.distrito),
            domicilio_en: d.cargado_en,
        });
    }
}

export function ssco(old: OldData): Row[] {
    return old.ruc_ssco
        .filter((r) => /^\d{11}$/.test(String(r.ruc)))
        .map((r) => ({
            ruc: r.ruc,
            razon_social: text(r.business_name) ?? '',
            domicilio: text(r.tax_address),
            resolucion: text(r.resolution) ?? '',
            resolucion_fecha: date(r.resolution_date),
            firme_desde: date(r.final_date),
            publicado_el: date(r.published_on),
            representante_documento: text(r.representative_document),
            representante_nombre: text(r.representative_name),
            cargado_en: r.loaded_at,
        }));
}

/** Cost centres from every place that names one. The id comes from the normalized code. */
export class CostCentres {
    private rows = new Map<string, Row>();

    /** In CG the admin areas come with code «-»: the code is the name. */
    see(code: unknown, name: unknown, extra: Row = {}): string | null {
        let c = text(code);
        const n = text(name);
        const area = !c || c === '-';
        if (area) c = n;
        if (!c) return null;
        const norm = c.replace(/\s+/g, '').toUpperCase();
        let row = this.rows.get(norm);
        if (!row) {
            row = {
                id: uuidFor('centro_costo', norm),
                empresa_ruc: COMPANY,
                codigo: c,
                nombre: n ?? c,
                es_area: area,
                abreviatura: null,
                concar_codigo: null,
                estado: 'ACTIVO',
            };
            this.rows.set(norm, row);
        }
        for (const [k, v] of Object.entries(extra)) if (v !== null && v !== undefined) row[k] = v;
        return row.id;
    }

    all(notes: Notes): Row[] {
        const concar = new Set<string>();
        for (const r of this.rows.values()) {
            if (!r.concar_codigo) continue;
            if (concar.has(r.concar_codigo)) {
                notes.add('centro_costo: código CONCAR repetido (se deja vacío)');
                r.concar_codigo = null;
            } else concar.add(r.concar_codigo);
        }
        return [...this.rows.values()];
    }
}

export function costCentres(old: OldData, cc: CostCentres) {
    for (const c of old.centros_costo)
        cc.see(c.codigo, c.nombre, { abreviatura: text(c.abreviatura), estado: c.activo === false ? 'CERRADO' : 'ACTIVO', creado_en: c.creado_en });
    for (const e of old.equivalencia_centro_costo) cc.see(e.cc_clave, e.cc_nombre, { concar_codigo: e.estado === 'CONFIRMADO' ? text(e.concar_codigo) : null });
}

/** consultas_sunat and fuente_copia → corrida. `resumen.mudanza` marks where each one came from. */
export function runs(old: OldData): Row[] {
    const sire = old.consultas_sunat.map((c) => {
        const { id, empresa_ruc, periodo, consultado_en, segundos, comprobantes_sunat, consultado_por, ...rest } = c;
        void empresa_ruc;
        void consultado_por;
        const end = consultado_en && segundos != null ? new Date(Date.parse(consultado_en) + segundos * 1000).toISOString() : null;
        return {
            job: 'sire',
            empresa_ruc: COMPANY,
            periodo: int(periodo),
            iniciada_en: consultado_en,
            terminada_en: end,
            resultado: 'OK',
            filas: int(comprobantes_sunat),
            resumen: { ...rest, mudanza: `consultas_sunat:${id}` },
            error: null,
            origen: null,
        };
    });
    const copies = old.fuente_copia.map((f) => ({
        job: 'copia-fuentes',
        empresa_ruc: COMPANY,
        periodo: null,
        iniciada_en: f.inicio ?? f.leido_en,
        terminada_en: f.fin,
        resultado: ['OK', 'PARCIAL', 'ERROR'].find((r) => String(f.resultado ?? '').startsWith(r)) ?? null,
        filas: int(f.filas),
        // The full result text («OK · 0 enlaces nuevos…») does not fit corrida.resultado's check.
        resumen: {
            pestana: f.pestana,
            origen: f.origen,
            inicio: f.inicio,
            fin: f.fin,
            leido_en: f.leido_en,
            resultado: f.resultado,
            mudanza: `fuente_copia:${f.pestana}`,
        },
        error: null,
        origen: null,
    }));
    return [...sire, ...copies];
}

/** The three old change logs → cambio. `sireKey` turns a comprobantes_sunat id into periodo|llave. */
export function changes(old: OldData, sireKey: Map<string, string>, notes: Notes): Row[] {
    const out: Row[] = [];
    for (const c of old.cambios_comprobante_sunat) {
        const clave = sireKey.get(c.comprobante_id);
        if (!clave) {
            notes.add('cambio: cambio del SIRE sin su línea');
            continue;
        }
        out.push({
            entidad: 'registro_compras',
            clave,
            tipo: 'CAMBIO',
            campo: c.campo,
            antes: text(c.antes),
            despues: text(c.despues),
            detalle: { mudanza: `cambios_comprobante_sunat:${c.id}` },
            hecho_por: null,
            corrida_id: null,
            ocurrido_en: c.notado_en,
        });
    }
    for (const c of old.carpeta_cambio)
        out.push({
            entidad: 'carpeta_oc',
            clave: folderId(c.carpeta_url) ?? String(c.oc),
            tipo: c.tipo,
            campo: null,
            antes: null,
            despues: text(c.detalle),
            detalle: { procedencia: origin(c.procedencia), oc: c.oc, enlace: c.enlace, carpeta_url: c.carpeta_url, mudanza: `carpeta_cambio:${c.id}` },
            hecho_por: null,
            corrida_id: null,
            ocurrido_en: c.fecha,
        });
    for (const c of old.fuente_cambio) {
        const tipo = c.antes == null ? 'NUEVO' : c.despues == null ? 'ELIMINADO' : 'CAMBIO';
        // The OC as orden_compra.codigo writes it (0172-2026 national, 172-2026 import): the app
        // counts an OC's changes by «PROCEDENCIA|codigo». A kardex change keeps its voucher in detalle.
        const proc = origin(c.procedencia) ?? 'NACIONAL';
        const oc = parseOc(c.oc);
        const codigo = oc ? `${oc.numero.padStart(proc === 'NACIONAL' ? 4 : 3, '0')}-${oc.anio}` : String(c.oc ?? c.clave);
        out.push({
            entidad: c.fuente === 'ALMACEN' ? 'vale_almacen' : 'orden_compra',
            clave: `${proc}|${codigo}`,
            tipo,
            campo: text(c.campo),
            antes: text(c.antes),
            despues: text(c.despues),
            detalle: { fuente: c.fuente, oc: c.oc, clave_fuente: c.clave, mudanza: `fuente_cambio:${c.id}` },
            hecho_por: null,
            corrida_id: null,
            ocurrido_en: c.fecha,
        });
    }
    return out;
}
