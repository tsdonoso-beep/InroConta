// The legajo of each OC of a parent folder, as guardar_calculos_oc stores it: what each folder has
// and lacks (p_carpetas), each OC's state over all its folders, what another source already proves
// («por subir»), its cost centre (p_ordenes) and each project folder's rule (p_reglas). The old base
// did the «por subir» part on every read (evidencias_de_fuentes, carpetas_madre_fuentes); the
// evidence rules are the legajo screen's (src/modules/legajo/domain/policies/evidence.ts).

import type { AnalisisOC, ProyectoCC } from '../../../src/shared/lib/drive/analisis-carpetas.ts';
import { documentosDeOC, type CentroDeCosto } from '../../../src/shared/lib/drive/legajo-carpeta.ts';
import { indexOrders } from '../../../src/shared/lib/oc/entradas.ts';
import type { Link } from '../../../src/shared/lib/oc/vinculos.ts';
import { comexEvidence, missingSplit, warehouseEvidence, type Voucher } from '../../../src/modules/legajo/domain/policies/evidence.ts';
import type { Row, State } from './estado.mts';
import type { Proc } from './carpetas.mts';

/** One OC folder of the walk with the legajo keys of its files. */
export interface WalkedFolder {
    folderId: string;
    oc: string;
    tipo: 'OC' | 'OS';
    files: string[][];
    /** What the walk counted in it (carpeta_oc.comprobantes, series, rucs). */
    counted: { comprobantes: number; series: string; rucs: string };
}

const normal = (s: string) => s.replace(/\s+/g, '').toUpperCase();
const STATE: Record<string, string> = { OK: 'OK', INCOMPLETA: 'INCOMPLETA', VACÍA: 'VACIA' };
const segun = (s: string) => s.replace(/\s+/g, '_');

/** The cost centre's code as v2 has it (an area's code is its name): the base looks it up by code. */
export function codeResolver(costCentres: Row[]) {
    const byNormal = new Map(costCentres.map((c) => [c.codigo_normal ?? normal(c.codigo), c.codigo as string]));
    return (cc: CentroDeCosto | null | undefined): string | null => {
        if (!cc?.nombre) return null;
        if (cc.codigo && cc.codigo !== '-' && byNormal.has(normal(cc.codigo))) return byNormal.get(normal(cc.codigo))!;
        return byNormal.get(normal(cc.nombre)) ?? null;
    };
}

/** The legajo state of an OC: complete, empty, missing, or missing but proven elsewhere. */
function legajoState(estado: string, toUpload: string, nowhere: string) {
    if (estado === 'OK') return 'COMPLETO';
    if (estado === 'VACÍA') return 'VACIA';
    if (toUpload && !nowhere) return 'POR_SUBIR';
    return toUpload ? 'FALTA_Y_POR_SUBIR' : 'FALTA';
}

export function legajoRows(
    p: { procedencia: Proc; folders: WalkedFolder[]; analysis: Map<string, AnalisisOC>; projects: ProyectoCC[] },
    s: State,
    links: Link[],
) {
    const { find } = indexOrders(s.orders);
    const code = codeResolver(s.costCentres);
    const isImport = p.procedencia === 'IMPORTACION';
    const group = <T,>(rows: T[], key: (r: T) => string) => {
        const m = new Map<string, T[]>();
        for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
        return m;
    };
    const vouchers = group(s.vouchers, (v) => v.orden_compra_id);
    const duas = group(s.duas, (d) => d.orden_compra_id);
    const invoice = new Map(s.invoices.map((c) => [c.id as string, c]));
    const invoicesOf = group(links, (l) => l.orderId);

    const carpetas = p.folders.flatMap((f) => {
        const a = p.analysis.get(f.folderId);
        if (!a) return [];
        return [
            {
                drive_id: f.folderId,
                documentos: a.docs.cuenta,
                le_falta: a.docs.leFalta,
                estado: STATE[a.docs.estado],
                comprobantes: f.counted.comprobantes,
                series: f.counted.series || null,
                rucs: f.counted.rucs || null,
                // The folder's own cost centre (the sheets read it before the OC's).
                cc_codigo: code(a.cc),
                cc_segun: segun(a.cc.fuente),
            },
        ];
    });

    const ordenes: Row[] = [];
    for (const [oc, folders] of group(p.folders, (f) => f.oc)) {
        const o = find(p.procedencia, oc);
        const a = p.analysis.get(folders[0].folderId);
        if (!o || !a) continue;
        const docs = documentosDeOC(
            folders.flatMap((f) => f.files.map((claves) => ({ claves }))),
            { servicio: folders[0].tipo === 'OS', importacion: isImport },
        );
        const guide = warehouseEvidence((vouchers.get(o.id) ?? []) as unknown as Voucher[]);
        const evidence = [
            ...(guide ? [guide] : []),
            ...comexEvidence(o.dam ?? null, (duas.get(o.id) ?? []) as { dua: string; fecha: string | null }[], o.costeo ?? null),
        ];
        const sunat = [
            ...new Set(
                (invoicesOf.get(o.id) ?? []).map((l) => {
                    const c = invoice.get(l.invoiceId)!;
                    return `${c.serie}-${c.numero} (${c.emisor_ruc})`;
                }),
            ),
        ].sort();
        const split = missingSplit(docs.leFalta, evidence, sunat.join(' / '), sunat.length);
        ordenes.push({
            procedencia: p.procedencia,
            oc,
            cc_codigo: code(a.cc),
            cc_segun: segun(a.cc.fuente),
            legajo_estado: legajoState(docs.estado, split.toUpload, split.nowhere),
            le_falta: docs.leFalta,
            por_subir: split.toUpload ? split.toUpload.split(' | ') : [],
            ingreso_almacen: guide?.fecha ?? null,
        });
    }

    const reglas = p.projects
        .filter((r) => !r.manual)
        .map((r) => ({
            procedencia: p.procedencia,
            proyecto_carpeta: r.proyectoCarpeta,
            cc_codigo: code(r),
            segun: segun(r.fuente),
            detalle: r.detalle || null,
            revisar: r.revisar,
            ocs: r.ocs,
            ocs_en_cg: r.ocsEnCg,
        }));
    return { carpetas, ordenes, reglas };
}
