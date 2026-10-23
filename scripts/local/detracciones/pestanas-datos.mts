// The rows of the DETRACCIONES and DETRACCIONES SIN CONSTANCIA tabs, built from the v2 tables.
// Before they came from detracciones_hoja() and detracciones_sin_constancia() (old migration 067);
// v2 has no read functions, so the same rules live here (one row per field the tab shows):
//   «factura del SIRE»  the document's latest registro_compras line (purchases only)
//   «factura del XML»   the document with xml_estado OK (it was a row in cpe_comprobante)

import { RUC } from '../comun/config.mts';
import { base } from '../comun/base.mts';
import { allPages } from '../../../src/shared/supabase/paging.ts';

type Row = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any;

const n = (v: unknown) => (v == null || v === '' ? null : Number(v));
const s = (v: unknown) => (v == null || v === '' ? null : String(v));
const fileUrl = (id: unknown) => (id ? `https://drive.google.com/file/d/${id}/view` : null);
const key = (ruc: unknown, tipo: unknown, serie: unknown, numero: unknown) =>
    [ruc ?? '', tipo ?? '', String(serie ?? '').toUpperCase(), String(numero ?? '').replace(/^0+/, '') || '0'].join('|');

function read(table: string, select: string, build: (q: Query) => Query): Promise<Row[]> {
    return allPages<Row>(async (from, size) => {
        const { data, error } = await build(base().from(table).select(select)).range(from, from + size - 1);
        if (error) throw new Error(`${table}: ${error.code ?? ''} ${error.message}`);
        return (data ?? []) as Row[];
    });
}

/** The latest SIRE line of a document (registro_compras is one row per month). */
const latest = (lines: unknown): Row | null =>
    ((lines as Row[] | null) ?? []).reduce<Row | null>((a, l) => (!a || String(l.ultima_vez) > String(a.ultima_vez) ? l : a), null);

/** Months from the period (AAAAMM) to a date, as the SQL counted them. */
function monthsBetween(periodo: string | null, date: string | null): number | null {
    if (!periodo || !/^\d{6}$/.test(periodo) || !date) return null;
    return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - (Number(periodo.slice(0, 4)) * 12 + Number(periodo.slice(4, 6)));
}

/** A timestamp as Lima reads it: DD/MM/YYYY HH24:MI:SS. */
function limaTime(ts: unknown): string | null {
    if (!ts) return null;
    const d = new Date(Date.parse(String(ts)) - 5 * 3600_000).toISOString();
    return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${d.slice(11, 19)}`;
}

/** Text order as Postgres sorts it: nulls last when ascending, first when descending. */
function byText(fields: Array<[string, 'asc' | 'desc']>) {
    return (a: Row, z: Row) => {
        for (const [f, dir] of fields) {
            const x = s(a[f]),
                y = s(z[f]);
            if (x === y) continue;
            if (x === null) return dir === 'asc' ? 1 : -1;
            if (y === null) return dir === 'asc' ? -1 : 1;
            return (x < y ? -1 : 1) * (dir === 'asc' ? 1 : -1);
        }
        return 0;
    };
}

let proofs: Promise<Row[]> | null = null;
/** Every proof of the company, with its document (read once per run: both tabs use it). */
function readProofs(): Promise<Row[]> {
    proofs ??= read(
        'detraccion_constancia',
        '*, emisor:emisor_ruc(razon_social), adquiriente:adquiriente_ruc(razon_social), ' +
            'comprobante:comprobante_id(id, total, moneda, detraccion_monto, detraccion_cuenta, pdf_drive_id, xml_estado, registro_compras(total, detraccion, ultima_vez))',
        (q) => q.eq('empresa_ruc', RUC).order('numero_constancia'),
    ).catch((e) => {
        proofs = null; // the other tab tries again
        throw e;
    });
    return proofs;
}

/**
 * One row per proof (ALL of them), with the «caso» column: the first that fits of
 * Revisar monto, Factura de AAAA, Sin factura, Sin XML, XML no declara detracción,
 * Pago 2+ meses después, Normal (detracciones_hoja()).
 */
export async function detraccionesHoja(desde = '202601'): Promise<Row[]> {
    const rows = (await readProofs()).map((d) => {
        const doc = d.comprobante as Row | null;
        const xml = doc && doc.xml_estado === 'OK' ? doc : null;
        const sire = d.sentido === 'COMPRA' && doc ? latest(doc.registro_compras) : null;
        const periodo = s(d.periodo);
        const months = monthsBetween(periodo, s(d.fecha_pago));
        const invoiceDetraction = n(xml?.detraccion_monto) ?? n(sire?.detraccion);
        const monto = n(d.monto);
        const caso =
            (invoiceDetraction ?? 0) > 0 && monto !== null && Math.abs(monto - invoiceDetraction!) > 1
                ? 'Revisar monto'
                : periodo !== null && periodo < desde
                  ? `Factura de ${periodo.slice(0, 4)}`
                  : !sire && !xml
                    ? 'Sin factura'
                    : !xml
                      ? 'Sin XML'
                      : (n(xml.detraccion_monto) ?? 0) <= 0
                        ? 'XML no declara detracción'
                        : (months ?? 0) >= 2
                          ? 'Pago 2+ meses después'
                          : 'Normal';
        return {
            caso,
            periodo,
            sentido: d.sentido === 'COMPRA' ? 'Compra' : 'Venta',
            fecha_pago: d.fecha_pago,
            meses_hasta_pago: months,
            numero_constancia: d.numero_constancia,
            tipo_comprobante: d.tipo,
            serie: d.serie,
            numero: d.numero_original ?? d.numero,
            proveedor_ruc: d.emisor_ruc,
            proveedor_nombre: d.proveedor_nombre ?? (d.emisor as Row | null)?.razon_social ?? null,
            adquiriente_numero: d.adquiriente_ruc,
            adquiriente_nombre: d.adquiriente_nombre ?? (d.adquiriente as Row | null)?.razon_social ?? null,
            codigo_bien_servicio: d.codigo_bien_servicio,
            monto,
            detraccion_factura: invoiceDetraction,
            factura_en: sire && xml ? 'SIRE y XML' : xml ? 'XML' : sire ? 'SIRE' : 'No encontrada',
            total_factura: n(xml?.total) ?? n(sire?.total),
            // The SIRE writes the currency on the document too.
            moneda: xml || sire ? s(doc?.moneda) : null,
            numero_cuenta: d.numero_cuenta,
            cuenta_xml: xml?.detraccion_cuenta ?? null,
            numero_operacion: d.numero_operacion,
            pdf_constancia: fileUrl(d.pdf_drive_id),
            html_constancia: fileUrl(d.html_drive_id),
            pdf_factura: fileUrl(xml?.pdf_drive_id),
            fecha_hora_pago: limaTime(d.fecha_hora_pago),
        } as Row;
    });
    return rows.sort(
        byText([
            ['periodo', 'desc'],
            ['fecha_pago', 'desc'],
            ['numero_constancia', 'asc'],
        ]),
    );
}

/**
 * Invoices with a detraction (in the XML, or in the SIRE when there is no XML) since `desde`,
 * purchases and sales, that have no proof (detracciones_sin_constancia()).
 */
export async function detraccionesSinConstancia(desde = '202601'): Promise<Row[]> {
    const doc = 'id, origen, emisor_ruc, receptor_ruc, emisor_nombre, receptor_nombre, tipo, serie, numero, fecha_emision, periodo, total, moneda, ';
    const [xmls, sire, all] = await Promise.all([
        read('comprobante', doc + 'detraccion_monto, pdf_drive_id, emisor:emisor_ruc(razon_social), receptor:receptor_ruc(razon_social)', (q) =>
            q.eq('empresa_ruc', RUC).eq('xml_estado', 'OK').gt('detraccion_monto', 0).gte('periodo', desde).order('id'),
        ),
        read(
            'registro_compras',
            'id, periodo, total, detraccion, ultima_vez, proveedor_nombre, ' +
                'comprobante:comprobante_id(id, emisor_ruc, tipo, serie, numero, fecha_emision, moneda, xml_estado, emisor_nombre, emisor:emisor_ruc(razon_social))',
            (q) => q.eq('empresa_ruc', RUC).gt('detraccion', 0).gte('periodo', desde).order('id'),
        ),
        readProofs(),
    ]);
    const withProof = new Set(all.flatMap((d) => [String(d.comprobante_id ?? ''), key(d.emisor_ruc, d.tipo, d.serie, d.numero)]));
    const lacks = (id: unknown, ruc: unknown, tipo: unknown, serie: unknown, numero: unknown) =>
        !withProof.has(String(id)) && !withProof.has(key(ruc, tipo, serie, numero));
    const lima = new Date(Date.now() - 5 * 3600_000).toISOString();
    const age = (date: unknown) => (date ? monthsBetween(`${String(date).slice(0, 4)}${String(date).slice(5, 7)}`, lima) : null);

    const out: Row[] = [];
    for (const c of xmls) {
        if (!lacks(c.id, c.emisor_ruc, c.tipo, c.serie, c.numero)) continue;
        const sale = c.origen === 'EMITIDO';
        out.push({
            sentido: sale ? 'Venta' : 'Compra',
            periodo: s(c.periodo),
            fecha_emision: c.fecha_emision,
            meses_desde_emision: age(c.fecha_emision),
            ruc: sale ? c.receptor_ruc : c.emisor_ruc,
            nombre: sale ? (c.receptor_nombre ?? (c.receptor as Row | null)?.razon_social) : (c.emisor_nombre ?? (c.emisor as Row | null)?.razon_social),
            emisor: c.emisor_ruc,
            tipo_comprobante: c.tipo,
            serie: c.serie,
            numero: c.numero,
            total: n(c.total),
            moneda: c.moneda,
            detraccion: n(c.detraccion_monto),
            detraccion_segun: 'XML',
            pdf_factura: fileUrl(c.pdf_drive_id),
        });
    }
    // The SIRE's, only for documents without XML: their latest qualifying line.
    const lines = new Map<string, Row>();
    for (const l of sire) {
        const c = l.comprobante as Row | null;
        if (!c || c.xml_estado === 'OK') continue;
        const k = String(c.id);
        if (!lines.has(k) || String(l.ultima_vez) > String(lines.get(k)!.ultima_vez)) lines.set(k, l);
    }
    for (const l of lines.values()) {
        const c = l.comprobante as Row;
        if (!lacks(c.id, c.emisor_ruc, c.tipo, c.serie, c.numero)) continue;
        out.push({
            sentido: 'Compra',
            periodo: s(l.periodo),
            fecha_emision: c.fecha_emision,
            meses_desde_emision: age(c.fecha_emision),
            ruc: c.emisor_ruc,
            nombre: l.proveedor_nombre ?? c.emisor_nombre ?? (c.emisor as Row | null)?.razon_social ?? null,
            emisor: c.emisor_ruc,
            tipo_comprobante: c.tipo,
            serie: c.serie,
            numero: c.numero,
            total: n(l.total),
            moneda: c.moneda,
            detraccion: n(l.detraccion),
            detraccion_segun: 'SIRE',
            pdf_factura: null,
        });
    }
    return out.sort(
        byText([
            ['periodo', 'asc'],
            ['fecha_emision', 'asc'],
            ['serie', 'asc'],
            ['numero', 'asc'],
            ['emisor', 'asc'],
            ['tipo_comprobante', 'asc'],
        ]),
    );
}
