// What carpetas-oc.mts reads from the v2 base: what was already read inside each file, the cost
// centre of each OC (CG, the approvals table, Contabilidad's rules), the photo the last run left of
// a parent folder, and the recent folder changes for the CAMBIOS tab.

import type { CentroDeCosto } from '../../../src/shared/lib/drive/legajo-carpeta.ts';
import type { FotoArchivo, FotoOC } from '../../../src/shared/lib/drive/cambios-carpetas.ts';
import { allRows, type Base } from './base.mts';
import type { Row } from './estado.mts';

/** What was read inside a file, as the old lectura_archivo row (the walk compares and reuses it). */
export type FilaLectura = {
    archivo_id: string;
    modificado: string;
    estado: string;
    metodo: string;
    tipo: string;
    serie: string;
    ruc: string;
    claves: string;
    oc_referencia: string;
    detalle: string;
};

export type Proc = 'NACIONAL' | 'IMPORTACION';

const READ_STATE: Record<string, string> = { LEIDO: 'LEÍDO', SIN_COMPROBANTE: 'SIN COMPROBANTE', SIN_TEXTO: 'SIN TEXTO', ERROR: 'ERROR' };
/** Drive's modifiedTime and Postgres' timestamptz written the same way, to compare them. */
export const iso = (v: string | null | undefined) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : '');
export const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;
export const fileUrl = (id: string) => `https://drive.google.com/file/d/${id}/view`;
/** A Drive name without the spaces and tabs around it (db:mudanza saved them trimmed): only a real rename counts. */
export const plainName = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();

/** Every file already read inside (archivo.lectura_*), by its Drive id. */
export async function previousReadings(sb: Base): Promise<Map<string, FilaLectura>> {
    const rows = await allRows<Row>(
        sb,
        'archivo',
        'drive_id,lectura_modificado,lectura_estado,lectura_metodo,leido_tipo,leido_serie,leido_ruc,leido_claves,leido_oc,lectura_detalle',
        ['drive_id'],
        (q) => q.not('lectura_estado', 'is', null),
    );
    return new Map(
        rows.map((r) => [
            r.drive_id,
            {
                archivo_id: r.drive_id,
                modificado: iso(r.lectura_modificado),
                estado: READ_STATE[r.lectura_estado] ?? r.lectura_estado,
                metodo: r.lectura_metodo ?? '',
                tipo: r.leido_tipo ?? '',
                serie: r.leido_serie ?? '',
                ruc: r.leido_ruc ?? '',
                claves: ((r.leido_claves ?? []) as string[]).join(','),
                oc_referencia: r.leido_oc ?? '',
                detalle: r.lectura_detalle ?? '',
            },
        ]),
    );
}

/** The base de CG as the old oc_base_cg rows: one per OC × cost centre (an area has code «-»). */
export async function cgLines(sb: Base, companyRuc: string) {
    const rows = await allRows<Row>(
        sb,
        'orden_compra_centro_costo',
        'lineas,principal,orden_compra!inner(codigo,procedencia,empresa_ruc),centro_costo:centro_costo_id(codigo,nombre,es_area)',
        ['orden_compra_id', 'centro_costo_id'],
        (q) => q.eq('orden_compra.empresa_ruc', companyRuc),
    );
    return rows.map((r) => ({
        oc: r.orden_compra.codigo as string,
        procedencia: r.orden_compra.procedencia as Proc,
        cc_codigo: (r.centro_costo?.es_area ? '-' : r.centro_costo?.codigo) ?? null,
        cc_nombre: (r.centro_costo?.nombre ?? null) as string | null,
        lineas: r.lineas as number | null,
        principal: !!r.principal,
    }));
}

/**
 * The cost centre each OC already has: CG's for nationals (the principal one is chosen by the
 * caller), the approvals table's for imports; and the folder rules Contabilidad set by hand.
 */
export async function costCentreSources(sb: Base, companyRuc: string, procedencia: Proc) {
    const cg = await cgLines(sb, companyRuc);
    const legajo = await allRows<Row>(sb, 'orden_compra', 'codigo,centro_costo:centro_costo_id(codigo,nombre,es_area)', ['id'], (q) =>
        q.eq('empresa_ruc', companyRuc).eq('procedencia', 'IMPORTACION').eq('centro_costo_segun', 'LEGAJO'),
    );
    const rules = await allRows<Row>(
        sb,
        'regla_centro_costo',
        'proyecto_carpeta,centro_costo:centro_costo_id(codigo,nombre,es_area)',
        ['proyecto_carpeta'],
        (q) => q.eq('empresa_ruc', companyRuc).eq('procedencia', procedencia).eq('segun', 'MANUAL'),
    );
    const cc = (c: Row | null): CentroDeCosto | null => (c?.nombre ? { codigo: c.es_area ? '-' : c.codigo, nombre: c.nombre } : null);
    return {
        cg,
        approvals: new Map(legajo.filter((o) => cc(o.centro_costo)).map((o) => [o.codigo as string, cc(o.centro_costo)!])),
        manual: new Map(rules.filter((r) => cc(r.centro_costo)).map((r) => [String(r.proyecto_carpeta).trim(), cc(r.centro_costo)!])),
    };
}

/** The photo the last complete run left of this parent folder: its OC folders and their files. */
export async function previousPhoto(sb: Base, companyRuc: string, procedencia: Proc): Promise<{ ocs: FotoOC[]; archivos: FotoArchivo[] }> {
    const folders = await allRows<Row>(sb, 'carpeta_oc', 'drive_id,nombre,proveedor,le_falta,estado,orden_compra(codigo)', ['drive_id'], (q) =>
        q.eq('empresa_ruc', companyRuc).eq('procedencia', procedencia).not('visto_carpeta_en', 'is', null),
    );
    const files = await allRows<Row>(sb, 'archivo', 'drive_id,nombre,modificado,carpeta_id,carpeta_oc!inner(procedencia,empresa_ruc)', ['drive_id'], (q) =>
        q.eq('carpeta_oc.procedencia', procedencia).eq('carpeta_oc.empresa_ruc', companyRuc).not('visto_carpeta_en', 'is', null),
    );
    const code = new Map(folders.map((f) => [f.drive_id as string, (f.orden_compra?.codigo ?? '') as string]));
    return {
        ocs: folders.map((f) => ({
            oc: code.get(f.drive_id)!,
            carpetaUrl: folderUrl(f.drive_id),
            carpetaNombre: plainName(f.nombre),
            proveedor: f.proveedor ?? '',
            leFalta: ((f.le_falta ?? []) as string[]).join(', '),
            estado: f.estado === 'VACIA' ? 'VACÍA' : (f.estado ?? ''),
        })),
        archivos: files
            .filter((a) => code.has(a.carpeta_id))
            .map((a) => ({
                oc: code.get(a.carpeta_id)!,
                carpetaUrl: folderUrl(a.carpeta_id),
                url: fileUrl(a.drive_id),
                nombre: plainName(a.nombre),
                modificado: iso(a.modificado),
            })),
    };
}

/** The folder changes of the last days, oldest first, as the CAMBIOS tab shows them. */
export async function recentChanges(sb: Base, procedencia: Proc, since: string) {
    const rows = await allRows<Row>(sb, 'cambio', 'id,ocurrido_en,tipo,despues,detalle', ['id'], (q) =>
        q.eq('entidad', 'carpeta_oc').eq('detalle->>procedencia', procedencia).gte('ocurrido_en', since),
    );
    return rows.map((c) => ({
        fecha: c.ocurrido_en as string,
        oc: (c.detalle?.oc ?? '') as string,
        tipo: c.tipo as string,
        detalle: (c.despues ?? null) as string | null,
        enlace: (c.detalle?.enlace ?? null) as string | null,
        carpeta_url: (c.detalle?.carpeta_url ?? null) as string | null,
    }));
}
