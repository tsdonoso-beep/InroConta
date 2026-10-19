// The folders, the invoices without OC, the changes and one folder, from the v2 tables. Each list
// on its own so a screen only waits for its own. What the old *_json functions recalculated on
// every read (vinculos_oc, facturas_sin_oc) is stored in v2: comprobante_oc and comprobante.sin_oc_*.
import 'server-only';
import { err, ok, type Result } from 'neverthrow';
import type { SourceError } from '../../../shared/errors.ts';
import { all, one } from '../../../shared/supabase/tables.ts';
import { nameCase, sentenceCase } from '../../../shared/text.ts';
import type { LegajoPort } from '../application/ports/LegajoPort.ts';
import type { ChangesRead, FolderChange, FoldersRead, NoOcInvoice, NoOcRead } from '../domain/entities/Folder.ts';
import type { FolderDetail } from '../domain/entities/FolderDetail.ts';
import { readFolderDetail } from './folder-detail.ts';
import { readFolderList } from './folder-list.ts';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const now = () => new Date().toISOString();

/**
 * What the supplier's other invoices say: the OCs they are tied to, and the (area, buyer) of the
 * approvals table that appears most among them, as facturas_sin_oc did (only the legajo's buyer).
 */
function bySupplier(links: Row[]) {
    const out = new Map<string, { ocs: Set<string>; buyers: Map<string, number> }>();
    for (const l of links) {
        const ruc = s((l.comprobante as Row | null)?.emisor_ruc);
        const o = (l.orden_compra ?? {}) as Row;
        const x = out.get(ruc) ?? { ocs: new Set<string>(), buyers: new Map<string, number>() };
        if (o.codigo) x.ocs.add(s(o.codigo));
        const buyer = o.comprador_segun === 'LEGAJO' ? s(o.comprador) : '';
        const area = o.legajo_en ? s(o.area) : '';
        if (buyer || area) x.buyers.set(`${area}\u0001${buyer}`, (x.buyers.get(`${area}\u0001${buyer}`) ?? 0) + 1);
        out.set(ruc, x);
    }
    return out;
}

export class SupabaseLegajoAdapter implements LegajoPort {
    async readFolders(companyRuc: string): Promise<Result<FoldersRead, SourceError>> {
        const r = await readFolderList(companyRuc);
        return r.map((x) => ({ ...x, readAt: now() }));
    }

    async readNoOc(companyRuc: string): Promise<Result<NoOcRead, SourceError>> {
        const [docs, links] = await Promise.all([
            all<Row>('comprobante (sin OC)', (c) =>
                c
                    .from('comprobante')
                    .select(
                        'id,fecha_emision,emisor_ruc,serie,numero,moneda,total,pdf_drive_id,sin_oc_senal,sin_oc_razon,area_probable,emisor:emisor_ruc(razon_social)',
                    )
                    .eq('empresa_ruc', companyRuc)
                    .in('sin_oc_senal', ['ALTA', 'MEDIA'])
                    .order('id'),
            ),
            all<Row>('comprobante_oc (proveedores)', (c) =>
                c
                    .from('comprobante_oc')
                    .select(
                        'comprobante_id,orden_compra_id,comprobante:comprobante_id(emisor_ruc),orden_compra:orden_compra_id(codigo,comprador,comprador_segun,area,legajo_en)',
                    )
                    .order('comprobante_id')
                    .order('orden_compra_id'),
            ),
        ]);
        if (docs.isErr()) return err(docs.error);
        const suppliers = bySupplier(links.unwrapOr([]));
        const soles = (d: Row) => Number(d.total ?? 0) * (d.moneda === 'USD' ? 3.75 : 1);
        const rank = (d: Row) => (d.sin_oc_senal === 'ALTA' ? 0 : 1);
        const list = docs.value
            .slice()
            .sort(
                (a, z) =>
                    rank(a) - rank(z) ||
                    soles(z) - soles(a) ||
                    s(a.emisor_ruc).localeCompare(s(z.emisor_ruc)) ||
                    s(a.serie).localeCompare(s(z.serie)) ||
                    s(a.numero).localeCompare(s(z.numero)),
            )
            .map((d): NoOcInvoice => {
                const x = suppliers.get(s(d.emisor_ruc));
                const buyer = x ? ([...x.buyers].sort((a, z) => z[1] - a[1])[0]?.[0] ?? '').split('\u0001')[1] : '';
                return {
                    signal: s(d.sin_oc_senal),
                    reason: s(d.sin_oc_razon),
                    likelyArea: s(d.area_probable),
                    likelyBuyer: nameCase(s(buyer)),
                    issuedOn: s(d.fecha_emision),
                    ruc: s(d.emisor_ruc),
                    name: nameCase(s((d.emisor as Row | null)?.razon_social)),
                    number: `${s(d.serie)}-${s(d.numero)}`,
                    currency: s(d.moneda) || 'PEN',
                    total: Number(d.total) || 0,
                    supplierOcs: x ? [...x.ocs].sort().join(', ') : '',
                    pdf: s(d.pdf_drive_id),
                };
            });
        return ok({ noOc: list, readAt: now() });
    }

    // cambio has no company column: v2 holds INROPRIN only (one company, 001_nucleo.sql).
    async readChanges(companyRuc: string): Promise<Result<ChangesRead, SourceError>> {
        void companyRuc;
        const r = await one<Row>('cambio (carpetas)', (c) =>
            c
                .from('cambio')
                .select('clave,tipo,despues,detalle,ocurrido_en')
                .eq('entidad', 'carpeta_oc')
                .order('ocurrido_en', { ascending: false })
                .order('id', { ascending: false })
                .limit(500),
        );
        return r.map((rows) => ({
            changes: rows.map((c): FolderChange => {
                const d = (c.detalle ?? {}) as Row;
                return {
                    at: s(c.ocurrido_en),
                    isImport: d.procedencia === 'IMPORTACION',
                    oc: s(d.oc),
                    type: sentenceCase(s(c.tipo)),
                    detail: s(c.despues),
                    folderId: s(c.clave),
                };
            }),
            readAt: now(),
        }));
    }

    readFolder(companyRuc: string, folderId: string): Promise<Result<FolderDetail | null, SourceError>> {
        return readFolderDetail(companyRuc, folderId);
    }
}
