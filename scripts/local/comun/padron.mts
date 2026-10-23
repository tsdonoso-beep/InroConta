// The RUC lookups in the v2 base: who to look up and how to save what SUNAT said, on the columns
// of `contribuyente` (one row per RUC). Before these were functions of the old base
// (rucs_por_actualizar_en_padron, guardar_padron_ruc, rucs_para_domicilio, guardar_domicilios_ruc);
// v2 has no read functions and saves a RUC's columns with a plain upsert (004_escrituras_comprobantes.sql).
// Used by consultar-padron-ruc.mts, local/ruc-fichas.mts, repair-padron-agents.mts and padron-domicilios.mts.

import type { SupabaseClient } from '@supabase/supabase-js';
import { allPages } from '../../../src/shared/supabase/paging.ts';
import type { CondicionRuc } from '../../../src/shared/lib/sunat/consulta-ruc.ts';
import type { RucFicha } from '../../../src/shared/lib/sunat/ruc-ficha.ts';
import { RUC as COMPANY } from './config.mts';

type Row = Record<string, unknown>;

/** Every row a query gives, 1000 at a time (the query must order by something unique). */
function every<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>): Promise<T[]> {
    return allPages<T>(async (from, size) => {
        const { data, error } = await query(from, from + size - 1);
        if (error) throw new Error(`${error.code ?? ''} ${error.message}`.trim());
        return (data ?? []) as T[];
    });
}

/**
 * The RUC to look up in the Consulta RUC: never looked up (padron_en null) first, then those
 * older than `days`, each group by RUC — what rucs_por_actualizar_en_padron() returned. Every
 * RUC we deal with (SIRE, XML, purchase base, padrón reducido) is a contribuyente row in v2.
 */
export async function rucsToRefresh(sb: SupabaseClient, days: number): Promise<string[]> {
    const older = new Date(Date.now() - days * 86400000).toISOString();
    const rows = await every<{ ruc: string; padron_en: string | null }>((from, to) =>
        sb
            .from('contribuyente')
            .select('ruc, padron_en')
            .eq('tipo_documento', '6')
            .neq('ruc', COMPANY)
            .or(`padron_en.is.null,padron_en.lt.${older}`)
            .order('ruc')
            .range(from, to),
    );
    const valid = rows.filter((r) => /^\d{11}$/.test(r.ruc));
    return [...valid.filter((r) => !r.padron_en), ...valid.filter((r) => r.padron_en)].map((r) => r.ruc);
}

/** The issuers with a line in the Registro de Compras since `periodo` (AAAAMM). */
export async function suppliersSince(sb: SupabaseClient, periodo: string): Promise<Set<string>> {
    const rows = await every<{ comprobante: { emisor_ruc: string } | null }>((from, to) =>
        sb
            .from('registro_compras')
            .select('id, comprobante:comprobante_id(emisor_ruc)')
            .eq('empresa_ruc', COMPANY)
            .gte('periodo', periodo)
            .order('id')
            .range(from, to),
    );
    return new Set(rows.map((r) => r.comprobante?.emisor_ruc).filter((r): r is string => !!r));
}

/** Rows of different shapes go in different upserts: a column missing from a row would be written as null. */
async function upsertByShape(sb: SupabaseClient, rows: Row[]): Promise<number> {
    const shapes = new Map<string, Row[]>();
    for (const r of rows) {
        const k = Object.keys(r).sort().join(',');
        shapes.set(k, [...(shapes.get(k) ?? []), r]);
    }
    let saved = 0;
    for (const group of shapes.values()) {
        const { error } = await sb.from('contribuyente').upsert(group, { onConflict: 'ruc' });
        if (error) throw new Error(`contribuyente: ${error.code ?? ''} ${error.message}`);
        saved += group.length;
    }
    return saved;
}

const nn = (v: string | null | undefined) => (v == null || v === '' ? null : v);

function fichaColumns(x: RucFicha, now: string): Row {
    return {
        tipo_contribuyente: nn(x.taxpayerType),
        documento: nn(x.document),
        nombre_comercial: nn(x.tradeName),
        fecha_inscripcion: nn(x.registeredOn),
        fecha_inicio_actividades: nn(x.activitiesStartOn),
        fecha_baja: nn(x.deregisteredOn),
        sistema_emision: nn(x.issuingSystem),
        comercio_exterior: nn(x.foreignTrade),
        sistema_contabilidad: nn(x.accountingSystem),
        actividades: x.activities ?? [],
        comprobantes_impresion: x.printedReceipts ?? [],
        emision_electronica: x.electronicIssuing ?? [],
        emisor_electronico_desde: nn(x.electronicIssuerSince),
        comprobantes_electronicos: nn(x.electronicReceipts),
        ple_desde: nn(x.pleSince),
        aviso: nn(x.notice),
        ficha_en: now,
    };
}

/**
 * Saves Consulta RUC results (what guardar_padron_ruc() did): the padrones always, and the full
 * ficha when the row brings one. The ficha's fiscal address goes to `direccion` only when the
 * padrón reducido has not given one (domicilio_en null): that one wins (002_comprobantes.sql).
 * A blank business name does not erase the stored one. Throws if a batch does not go in.
 */
export async function savePadron(
    sb: SupabaseClient,
    results: Array<Omit<CondicionRuc, 'encontrado' | 'ficha'> & { ficha?: RucFicha | null }>,
): Promise<number> {
    if (!results.length) return 0;
    const withFicha = results.filter((r) => r.ficha).map((r) => r.ruc);
    const reduced = new Set<string>();
    for (let i = 0; i < withFicha.length; i += 200) {
        const { data, error } = await sb
            .from('contribuyente')
            .select('ruc')
            .in('ruc', withFicha.slice(i, i + 200))
            .not('domicilio_en', 'is', null);
        if (error) throw new Error(`contribuyente: ${error.code ?? ''} ${error.message}`);
        for (const r of data ?? []) reduced.add(r.ruc as string);
    }
    const now = new Date().toISOString();
    const rows = results.map((r) => ({
        ruc: r.ruc,
        ...(nn(r.razonSocial) ? { razon_social: r.razonSocial } : {}),
        estado: nn(r.estado),
        condicion: nn(r.condicion),
        buen_contribuyente: !!r.buenContribuyente,
        agente_retencion: !!r.agenteRetencion,
        agente_percepcion: !!r.agentePercepcion,
        padrones_detalle: nn(r.padronesTexto),
        padron_en: now,
        ...(r.ficha ? fichaColumns(r.ficha, now) : {}),
        ...(r.ficha && !reduced.has(r.ruc) ? { direccion: nn(r.ficha.fiscalAddress) } : {}),
    }));
    return upsertByShape(sb, rows);
}

/** The RUC whose address matters (what rucs_para_domicilio() returned): every 11-digit contribuyente. */
export async function rucsForAddress(sb: SupabaseClient): Promise<string[]> {
    const rows = await every<{ ruc: string }>((from, to) => sb.from('contribuyente').select('ruc').eq('tipo_documento', '6').order('ruc').range(from, to));
    return rows.map((r) => r.ruc).filter((r) => /^\d{11}$/.test(r));
}

/**
 * Saves the padrón reducido lines (what guardar_domicilios_ruc() did), 1000 per upsert, stamping
 * domicilio_en. A line without an address (natural persons) keeps the address the ficha gave.
 */
export async function saveAddresses(sb: SupabaseClient, lines: Array<Record<string, string>>): Promise<number> {
    const now = new Date().toISOString();
    const rows = lines
        .filter((f) => /^\d{11}$/.test(f.ruc ?? ''))
        .map((f) => ({
            ruc: f.ruc,
            ...(nn(f.razonSocial) ? { razon_social: f.razonSocial } : {}),
            estado: nn(f.estado),
            condicion: nn(f.condicion),
            ubigeo: /^\d{6}$/.test(f.ubigeo ?? '') ? f.ubigeo : null,
            departamento: nn(f.departamento),
            provincia: nn(f.provincia),
            distrito: nn(f.distrito),
            ...(nn(f.direccion) ? { direccion: f.direccion } : {}),
            domicilio_en: now,
        }));
    let saved = 0;
    for (let i = 0; i < rows.length; i += 1000) saved += await upsertByShape(sb, rows.slice(i, i + 1000));
    return saved;
}
