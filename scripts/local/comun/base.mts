// Supabase (the v2 base): the robots' client, what is left to download, and what could not be.
//
// Since 22/10/2026 the old base is gone for the robots: they read and write only v2
// (docs/database/v2/) with the service key. No robot user and no sign-in: the key bypasses RLS
// and does not expire, so there is no session to renew.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { pedir, RUC, PERIODOS, MAS_RECIENTE_PRIMERO, RUCS, SERIES, TIPOS } from './config.mts';
import { dormir, type Bitacora } from './bitacora.mts';
import { clave, type Pendiente } from './tipos.mts';

let sb: SupabaseClient | null = null;

/** The v2 client (SUPABASE_URL_V2 + SUPABASE_SECRET_KEY), one per process. */
export function base(): SupabaseClient {
    sb ??= createClient(pedir('SUPABASE_URL_V2'), pedir('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'), {
        auth: { autoRefreshToken: false, persistSession: false },
    });
    return sb;
}

/** A network or time error (not the data's): worth retrying. */
export const transient = (e: { code?: string; message?: string }) =>
    e.code === '57014' || e.code === '25P02' || /fetch failed|network|timeout|ECONNRESET|ETIMEDOUT|502|503|504|520|522/i.test(e.message ?? '');

const PAGINA = 500;
type ErrorPg = { message: string; code?: string; details?: string | null; hint?: string | null };
/** Una página: las filas con id mayor a `despuesDe` (null = desde el principio), ordenadas por id, de a `tamano`. */
type Pagina<T> = (despuesDe: string | null, tamano: number) => PromiseLike<{ data: T[] | null; error: ErrorPg | null }>;

/**
 * Lee una tabla entera, de a PAGINA filas, por CURSOR (id > el último visto).
 *
 * Por offset (`.range(1000, 1999)`…) cada página obliga a la base a recorrer y
 * descartar todas las anteriores, y con la base ocupada las últimas pasaban el
 * statement_timeout de Supabase (código 57014, 30/09/2026). Por cursor, todas
 * las páginas cuestan lo mismo. Si igual se corta por tiempo, se reintenta con
 * páginas más chicas (500 → 250 → … → 50).
 */
export async function todas<T extends { id: string }>(b: Bitacora | null, etiqueta: string, pagina: Pagina<T>): Promise<T[]> {
    const filas: T[] = [];
    let ultimo: string | null = null;
    let tamano = PAGINA;
    for (;;) {
        let r: { data: T[] | null; error: ErrorPg | null } = { data: null, error: null };
        for (let intento = 1; intento <= 8; intento++) {
            r = await pagina(ultimo, tamano);
            if (!r.error) break;
            const tiempo = r.error.code === '57014' || /timeout/i.test(r.error.message);
            if (tiempo) tamano = Math.max(50, Math.floor(tamano / 2));
            b?.log('aviso', 'base', `leer ${etiqueta} falló (intento ${intento}/8, sigue de a ${tamano}): ${r.error.code ?? ''} ${r.error.message}`, {
                error: r.error,
            });
            if (!(tiempo || transient(r.error)) || intento === 8) throw new Error(`No se pudo leer ${etiqueta}: ${r.error.code ?? ''} ${r.error.message}`);
            await dormir(1000 * intento);
        }
        const data = r.data ?? [];
        filas.push(...data);
        if (data.length < tamano) return filas;
        ultimo = data[data.length - 1].id;
    }
}

/** By issue date (and id to break ties). */
function porFecha<T extends { id: string; fecha_emision: string | null }>(filas: T[], asc: boolean): T[] {
    const k = (x: T) => `${x.fecha_emision ?? '9999-99-99'}|${x.id}`;
    return filas.sort((a, z) => (asc ? 1 : -1) * k(a).localeCompare(k(z)));
}

/** A document as the queue reads it: with its issuer's name and its months in the Registro de Compras. */
export type DocToDownload = {
    id: string;
    emisor_ruc: string;
    tipo: string;
    serie: string;
    numero: string;
    fecha_emision: string | null;
    periodo: number | null;
    moneda: string | null;
    emisor_nombre: string | null;
    emisor: { razon_social: string | null } | null;
    registro_compras: Array<{ periodo: number; total: number | null; ultima_vez: string }> | null;
};
const DOC_TO_DOWNLOAD =
    'id, emisor_ruc, tipo, serie, numero, fecha_emision, periodo, moneda, emisor_nombre, emisor:emisor_ruc(razon_social), ' +
    'registro_compras(periodo, total, ultima_vez)';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filter = (q: any) => any;

/**
 * The company's RECIBIDO documents whose `xml_estado` is in `states` (the query, not paged).
 * `sirePeriods` filters by the Registro de Compras month, not by the issue date: a document
 * recorded late sits in another month than its date's.
 */
function toDownloadQuery(states: string[], sirePeriods: string[], filter: Filter, select: string, opciones?: object) {
    const sel = sirePeriods.length ? select.replace('registro_compras(', 'registro_compras!inner(') : select;
    let q = filter(
        base().from('comprobante').select(sel, opciones).eq('empresa_ruc', RUC).eq('origen', 'RECIBIDO').in('xml_estado', states).neq('emisor_ruc', '0'),
    );
    if (sirePeriods.length) q = q.in('registro_compras.periodo', sirePeriods);
    return q;
}

/** The same, whole and by cursor. */
export function toDownload(b: Bitacora | null, states: string[], sirePeriods: string[], filter: Filter = (q) => q): Promise<DocToDownload[]> {
    return todas<DocToDownload>(b, 'comprobante', (despues, tamano) => {
        let q = toDownloadQuery(states, sirePeriods, filter, DOC_TO_DOWNLOAD);
        if (despues) q = q.gt('id', despues);
        return q.order('id').limit(tamano);
    });
}

/** The Registro de Compras month (the first, if several) or, without one, the issue date's. */
export const sirePeriod = (x: DocToDownload): string | null => {
    const meses = (x.registro_compras ?? []).map((r) => r.periodo).sort();
    return meses.length ? String(meses[0]) : x.periodo != null ? String(x.periodo) : null;
};

/** The issuer's name: as the document said it or, if not, contribuyente's. */
export const issuerName = (x: DocToDownload): string | null => x.emisor_nombre ?? x.emisor?.razon_social ?? null;

const toPending = (x: DocToDownload): Pendiente => ({
    proveedorRuc: x.emisor_ruc,
    proveedorNombre: issuerName(x),
    tipoComprobante: x.tipo,
    serie: x.serie,
    numero: x.numero,
    fechaEmision: x.fecha_emision,
    periodo: sirePeriod(x),
});

/** The run's filters (TIPOS, SERIES, RUCS). The series is already upper case (guardar_*). */
const runFilters: Filter = (q) => {
    q = q.in('tipo', TIPOS);
    if (SERIES === 'noE') q = q.not('serie', 'like', 'E%');
    if (SERIES === 'E') q = q.like('serie', 'E%');
    if (RUCS.length) q = q.in('emisor_ruc', RUCS);
    return q;
};

/**
 * What the SIRE says exists (01/07/08, non-E series) and still has no XML: `comprobante.xml_estado`
 * PENDIENTE or ERROR (it replaces the SIRE vs cpe_comprobante cross). What SUNAT already said does
 * not exist (NO_EXISTE, left in the base by markDownloads from any machine) is skipped, unless
 * REINTENTAR_NO_EXISTE=1.
 */
export async function pendientes(b: Bitacora): Promise<Pendiente[]> {
    const retry = process.env.REINTENTAR_NO_EXISTE === '1';
    const filas = await toDownload(b, retry ? ['PENDIENTE', 'ERROR', 'NO_EXISTE'] : ['PENDIENTE', 'ERROR'], PERIODOS, runFilters);
    const lista = porFecha(filas, !MAS_RECIENTE_PRIMERO)
        .filter((x) => x.emisor_ruc && x.tipo && x.serie && x.numero)
        .map(toPending);
    // Notas de crédito/débito serie E: la API responde 404 a todas (sondeo del
    // 30/09/2026, 6/6), no porque no existan. Las sigue bajando «descargar XML»
    // por pantallas; aquí no se piden para no anotarlas como «no existe».
    const final = lista.filter((p) => !(/^E/i.test(p.serie) && (p.tipoComprobante === '07' || p.tipoComprobante === '08')));
    if (!retry) {
        const { count } = await toDownloadQuery(['NO_EXISTE'], PERIODOS, runFilters, 'id, registro_compras(periodo)', {
            count: 'exact',
            head: true,
        });
        if (count) b.log('info', 'cola', `se saltan ${count} que SUNAT ya dijo que no existen (REINTENTAR_NO_EXISTE=1 para pedirlos igual)`);
    }
    return final;
}

/**
 * MODO=pdf: what already has its XML (xml_estado OK) but not its PDF in Drive.
 *
 * Running them through the whole pipeline again is safe: the XML already uploaded is
 * recognised by name in Drive (not duplicated) and `guardar_cpe` keeps the links it had
 * (coalesce) — it only fills the PDF's.
 */
export async function pendientesSinPdf(b: Bitacora): Promise<Pendiente[]> {
    const c = base();
    const filas = await todas<DocToDownload>(b, 'comprobante sin PDF', (despues, tamano) => {
        let q: ReturnType<Filter> = c
            .from('comprobante')
            .select(DOC_TO_DOWNLOAD)
            .eq('empresa_ruc', RUC)
            .eq('xml_estado', 'OK')
            .is('pdf_drive_id', null)
            .in('tipo', TIPOS);
        // The issue date's period, as cpe_comprobante filtered it.
        if (PERIODOS.length) q = q.in('periodo', PERIODOS);
        if (despues) q = q.gt('id', despues);
        return q.order('id').limit(tamano);
    });
    const unicos = new Map<string, Pendiente>();
    for (const x of filas) if (x.serie && x.numero) unicos.set(clave(toPending(x)), { ...toPending(x), proveedorNombre: null });
    const lista = [...unicos.values()].sort((a, z) => (MAS_RECIENTE_PRIMERO ? -1 : 1) * (a.fechaEmision ?? '').localeCompare(z.fechaEmision ?? ''));
    b.log('info', 'cola', `guardados sin PDF: ${lista.length}`);
    return lista;
}

export type FailedDownload = { p: Pendiente; estado: 'NO_EXISTE' | 'ERROR'; error?: string };

/**
 * Tells the base what could not be downloaded (`marcar_descargas_cpe`): NO_EXISTE (SUNAT says it
 * is not there) or ERROR (attempts ran out). It replaces the local file cpe-no-existe.jsonl, so
 * the next run, on any machine, does not ask again for what does not exist. Never stops the run:
 * if it does not go in, it stays in no-marcados.jsonl and the next run asks for those again.
 */
export async function markDownloads(b: Bitacora, filas: FailedDownload[]): Promise<void> {
    if (!filas.length) return;
    const p_filas = filas.map(({ p, estado, error }) => ({
        emisor_ruc: p.proveedorRuc,
        tipo: p.tipoComprobante,
        serie: p.serie,
        numero: p.numero,
        estado,
        error: error ?? null,
    }));
    for (let intento = 1; intento <= 3; intento++) {
        const { data, error } = await base().rpc('marcar_descargas_cpe', { p_empresa_ruc: RUC, p_filas });
        if (!error) {
            b.log('info', 'base', `marcados ${Number(data) || 0} de ${filas.length} que no se pudieron bajar`);
            return;
        }
        b.log('aviso', 'base', `marcar_descargas_cpe falló (intento ${intento}/3): ${error.code ?? ''} ${error.message}`);
        if (!transient(error)) break;
        await dormir(2000 * intento);
    }
    b.jsonl('no-marcados.jsonl', { filas: p_filas });
}
