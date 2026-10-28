// The DETALLE lines (FilaDetalleCpe, one per item) from the v2 rows, column by column as the old
// chain built them in the base (detalle_cpe → _carpeta → _hoja → _con_detraccion → _con_retencion).
// One difference, on purpose: a document without XML (the SIRE has it, the XML is not downloaded,
// or it is a DUA) comes out as ONE line without item. Before, it had no line and never showed
// (tests/data/facturas.test.mts, 19/10/2026).
import { costCentreSource, documentsText } from '../drive/folder-texts.ts';
import { placasEnTexto } from '../sunat/placa.ts';
import { detractionIssue } from './detraction-codes.ts';
import type { DetailSource, Row } from './detail-v2-read.ts';
import type { FilaDetalleCpe } from './items-sunat.ts';

const s = (v: unknown) => (v == null || v === '' ? null : String(v));
const n = (v: unknown) => (v == null || v === '' ? null : Number(v));
const round2 = (x: number) => (Math.sign(x) * Math.round(Math.abs(x) * 100 + 1e-9)) / 100;
const fileUrl = (id: unknown) => (id ? `https://drive.google.com/file/d/${id}/view` : null);
const folderUrl = (id: unknown) => (id ? `https://drive.google.com/drive/folders/${id}` : null);
/** string_agg(distinct …, ' / '): the distinct values, sorted, or null. */
const joined = (values: unknown[]) => {
    // Sorted as Postgres sorted them (Spanish collation: «ÁREA» before «PROY»).
    const set = [...new Set(values.map(s).filter((v): v is string => !!v))].sort((x, y) => x.localeCompare(y, 'es'));
    return set.length ? set.join(' / ') : null;
};
function by(rows: Row[], key: string): Map<string, Row[]> {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
        const k = String(r[key] ?? '');
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(r);
    }
    return m;
}

/** The legajo in words: from the folder if the walk saw it; if not, from the approvals table (texto_del_legajo). */
function folderLegajo(f: Row): string {
    if (f.estado === 'OK') return 'Completo';
    if (f.estado === 'VACIA') return 'Carpeta vacía';
    return `Falta: ${((f.le_falta as string[] | null) ?? []).join(', ') || '—'}`;
}
function tableLegajo(o: Row): string | null {
    const st = String(o.legajo_revision ?? '');
    if (!o.legajo_en || !st) return null;
    if (/^PENDIENTE/.test(st)) return 'Por revisar';
    if (/^SIN ACCESO/.test(st)) return 'Sin acceso a la carpeta';
    if (/^SIN CARPETA/.test(st)) return 'Sin enlace de carpeta';
    const lacks = ((o.legajo_le_falta as string[] | null) ?? []).join(', ');
    return lacks ? `Falta: ${lacks}` : 'Completo';
}

/** What the OCs tied to a document say of it (the vinc and info blocks of the old chain). */
function ocColumns(links: Row[], orders: Map<string, Row>, foldersOf: Map<string, Row[]>) {
    const ocs: Row[] = [];
    const folders: Row[] = [];
    const folderIds: unknown[] = [];
    const files: Row[] = [];
    for (const l of links) {
        const o = orders.get(String(l.orden_compra_id));
        if (!o) continue;
        ocs.push(o);
        const a = l.archivo as Row | null;
        if (a) files.push(a);
        const own = foldersOf.get(String(o.id)) ?? [];
        // Its folder: the one of the file that proved it, or the OC's only folder.
        const f = own.length === 1 ? own[0] : own.find((x) => x.drive_id === a?.carpeta_id);
        if (f) folders.push(f);
        folderIds.push(a?.carpeta_id ?? (own.length === 1 ? own[0].drive_id : null));
    }
    if (!ocs.length) return {};
    const cc = (o: Row) => o.centro_costo as Row | null;
    const ccText = (o: Row) => {
        const c = cc(o);
        if (!c) return null;
        // The code without the stray spaces some sheets type («PROY-2024- 032»).
        return c.es_area || c.codigo === c.nombre || c.codigo === '-'
            ? s(c.nombre)
            : [String(c.codigo).replace(/\s+/g, ''), c.nombre].filter(Boolean).join(' ');
    };
    const centroCostoCg = joined(ocs.map(ccText));
    const legajos = folders.length ? folders.map(folderLegajo) : ocs.map(tableLegajo);
    return {
        ocCarpeta: joined(ocs.map((o) => o.codigo)),
        centroCostoCg,
        codigoConcar: joined(ocs.map((o) => cc(o)?.concar_codigo)),
        archivoOc: joined(files.map((a) => a.nombre)),
        archivoOcUrl: joined(files.map((a) => fileUrl(a.drive_id))),
        situacionPagoOc: joined(ocs.map((o) => (o.legajo_en ? o.situacion_pago : null))),
        compradorOc: joined(ocs.map((o) => (o.comprador_segun === 'LEGAJO' ? o.comprador : null))),
        areaOc: joined(ocs.map((o) => (o.legajo_en ? o.area : null))),
        legajoOc: joined(legajos),
        carpetaOcUrl: joined(folderIds.map(folderUrl)),
        proyectoOc: joined(folders.map((f) => f.proyecto_carpeta)),
        centroCostoSegun: centroCostoCg
            ? (joined(ocs.map((o) => costCentreSource(s(o.centro_costo_segun), o.procedencia === 'IMPORTACION'))) ?? 'Control de Gestión')
            : null,
        documentosOc: joined(folders.map((f) => documentsText(f.documentos as Record<string, number> | null, false))),
    };
}

/** The tax split, the exchange rate and the total in soles (detalle_cpe_hoja): the SIRE's if it declared it, the XML's if not. */
function taxColumns(d: Row, line: Row | undefined) {
    const total = n(d.total) ?? n(line?.total);
    const rate = d.moneda === 'PEN' ? 1 : ((n(line?.tipo_cambio) !== 1 ? n(line?.tipo_cambio) : null) ?? n(d.tipo_cambio));
    let base: number | null = null,
        igv: number | null = null,
        untaxed: number | null = null,
        segun: string | null = null;
    if (line && d.origen === 'RECIBIDO' && n(line.total) !== null) {
        base = (n(line.base_dg) ?? 0) + (n(line.base_dgng) ?? 0) + (n(line.base_dng) ?? 0);
        igv = (n(line.igv_dg) ?? 0) + (n(line.igv_dgng) ?? 0) + (n(line.igv_dng) ?? 0);
        untaxed = round2(n(line.total)! - base - igv);
        segun = 'SIRE';
    } else if (n(d.igv) !== null) {
        igv = n(d.igv)!;
        base = Math.min(round2(igv / 0.18), n(d.subtotal) ?? igv / 0.18);
        untaxed = Math.max(round2((n(d.subtotal) ?? 0) - base), 0);
        segun = 'XML (IGV al 18%)';
    }
    return {
        total,
        baseGravada: base,
        igvComprobante: igv,
        noGravado: untaxed,
        desgloseSegun: segun,
        tipoCambio: rate,
        totalSoles: total !== null && rate !== null ? round2(total * rate) : null,
    };
}

const byPayment = (a: Row, z: Row) => String(z.fecha_pago ?? '').localeCompare(String(a.fecha_pago ?? ''));

function proofColumns(proofs: Row[], detraction: number | null, rate: number | null) {
    if (!proofs.length) return { detraccionConstanciaEstado: (detraction ?? 0) > 0 || (rate ?? 0) > 0 ? 'Falta constancia' : '' };
    const sorted = [...proofs].sort(
        (a, z) =>
            String(a.fecha_pago ?? '').localeCompare(String(z.fecha_pago ?? '')) || String(a.numero_constancia).localeCompare(String(z.numero_constancia)),
    );
    const deposited = round2(sorted.reduce((t, p) => t + (n(p.monto) ?? 0), 0));
    const latest = [...sorted].reverse();
    return {
        detraccionConstancia: sorted.map((p) => String(p.numero_constancia)).join(' / '),
        detraccionFechaPago: s(latest[0]?.fecha_pago),
        detraccionDepositado: deposited,
        detraccionPdf: fileUrl(latest.find((p) => p.pdf_drive_id)?.pdf_drive_id),
        detraccionHtml: fileUrl(latest.find((p) => p.html_drive_id)?.html_drive_id),
        detraccionConstanciaEstado: (detraction ?? 0) > 0 && Math.abs(deposited - detraction!) > 1 ? 'Revisar monto' : 'Con constancia',
    };
}

function withholdingColumns(rows: Row[], hasDetraction: boolean) {
    const ret = rows.filter((r) => (r.retencion as Row | null)?.sentido === 'COMPRA');
    if (!ret.length) return { retencionEstado: '' };
    const cre = (r: Row) => r.retencion as Row;
    const issued = ret.filter((r) => cre(r).estado === 'EMITIDO').sort((a, z) => byPayment(a, z) || Number(cre(z).numero) - Number(cre(a).numero));
    const reversed = ret.some((r) => cre(r).estado === 'REVERTIDO');
    const state = issued.length && reversed ? 'Emitido y revertido' : issued.length ? 'Emitido' : 'Revertido';
    return {
        retencionComprobante: joined(ret.map((r) => `${cre(r).serie}-${cre(r).numero}`)),
        retencionFechaPago: s(issued[0]?.fecha_pago),
        retencionMonto: issued.length ? round2(issued.reduce((t, r) => t + (n(r.monto_retenido) ?? 0), 0)) : null,
        retencionPdf: fileUrl(issued.find((r) => cre(r).pdf_drive_id) && cre(issued.find((r) => cre(r).pdf_drive_id)!).pdf_drive_id),
        retencionXml: fileUrl(issued.find((r) => cre(r).xml_drive_id) && cre(issued.find((r) => cre(r).xml_drive_id)!).xml_drive_id),
        retencionEstado: state + (issued.length && hasDetraction ? ' · revisar: también tiene detracción' : ''),
    };
}

export function detailLinesFromV2(src: DetailSource): FilaDetalleCpe[] {
    const items = by(src.items, 'comprobante_id');
    const links = by(src.links, 'comprobante_id');
    const proofs = by(src.proofs, 'comprobante_id');
    const withholdings = by(src.withholdings, 'comprobante_id');
    const orders = new Map(src.orders.map((o) => [String(o.id), o]));
    const foldersOf = by(src.folders, 'orden_compra_id');
    // The SIRE's latest reading of each document (registro_compras is one row per month).
    const sire = new Map<string, Row>();
    for (const l of src.sire) {
        const k = String(l.comprobante_id);
        if (!sire.has(k) || String(l.ultima_vez) > String(sire.get(k)!.ultima_vez)) sire.set(k, l);
    }

    const out: FilaDetalleCpe[] = [];
    for (const d of src.docs) {
        const id = String(d.id);
        const tax = taxColumns(d, sire.get(id));
        const oc = ocColumns(links.get(id) ?? [], orders, foldersOf);
        const detraction = n(d.detraccion_monto),
            rate = n(d.detraccion_porcentaje);
        const proof = proofColumns(proofs.get(id) ?? [], detraction, rate);
        const lines = items.get(id) ?? [{ linea: null }];
        // The XML's own (015), and for the XML read before it, what the descriptions say.
        const plates = [...new Set([...String(d.placa ?? '').split(' / '), ...placasEnTexto(...lines.map((i) => s(i.descripcion)))].filter(Boolean))];
        const head = {
            periodo: s(d.periodo),
            origen: s(d.origen),
            proveedorRuc: s(d.emisor_ruc),
            proveedorNombre: s((d.emisor as Row | null)?.razon_social),
            tipoComprobante: s(d.tipo),
            serie: s(d.serie),
            numero: s(d.numero),
            fechaEmision: s(d.fecha_emision),
            moneda: s(d.moneda),
            totalComprobante: tax.total,
            enlacePdf: fileUrl(d.pdf_drive_id),
            enlaceXml: fileUrl(d.xml_drive_id),
            formaPago: s(d.forma_pago),
            guiaRemision: s(d.guia_remision),
            ordenCompra: s(d.orden_compra_xml),
            documentoRelacionado: s(d.documento_relacionado),
            tipoDocumentoRelacionado: s(d.documento_relacionado_tipo),
            anticipoAplicado: n(d.anticipo_aplicado),
            detraccionPorcentaje: rate,
            detraccionMonto: detraction,
            detraccionCuentaBanco: s(d.detraccion_cuenta),
            detraccionCodigoBienServicio: s(d.detraccion_codigo),
            placa: plates.join(' / ') || null,
            ...oc,
            baseGravada: tax.baseGravada,
            igvComprobante: tax.igvComprobante,
            noGravado: tax.noGravado,
            desgloseSegun: tax.desgloseSegun,
            tipoCambio: tax.tipoCambio,
            totalSoles: tax.totalSoles,
            detraccionRevisar: detractionIssue(rate, s(d.detraccion_codigo)),
            ...proof,
            ...(d.origen === 'RECIBIDO'
                ? withholdingColumns(withholdings.get(id) ?? [], (detraction ?? 0) > 0 || !!proof.detraccionConstancia)
                : { retencionEstado: '' }),
        };
        for (const i of lines)
            out.push({
                ...head,
                linea: n(i.linea),
                descripcion: s(i.descripcion),
                cantidad: n(i.cantidad),
                unidad: s(i.unidad),
                precioUnitario: n(i.precio_unitario),
                importe: n(i.importe),
            } as FilaDetalleCpe);
    }
    const key = (f: FilaDetalleCpe) =>
        [f.fechaEmision ?? '9999', f.serie ?? '', String(f.numero ?? '').padStart(12, '0'), String(f.linea ?? 0).padStart(6, '0')].join('|');
    return out.sort((a, z) => (key(a) < key(z) ? -1 : key(a) > key(z) ? 1 : 0));
}
