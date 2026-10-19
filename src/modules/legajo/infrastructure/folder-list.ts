// The folder list from the v2 tables: eight reads at once (each by index, paged), joined here.
// Before, carpetas_madre_fuentes_json chained five functions in the base and recalculated
// vinculos_oc for the whole company on every read (3.5 s).
import 'server-only';
import { err, ok, type Result } from 'neverthrow';
import type { SourceError } from '../../../shared/errors.ts';
import { all } from '../../../shared/supabase/tables.ts';
import { nameCase, sentenceCase } from '../../../shared/text.ts';
import type { Folder, SourceCopy } from '../domain/entities/Folder.ts';
import { comexEvidence, documentsText, missingSplit, shortCompany, statusDetail, warehouseEvidence, type Voucher } from '../domain/policies/evidence.ts';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));
const group = <T extends Row>(rows: T[], key: (r: T) => unknown) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
        const k = s(key(r));
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(r);
    }
    return m;
};

export const BUYER_SOURCE: Record<string, string> = { LEGAJO: 'Legajo por OC', COMEX: 'STATUS de COMEX', COMPRAS: 'Base de Compras' };
export const STATUS = (v: unknown) => (v === 'VACIA' ? 'VACÍA' : s(v));

/** The OC's invoices (comprobante_oc), «E001-12 (20100047218)», for one folder: the ones its files prove, or all if it is the OC's only folder. */
export function invoicesOf(links: Row[], folderId: string, onlyFolder: boolean): string[] {
    const set = new Set<string>();
    for (const l of links) {
        const a = l.archivo as Row | null;
        if (!onlyFolder && a?.carpeta_id !== folderId) continue;
        const k = l.comprobante as Row;
        set.add(`${s(k.serie)}-${s(k.numero)} (${s(k.emisor_ruc)})`);
    }
    return [...set].sort();
}

export async function readFolderList(companyRuc: string): Promise<Result<{ folders: Folder[]; copies: SourceCopy[] }, SourceError>> {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const [folders, orders, vouchers, duas, links, folderChanges, ocChanges, copies] = await Promise.all([
        all<Row>('carpeta_oc', (c) =>
            c
                .from('carpeta_oc')
                .select('drive_id,orden_compra_id,procedencia,nombre,proveedor,proyecto_carpeta,documentos,le_falta,estado,visto_carpeta_en')
                .eq('empresa_ruc', companyRuc)
                .not('visto_carpeta_en', 'is', null)
                .order('drive_id'),
        ),
        all<Row>('orden_compra', (c) =>
            c
                .from('orden_compra')
                .select(
                    'id,codigo,anio,area,comprador,comprador_segun,situacion_pago,forma_pago,condicion_pago,legajo_en,compras_en,comex_en,consorcio,fecha_oc,monto_pen,comex_estado,llegada_planta,dam,costeo,centro_costo:centro_costo_id(nombre)',
                )
                .eq('empresa_ruc', companyRuc)
                .order('id'),
        ),
        all<Row>('vale_almacen', (c) =>
            c
                .from('vale_almacen')
                .select('id,orden_compra_id,vale,fecha_operacion,fecha_registro,movimiento,operacion,tipo_documento,numero_documento,documento_url')
                .eq('empresa_ruc', companyRuc)
                .eq('movimiento', 'INGRESO')
                .not('orden_compra_id', 'is', null)
                .order('id'),
        ),
        all<Row>('orden_compra_dua', (c) => c.from('orden_compra_dua').select('orden_compra_id,dua,fecha').order('orden_compra_id').order('dua')),
        all<Row>('comprobante_oc', (c) =>
            c
                .from('comprobante_oc')
                .select('orden_compra_id,comprobante_id,archivo:archivo_id(carpeta_id),comprobante:comprobante_id(serie,numero,emisor_ruc)')
                .order('comprobante_id')
                .order('orden_compra_id'),
        ),
        all<Row>('cambio (carpetas)', (c) =>
            c
                .from('cambio')
                .select('id,clave,tipo,despues,ocurrido_en')
                .eq('entidad', 'carpeta_oc')
                .order('ocurrido_en', { ascending: false })
                .order('id', { ascending: false }),
        ),
        all<Row>('cambio (fuentes)', (c) =>
            c.from('cambio').select('id,clave').in('entidad', ['orden_compra', 'vale_almacen']).gt('ocurrido_en', since).order('id'),
        ),
        // Optional: without it, the screen only loses the «read on» note.
        all<Row>('corrida (copia de fuentes)', (c) =>
            c.from('corrida').select('id,filas,terminada_en,resultado,iniciada_en,resumen').eq('job', 'copia-fuentes').order('id', { ascending: false }),
        ),
    ]);
    for (const r of [folders, orders, vouchers, duas, links, folderChanges, ocChanges]) if (r.isErr()) return err(r.error);

    const oc = new Map(orders._unsafeUnwrap().map((o) => [s(o.id), o]));
    const vouchersOf = group(vouchers._unsafeUnwrap(), (v) => v.orden_compra_id);
    const duasOf = group(duas._unsafeUnwrap(), (d) => d.orden_compra_id);
    const linksOf = group(links._unsafeUnwrap(), (l) => l.orden_compra_id);
    const foldersOf = group(folders._unsafeUnwrap(), (f) => f.orden_compra_id);
    const lastChange = new Map<string, Row>();
    for (const c of folderChanges._unsafeUnwrap()) if (!lastChange.has(s(c.clave))) lastChange.set(s(c.clave), c);
    const sourceChanges = new Map<string, number>();
    for (const c of ocChanges._unsafeUnwrap()) sourceChanges.set(s(c.clave), (sourceChanges.get(s(c.clave)) ?? 0) + 1);

    const list = folders._unsafeUnwrap().map((f): Folder & { _year: string } => {
        const o = oc.get(s(f.orden_compra_id)) ?? {};
        const isImport = f.procedencia === 'IMPORTACION';
        const id = s(f.drive_id);
        const invoices = invoicesOf(linksOf.get(s(o.id)) ?? [], id, (foldersOf.get(s(o.id)) ?? []).length === 1);
        const guide = warehouseEvidence((vouchersOf.get(s(o.id)) ?? []) as unknown as Voucher[]);
        const evidence = [
            ...(guide ? [guide] : []),
            ...comexEvidence((o.dam as string) ?? null, (duasOf.get(s(o.id)) ?? []) as { dua: string; fecha: string | null }[], (o.costeo as string) ?? null),
        ];
        const missing = (f.le_falta as string[] | null) ?? [];
        const status = STATUS(f.estado);
        const split = missingSplit(missing, evidence, invoices.join(' / '), invoices.length);
        const change = lastChange.get(id);
        const company = o.consorcio ? shortCompany(o.consorcio as string) : 'INROPRIN';
        return {
            _year: s(o.anio),
            isImport,
            area: s(o.area) || (isImport ? 'COMEX (importaciones)' : 'Compras nacionales'),
            buyer: nameCase(s(o.comprador)),
            paymentStatus: sentenceCase(s(o.situacion_pago)),
            // The approvals table's payment form; if not, Compras' with its condition.
            paymentForm: o.legajo_en && o.forma_pago ? s(o.forma_pago) : [o.forma_pago, o.condicion_pago].filter(Boolean).join(' · '),
            oc: s(o.codigo),
            supplier: nameCase(s(f.proveedor)),
            project: s(f.proyecto_carpeta).trim(),
            folderName: s(f.nombre),
            folderId: id,
            status,
            missing: missing.join(', '),
            documents: documentsText(f.documentos as Record<string, number> | null, !isImport),
            sunatInvoices: invoices.length,
            costCenter: nameCase(s((o.centro_costo as Row | null)?.nombre)),
            lastChange: change ? `${s(change.tipo)}${change.despues ? `: ${s(change.despues)}` : ''}` : '',
            lastChangeAt: s(change?.ocurrido_en),
            loadedAt: s(f.visto_carpeta_en),
            statusDetail: statusDetail(status, split.toUpload, split.nowhere),
            toUpload: split.toUpload,
            missingNowhere: split.nowhere,
            buyerSource: BUYER_SOURCE[s(o.comprador_segun)] ?? '',
            ocDate: s(o.fecha_oc),
            amountPen: n(o.monto_pen),
            warehouseEntry: s(guide?.fecha),
            comexStatus: sentenceCase(s(o.comex_estado)),
            plantArrival: s(o.llegada_planta),
            sourceChanges: sourceChanges.get(`${s(f.procedencia)}|${s(o.codigo)}`) ?? 0,
            company,
            companySource: o.compras_en ? 'Base de Compras' : o.comex_en ? 'STATUS de COMEX' : 'Sin dato en Compras ni COMEX: se asume INROPRIN',
        };
    });
    // Nationals first, then by year, OC and folder (as the old list).
    list.sort(
        (a, z) => Number(a.isImport) - Number(z.isImport) || a._year.localeCompare(z._year) || a.oc.localeCompare(z.oc) || a.folderId.localeCompare(z.folderId),
    );

    const lastCopy = new Map<string, SourceCopy>();
    for (const r of copies.unwrapOr([])) {
        const res = (r.resumen ?? {}) as Row;
        const tab = s(res.pestana);
        if (tab && !lastCopy.has(tab))
            lastCopy.set(tab, {
                pestana: tab,
                filas: n(r.filas),
                fin: (r.terminada_en as string) ?? null,
                // The full text («OK · 0 enlaces nuevos…») lives in resumen; the column only says OK/PARCIAL/ERROR.
                resultado: ((res.resultado ?? r.resultado) as string) ?? null,
                leido_en: s(res.leido_en ?? r.terminada_en ?? r.iniciada_en),
            });
    }
    return ok({ folders: list.map(({ _year, ...f }) => (void _year, f)), copies: [...lastCopy.values()].sort((a, z) => a.pestana.localeCompare(z.pestana)) });
}
