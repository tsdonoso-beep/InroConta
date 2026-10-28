// What carpetas-oc.mts writes to the v2 base, always through its functions
// (docs/database/v2/005_escrituras_oc.sql): the folder walk by batches and its close, the folder
// changes, and what the script calculated.

import type { Cambio } from '../../../src/shared/lib/drive/cambios-carpetas.ts';
import { dormir } from '../comun/bitacora.mts';
import { call, type Base } from './base.mts';
import type { Row } from './estado.mts';
import type { Proc } from './carpetas.mts';

const BATCH = 1000;
const folderOf = (url: string) => /\/folders\/([\w-]+)/.exec(url)?.[1] ?? url;

/**
 * The folders and files this walk saw (visto_carpeta_en = now). Every folder goes before any file:
 * the base links a file to its folder only if the folder is already there.
 */
export async function saveWalk(sb: Base, companyRuc: string, folders: Row[], files: Row[]): Promise<{ carpetas: number; archivos: number }> {
    let carpetas = 0,
        archivos = 0;
    for (let i = 0; i < folders.length; i += BATCH) {
        const r = await call<{ carpetas: number }>(sb, 'guardar_carpetas_oc', {
            p_empresa_ruc: companyRuc,
            p_recorrido: 'CARPETA',
            p_carpetas: folders.slice(i, i + BATCH),
        });
        carpetas += r.carpetas;
    }
    for (let i = 0; i < files.length; i += BATCH) {
        const r = await call<{ archivos: number }>(sb, 'guardar_carpetas_oc', {
            p_empresa_ruc: companyRuc,
            p_recorrido: 'CARPETA',
            p_archivos: files.slice(i, i + BATCH),
        });
        archivos += r.archivos;
    }
    return { carpetas, archivos };
}

/** Only after a complete walk: what it did not see since `start` stops being its own (or is deleted). */
export function closeWalk(sb: Base, companyRuc: string, procedencia: Proc, start: Date) {
    return call<{ carpetas_vistas: number; carpetas_quitadas: number; archivos_quitados: number }>(sb, 'cerrar_recorrido_oc', {
        p_empresa_ruc: companyRuc,
        p_recorrido: 'CARPETA',
        p_procedencia: procedencia,
        p_inicio: start.toISOString(),
    });
}

/** The folder changes, in the history (cambio), as db:mudanza moved carpeta_cambio. */
export async function saveChanges(sb: Base, companyRuc: string, procedencia: Proc, changes: Cambio[]): Promise<void> {
    const rows = changes.map((c) => ({
        entidad: 'carpeta_oc',
        clave: folderOf(c.carpetaUrl),
        tipo: c.tipo,
        campo: null,
        antes: null,
        despues: c.detalle || null,
        detalle: { procedencia, oc: c.oc, enlace: c.enlace || null, carpeta_url: c.carpetaUrl },
    }));
    for (let i = 0; i < rows.length; i += 500)
        await call(sb, 'guardar_carpetas_oc', { p_empresa_ruc: companyRuc, p_recorrido: 'CARPETA', p_cambios: rows.slice(i, i + 500) });
}

// The nacional save takes ~20 s and the base cuts it when the SUNAT robots are writing at the same
// time (GitHub often delays the 01:17 run to 07:00-08:00): seen on 27 and 28/10/2026. It is one
// transaction, so a cut one leaves nothing half done and can simply be sent again.
const CUT_BY_TIMEOUT = /statement timeout/i;
export const RETRY_WAITS_MS = [60_000, 120_000];

/** What the script calculated, all in one transaction. `complete`: the links and signals not sent are deleted. */
export async function saveCalculations(
    sb: Base,
    companyRuc: string,
    p: { vinculos: Row[]; sinOc: Row[]; ordenes: Row[]; carpetas: Row[]; reglas: Row[] },
    complete: boolean,
    wait: (ms: number) => Promise<void> = dormir,
) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await call<Record<string, number>>(sb, 'guardar_calculos_oc', {
                p_empresa_ruc: companyRuc,
                p_vinculos: p.vinculos,
                p_sin_oc: p.sinOc,
                p_ordenes: p.ordenes,
                p_carpetas: p.carpetas,
                p_reglas: p.reglas,
                p_completo: complete,
            });
        } catch (e) {
            const ms = RETRY_WAITS_MS[attempt];
            if (ms === undefined || !CUT_BY_TIMEOUT.test(e instanceof Error ? e.message : String(e))) throw e;
            console.warn(
                `⚠ guardar_calculos_oc: la base lo cortó por tiempo; se reintenta en ${ms / 60_000} min (intento ${attempt + 2} de ${RETRY_WAITS_MS.length + 1})`,
            );
            await wait(ms);
        }
    }
}
