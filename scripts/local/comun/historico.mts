// What sunat-diario.mts reads from and writes to the v2 base besides guardar_comprobantes_sunat:
// the run log (corrida, job 'sire') and the COMPROBANTES SUNAT tab's data. Before these were the
// old base's registrar_consulta_sunat(), periodos_/historico_comprobantes_sunat() and the tables
// gastos (viáticos) and padron_ruc; v2 has no read functions, so the same rows are built here.

import type { SupabaseClient } from '@supabase/supabase-js';
import { allPages } from '../../../src/shared/supabase/paging.ts';
import { detailLinesFromV2 } from '../../../src/shared/lib/export/detail-v2.ts';
import type { ComprobanteHistorico } from '../../../src/shared/lib/export/comprobantes-sunat.ts';

type Row = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any;

const n = (v: unknown) => (v == null || v === '' ? null : Number(v));
const s = (v: unknown) => (v == null || v === '' ? null : String(v));

function reader(sb: SupabaseClient) {
    return (table: string, select: string, build: (q: Query) => Query) =>
        allPages<Row>(async (from, size) => {
            const { data, error } = await build(sb.from(table).select(select)).range(from, from + size - 1);
            if (error) throw new Error(`${table}: ${error.code ?? ''} ${error.message}`);
            return (data ?? []) as Row[];
        });
}

/** The key the old sheet matched documents by: RUC, type, series in upper case, number without leading zeros. */
export const docKey = (ruc: unknown, tipo: unknown, serie: unknown, numero: unknown) =>
    [ruc ?? '', tipo ?? '', String(serie ?? '').toUpperCase(), String(numero ?? '').replace(/^0+/, '')].join('|');

/** One SIRE run in `corrida` (what registrar_consulta_sunat() saved in consultas_sunat), with the same fields in `resumen`. */
export async function registerSireRun(
    sb: SupabaseClient,
    run: { empresaRuc: string; periodo: string; ticket: string; archivo: string; filas: number; startedAt: Date; resumen: Row },
): Promise<string | null> {
    const actions = process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : null;
    const { error } = await sb.from('corrida').insert({
        job: 'sire',
        empresa_ruc: run.empresaRuc,
        periodo: Number(run.periodo),
        iniciada_en: run.startedAt.toISOString(),
        terminada_en: new Date().toISOString(),
        resultado: 'OK',
        filas: run.filas,
        resumen: { ticket: run.ticket, archivo: run.archivo, ...run.resumen },
        origen: actions ?? 'laptop',
    });
    return error ? `${error.code ?? ''} ${error.message}` : null;
}

// The OC columns come from the same rows the DETALLE tab reads (detail-v2-read.ts) and the same builder.
const LINKS = 'comprobante_id,orden_compra_id,archivo:archivo_id(drive_id,nombre,carpeta_id)';
const ORDERS =
    'id,codigo,procedencia,situacion_pago,comprador,comprador_segun,area,legajo_en,legajo_revision,legajo_le_falta,centro_costo_segun,' +
    'centro_costo:centro_costo_id(codigo,nombre,es_area,concar_codigo)';
const FOLDERS = 'drive_id,orden_compra_id,proyecto_carpeta,documentos,le_falta,estado,visto_carpeta_en';
const LINE =
    'id,periodo,car_sunat,estado,total,tipo_cambio,base_dg,igv_dg,base_dgng,igv_dgng,base_dng,igv_dng,detraccion,primera_vez,ultima_vez,llave,proveedor_nombre,' +
    'comprobante:comprobante_id(id,emisor_ruc,tipo,serie,numero,fecha_emision,moneda,tipo_nota,modifica_tipo,modifica_serie,modifica_numero,emisor_nombre,emisor:emisor_ruc(razon_social))';

/**
 * Every line of the Registro de Compras of the company (one per month and document), as
 * historico_comprobantes_sunat() gave them: what the SIRE declared that month, the document's
 * data, how many times it changed, and what the OCs tied to it say (without «alertasOc», which
 * v2 does not keep). Ordered by issue date and number.
 */
export async function readHistory(sb: SupabaseClient, empresaRuc: string): Promise<ComprobanteHistorico[]> {
    const read = reader(sb);
    const [lines, changes, links, orders, folders] = await Promise.all([
        read('registro_compras', LINE, (q) => q.eq('empresa_ruc', empresaRuc).order('id')),
        read('cambio', 'id,clave', (q) => q.eq('entidad', 'registro_compras').order('id')),
        read('comprobante_oc', LINKS, (q) => q.order('comprobante_id').order('orden_compra_id')),
        read('orden_compra', ORDERS, (q) => q.eq('empresa_ruc', empresaRuc).order('id')),
        read('carpeta_oc', FOLDERS, (q) => q.eq('empresa_ruc', empresaRuc).not('visto_carpeta_en', 'is', null).order('drive_id')),
    ]);
    const changed = new Map<string, number>();
    for (const c of changes) changed.set(String(c.clave), (changed.get(String(c.clave)) ?? 0) + 1);

    // One line per linked document, with only the OC columns filled.
    const linked = new Set(links.map((l) => String(l.comprobante_id)));
    const docs = new Map<string, Row>();
    for (const l of lines) {
        const d = l.comprobante as Row | null;
        if (d && linked.has(String(d.id))) docs.set(String(d.id), d);
    }
    const oc = new Map<string, Row>();
    const source = { docs: [...docs.values()], items: [], sire: [], links, orders, folders, proofs: [], withholdings: [] };
    for (const f of detailLinesFromV2(source)) oc.set(docKey(f.proveedorRuc, f.tipoComprobante, f.serie, f.numero), f as unknown as Row);

    const sum = (...v: unknown[]) => v.reduce<number>((t, x) => t + (n(x) ?? 0), 0) || null;
    const out = lines.map((l) => {
        const d = (l.comprobante as Row | null) ?? {};
        const o = oc.get(docKey(d.emisor_ruc, d.tipo, d.serie, d.numero)) ?? {};
        return {
            periodo: String(l.periodo),
            proveedorRuc: s(d.emisor_ruc),
            proveedorNombre: s(l.proveedor_nombre) ?? s(d.emisor_nombre) ?? s((d.emisor as Row | null)?.razon_social),
            tipoComprobante: s(d.tipo),
            serie: s(d.serie),
            numero: s(d.numero),
            fechaEmision: s(d.fecha_emision),
            total: n(l.total),
            moneda: s(d.moneda),
            estado: s(l.estado),
            tipoNota: s(d.tipo_nota),
            modificaTipo: s(d.modifica_tipo),
            modificaSerie: s(d.modifica_serie),
            modificaNumero: s(d.modifica_numero),
            carSunat: s(l.car_sunat),
            primeraVez: String(l.primera_vez),
            ultimaVez: String(l.ultima_vez),
            cambios: changed.get(`${l.periodo}|${l.llave}`) ?? 0,
            base: sum(l.base_dg, l.base_dgng, l.base_dng),
            igv: sum(l.igv_dg, l.igv_dgng, l.igv_dng),
            detraccion: n(l.detraccion),
            tipoCambio: n(l.tipo_cambio),
            rendidoPor: null,
            ocCarpeta: s(o.ocCarpeta),
            centroCostoCg: s(o.centroCostoCg),
            codigoConcar: s(o.codigoConcar),
            alertasOc: null,
            archivoOc: s(o.archivoOc),
            archivoOcUrl: s(o.archivoOcUrl),
            situacionPagoOc: s(o.situacionPagoOc),
            compradorOc: s(o.compradorOc),
            areaOc: s(o.areaOc),
            legajoOc: s(o.legajoOc),
            carpetaOcUrl: s(o.carpetaOcUrl),
        } satisfies ComprobanteHistorico;
    });
    const k = (c: ComprobanteHistorico) => `${c.fechaEmision ?? ''}|${c.numero ?? ''}`;
    return out.sort((a, z) => k(a).localeCompare(k(z)));
}

/**
 * Who rendered each document in viáticos (the «lo rindió» column): the expense's name, by the
 * document it is tied to (gasto.comprobante_id) or, while it is not tied, by RUC, type, series
 * and number as the old sheet matched them (table gastos). Keyed by docKey.
 */
export async function readRenderedBy(sb: SupabaseClient): Promise<Map<string, string>> {
    const rows = await reader(sb)(
        'gasto',
        'id,proveedor_ruc,tipo,serie,numero,usuario:usuario_id(nombre),comprobante:comprobante_id(emisor_ruc,tipo,serie,numero)',
        (q) => q.eq('clase', 'COMPROBANTE').order('id'),
    );
    const who = new Map<string, string>();
    for (const g of rows) {
        const name = s((g.usuario as Row | null)?.nombre);
        const c = g.comprobante as Row | null;
        if (!name) continue;
        if (c) who.set(docKey(c.emisor_ruc, c.tipo, c.serie, c.numero), name);
        else if (g.numero) who.set(docKey(g.proveedor_ruc, g.tipo, g.serie, g.numero), name);
    }
    return who;
}

/** The RUC the Consulta RUC already answered (what padron_ruc held), for mapaPadronPorRuc. */
export function readPadron(sb: SupabaseClient): Promise<Row[]> {
    return reader(sb)('contribuyente', 'ruc,condicion,buen_contribuyente,agente_retencion,agente_percepcion', (q) =>
        q.not('padron_en', 'is', null).order('ruc'),
    );
}
