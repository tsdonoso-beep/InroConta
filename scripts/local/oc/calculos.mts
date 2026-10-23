// What the old base recalculated on every read (vinculos_oc, facturas_sin_oc), computed once here
// from the v2 tables and saved with guardar_calculos_oc: the invoice ↔ OC links and the «factura
// sin OC» signal of every received invoice. Company-wide: every walk's files count.

import { indexOrders, invoicesOf, orderFacts, sightings } from '../../../src/shared/lib/oc/entradas.ts';
import { invoicesWithoutOc, type NoOc, type SupplierLinks } from '../../../src/shared/lib/oc/sin-oc.ts';
import { linkInvoices, type Link } from '../../../src/shared/lib/oc/vinculos.ts';
import type { Row, State } from './estado.mts';

/** facturas_sin_oc() looked at the facturas from this date. */
export const NO_OC_SINCE = '2026-01-01';

export interface Calculations {
    links: Link[];
    noOc: NoOc[];
    /** p_vinculos and p_sin_oc of guardar_calculos_oc. */
    vinculos: Row[];
    sinOc: Row[];
}

export function calculate(s: State): Calculations {
    const facts = orderFacts(s.orders, s.costCentreRows, s.approvalRows);
    const invoices = invoicesOf(s.invoices, s.register);
    const links = linkInvoices(sightings(s.files, s.folders, s.orders, s.approvalRows), invoices, facts);

    const { byId } = indexOrders(s.orders);
    const invoice = new Map(s.invoices.map((c) => [c.id as string, c]));
    const linked = new Set([...links.map((l) => l.invoiceId), ...s.manualLinks.map((m) => m.comprobante_id as string)]);

    // The supplier's links: who bought, and the procedencia of each folder of its OCs.
    const foldersOf = new Map<string, boolean[]>();
    for (const f of s.folders)
        if (f.visto_carpeta_en && f.orden_compra_id)
            foldersOf.set(f.orden_compra_id, [...(foldersOf.get(f.orden_compra_id) ?? []), f.procedencia === 'IMPORTACION']);
    const bySupplier = new Map<string, SupplierLinks>();
    for (const l of links) {
        const ruc = invoice.get(l.invoiceId)!.emisor_ruc as string;
        const x = bySupplier.get(ruc) ?? { who: [], folders: [] };
        x.who.push({ buyer: l.buyer, area: l.area });
        x.folders.push(...(foldersOf.get(l.orderId) ?? []));
        bySupplier.set(ruc, x);
    }
    const names = new Map<string, string>();
    for (const r of s.register) if (r.proveedor_nombre) names.set(r.comprobante_id, r.proveedor_nombre);
    const received = s.invoices
        // Only those with their XML (the old function read cpe_comprobante, the downloaded ones).
        .filter((c) => c.tipo === '01' && c.xml_estado === 'OK' && c.fecha_emision && c.fecha_emision >= NO_OC_SINCE)
        .map((c) => ({
            id: c.id as string,
            ruc: c.emisor_ruc as string,
            name: (c.emisor_nombre ?? names.get(c.id) ?? null) as string | null,
            total: c.total === null ? null : Number(c.total),
            currency: c.moneda ?? null,
        }));
    const manual = new Map(s.noOcSuppliers.map((p) => [p.proveedor_ruc as string, p.motivo as string]));
    const noOc = invoicesWithoutOc(received, linked, bySupplier, manual);

    const key = (id: string) => {
        const c = invoice.get(id)!;
        return { emisor_ruc: c.emisor_ruc, tipo: c.tipo, serie: c.serie, numero: c.numero };
    };
    const order = (id: string) => ({ procedencia: byId.get(id)!.procedencia, oc: byId.get(id)!.codigo });
    const vinculos = [
        ...links.map((l) => ({ ...key(l.invoiceId), ...order(l.orderId), evidencia: l.evidence, archivo_id: l.fileId, principal: false, alertas: l.alerts })),
        // Links Contabilidad set by hand stay (p_completo deletes every link of the company).
        ...s.manualLinks
            .filter((m) => invoice.has(m.comprobante_id) && byId.has(m.orden_compra_id))
            .map((m) => ({
                ...key(m.comprobante_id),
                ...order(m.orden_compra_id),
                evidencia: 'MANUAL',
                archivo_id: m.archivo_id,
                principal: false,
                alertas: m.alertas ?? [],
            })),
    ];
    // Only the flagged ones are kept, as db:mudanza did (the column only takes ALTA or MEDIA).
    const sinOc = noOc.filter((n) => n.signal).map((n) => ({ ...key(n.invoiceId), senal: n.signal, razon: n.reason, area_probable: n.likelyArea }));
    return { links, noOc, vinculos, sinOc };
}
