// The proofs and the invoices without one, from the base, page by page (PostgREST hands 1000
// rows per request; both functions order their rows in a fixed way).
import 'server-only';
import { err, ok, type Result } from 'neverthrow';
import type { SourceError } from '../../../shared/errors.ts';
import { rpcAllRows } from '../../../shared/supabase/rpc.ts';
import { nameCase } from '../../../shared/text.ts';
import type { DetractionsPort } from '../application/ports/DetractionsPort.ts';
import type { Detractions, Direction, MissingProof, Proof } from '../domain/entities/Proof.ts';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));
const fileId = (url: unknown) => {
    const m = /\/d\/([\w-]{20,})/.exec(s(url)) || /[?&]id=([\w-]{20,})/.exec(s(url));
    return m ? m[1] : '';
};
const direction = (v: unknown): Direction => (v === 'Venta' ? 'venta' : 'compra');

const proof = (f: Row): Proof => ({
    case: s(f.caso),
    period: s(f.periodo),
    direction: direction(f.sentido),
    paidOn: s(f.fecha_pago),
    monthsToPay: n(f.meses_hasta_pago),
    constancia: s(f.numero_constancia),
    docType: s(f.tipo_comprobante),
    series: s(f.serie),
    number: s(f.numero),
    supplierRuc: s(f.proveedor_ruc),
    supplierName: nameCase(s(f.proveedor_nombre)),
    buyerDoc: s(f.adquiriente_numero),
    buyerName: nameCase(s(f.adquiriente_nombre)),
    goodsCode: s(f.codigo_bien_servicio),
    deposited: n(f.monto),
    invoiceDetraction: n(f.detraccion_factura),
    invoiceIn: s(f.factura_en),
    invoiceTotal: n(f.total_factura),
    currency: s(f.moneda),
    account: s(f.numero_cuenta),
    xmlAccount: s(f.cuenta_xml),
    operation: s(f.numero_operacion),
    proofPdf: fileId(f.pdf_constancia),
    proofHtml: fileId(f.html_constancia),
    invoicePdf: fileId(f.pdf_factura),
    paidAt: s(f.fecha_hora_pago),
});

const missing = (f: Row): MissingProof => ({
    direction: direction(f.sentido),
    period: s(f.periodo),
    issuedOn: s(f.fecha_emision),
    monthsSinceIssue: n(f.meses_desde_emision),
    ruc: s(f.ruc),
    name: nameCase(s(f.nombre)),
    docType: s(f.tipo_comprobante),
    series: s(f.serie),
    number: s(f.numero),
    total: n(f.total),
    currency: s(f.moneda) || 'PEN',
    detraction: n(f.detraccion),
    source: s(f.detraccion_segun),
    invoicePdf: fileId(f.pdf_factura),
});

export class SupabaseDetractionsAdapter implements DetractionsPort {
    async read(companyRuc: string, since: string): Promise<Result<Detractions, SourceError>> {
        const args = { p_empresa_ruc: companyRuc, p_desde: since };
        const [proofs, without] = await Promise.all([rpcAllRows<Row>('detracciones_hoja', args), rpcAllRows<Row>('detracciones_sin_constancia', args)]);
        if (proofs.isErr()) return err(proofs.error);
        if (without.isErr()) return err(without.error);
        return ok({ proofs: proofs.value.map(proof), missing: without.value.map(missing), since, readAt: new Date().toISOString() });
    }
}
