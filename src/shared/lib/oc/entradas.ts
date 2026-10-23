// The v2 rows as the inputs of the links (vinculos.ts): each walk's sighting of each file, the
// invoices with their SIRE amount, and what CG and the approvals table say of each order.

import type { Invoice, OrderFacts, Sighting } from './vinculos.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const split = (v: unknown) =>
    String(v ?? '')
        .split(' / ')
        .map((x) => x.trim())
        .filter(Boolean);

/** oc_normalizada(): any «172-2026» or «2026-172» → «0172-2026» (the capture padded every OC to 4 digits). */
export function normalizedOc(v: string): string | null {
    let m = /(\d{1,6})\s*-\s*(20\d\d)(?!\d)/.exec(v);
    if (m) return `${String(Number(m[1])).padStart(4, '0')}-${m[2]}`;
    m = /(20\d\d)\s*-\s*(\d{1,6})(?!\d)/.exec(v);
    return m ? `${String(Number(m[2])).padStart(4, '0')}-${m[1]}` : null;
}

const folderOf = (url: unknown) => /\/folders\/([\w-]+)/.exec(String(url ?? ''))?.[1] ?? null;

/** The orders by id and by «PROCEDENCIA|numero|anio». */
export function indexOrders(orders: Row[]) {
    const byId = new Map(orders.map((o) => [o.id as string, o]));
    const byKey = new Map(orders.map((o) => [`${o.procedencia}|${o.numero}|${o.anio}`, o]));
    const find = (procedencia: string, code: string | null) => {
        const m = /^\s*0*(\d+(?:\.\d+)?)-(\d{4})\s*$/.exec(code ?? '');
        return m ? byKey.get(`${procedencia}|${m[1]}|${m[2]}`) : undefined;
    };
    return { byId, find };
}

/**
 * Each walk's sighting of each file. The folder walk's OC is its folder's; the approvals table's
 * and the retired capture's, the one they wrote (archivo.origenes, frozen since the move) or, for a
 * file the legajo walk saves from now on, its folder's.
 */
export function sightings(files: Row[], folders: Row[], orders: Row[], approvalRows: Row[]): Sighting[] {
    const { byId, find } = indexOrders(orders);
    const folder = new Map(folders.map((f) => [f.drive_id as string, f]));
    const approvalRucs = new Map<string, string[]>();
    for (const l of approvalRows) approvalRucs.set(l.orden_compra_id, [...(approvalRucs.get(l.orden_compra_id) ?? []), ...split(l.proveedor_ruc)]);
    for (const o of orders) if (o.datos_segun === 'LEGAJO' && o.proveedor_ruc) approvalRucs.set(o.id, [...(approvalRucs.get(o.id) ?? []), o.proveedor_ruc]);

    const out: Sighting[] = [];
    for (const a of files) {
        const f = folder.get(a.carpeta_id);
        const own = f?.orden_compra_id ? byId.get(f.orden_compra_id) : undefined;
        const seen = (Array.isArray(a.origenes) ? a.origenes : []) as Row[];
        // The RUCs in the name (db:mudanza left the folder walk's in origenes; the walk fills the column).
        const named = (a.rucs_en_nombre ?? []) as string[];
        const inFolderName = [...named, ...seen.filter((s) => s.origen === 'CARPETA').flatMap((s) => split(s.proveedor_ruc_cg))];
        const file = {
            fileId: a.drive_id as string,
            name: (a.nombre ?? '') as string,
            parece: a.parece ?? null,
            serieInName: a.serie_en_nombre ?? null,
            read: a.lectura_estado === 'LEIDO' ? { ruc: a.leido_ruc ?? null, serie: a.leido_serie ?? null } : null,
        };
        // What an old walk said of the file itself (its own reading, before v2 kept one per file).
        const asSaid = (s: Row) => ({
            ...file,
            name: s.nombre ?? file.name,
            parece: s.parece ?? file.parece,
            serieInName: s.serie_en_nombre ? String(s.serie_en_nombre).toUpperCase() : null,
            read: /^LE[IÍ]DO$/.test(s.estado_lectura ?? '')
                ? { ruc: s.ruc_leido || null, serie: s.serie_leida ? String(s.serie_leida).toUpperCase() : null }
                : null,
        });
        const add = (origin: Sighting['origin'], o: Row | undefined, folderId: string | null, rucs: string[], what = file, ocCode?: string) => {
            if (o) out.push({ ...what, origin, orderId: o.id, ocCode: ocCode ?? o.codigo, folderId, rucs: [...new Set(rucs)] });
        };
        if (a.visto_carpeta_en && f?.visto_carpeta_en) add('CARPETA', own, a.carpeta_id, [...inFolderName, ...(own ? (approvalRucs.get(own.id) ?? []) : [])]);
        if (a.visto_legajo_en) {
            const old = seen.filter((s) => s.origen === 'LEGAJO');
            // The approvals table's RUC counts as the folder's (the old base's proveedor_ruc_cg).
            if (!old.length) add('LEGAJO', own, a.carpeta_id, [...named, ...(own ? (approvalRucs.get(own.id) ?? []) : [])]);
            for (const s of old)
                for (const code of split(s.oc))
                    add('LEGAJO', find(/^\d{3}-/.test(code) ? 'IMPORTACION' : 'NACIONAL', code), folderOf(s.carpeta_url), split(s.proveedor_ruc_cg), asSaid(s));
        }
        // The retired capture read CG's links and padded every OC to 4 digits, imports too: the
        // procedencia comes from the folder it followed (as db:mudanza did), else national first.
        if (a.visto_captura_en)
            for (const s of seen.filter((x) => x.origen === 'CAPTURA')) {
                const proc = folder.get(folderOf(s.carpeta_url) ?? '')?.procedencia as string | undefined;
                for (const code of split(s.oc).map(normalizedOc))
                    if (code)
                        add(
                            'CAPTURA',
                            proc ? find(proc, code) : (find('NACIONAL', code) ?? find('IMPORTACION', code)),
                            folderOf(s.carpeta_url),
                            split(s.proveedor_ruc_cg),
                            asSaid(s),
                            code,
                        );
            }
    }
    return out;
}

/** The invoices, with the amount the SIRE declared when there is no XML. */
export function invoicesOf(rows: Row[], register: Row[]): Invoice[] {
    const sire = new Map<string, number>();
    for (const r of register) if (r.total !== null) sire.set(r.comprobante_id, Number(r.total)); // ordered by periodo: the last month wins
    return rows.map((c) => ({
        id: c.id,
        ruc: c.emisor_ruc,
        tipo: c.tipo,
        serie: c.serie,
        numero: c.numero,
        issuedOn: c.fecha_emision ?? null,
        total: sire.get(c.id) ?? (c.total === null ? null : Number(c.total)),
        currency: c.moneda ?? null,
    }));
}

/** What CG and the approvals table say of each order (by id). */
export function orderFacts(orders: Row[], costCentreRows: Row[], approvalRows: Row[]): Map<string, OrderFacts> {
    const cc = new Map<string, Row[]>();
    for (const r of costCentreRows) cc.set(r.orden_compra_id, [...(cc.get(r.orden_compra_id) ?? []), r]);
    const approvals = new Map<string, number>();
    for (const l of approvalRows) approvals.set(l.orden_compra_id, (approvals.get(l.orden_compra_id) ?? 0) + 1);
    const out = new Map<string, OrderFacts>();
    for (const o of orders) {
        const rows = cc.get(o.id) ?? [];
        const lines = rows.flatMap((r) => (Array.isArray(r.lineas_cg) ? r.lineas_cg : [])) as Row[];
        const amounts = rows.map((r) => r.monto).filter((m) => m !== null);
        const byLines = [...lines].sort((a, z) => Number(z.lineas ?? 0) - Number(a.lineas ?? 0));
        const dates = lines
            .map((l) => l.fecha_oc)
            .filter(Boolean)
            .sort();
        const rucs = [...new Set(lines.map((l) => l.proveedor_ruc).filter(Boolean))] as string[];
        out.set(o.id, {
            isImport: o.procedencia === 'IMPORTACION',
            cg: rows.length
                ? {
                      costCentres: rows.length,
                      firstDate: lines.length ? (dates[0] ?? null) : (o.fecha_oc ?? null),
                      amount: amounts.length ? Math.round(amounts.reduce((s, m) => s + Number(m), 0) * 100) / 100 : null,
                      currency: lines.length ? (byLines[0]?.moneda ?? null) : (o.moneda ?? null),
                      rucs: lines.length ? rucs : o.proveedor_ruc ? [o.proveedor_ruc] : [],
                  }
                : null,
            approvals: o.legajo_en
                ? {
                      rows: Math.max(1, approvals.get(o.id) ?? 0),
                      hasCostCentre: o.centro_costo_segun === 'LEGAJO',
                      paymentStatus: o.situacion_pago ?? null,
                      buyer: o.comprador_segun === 'LEGAJO' ? (o.comprador ?? null) : null,
                      area: o.area ?? null,
                  }
                : null,
            folderCcSource: o.centro_costo_segun === 'LEGAJO' ? 'CUADRO' : (o.centro_costo_segun ?? null),
        });
    }
    return out;
}
