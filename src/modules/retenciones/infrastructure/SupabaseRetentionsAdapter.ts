// The CRE INROPRIN issued (retencion_comprobante, sentido COMPRA) with the invoices they cover
// (retencion_documento) from the v2 tables, in one request. The invoice's detraction is what tells
// an invoice with both apart: the one its XML declares or, without one, its SIRE line; and when
// neither declares it, what was deposited for it (a SPOT proof is a detraction too: F002-1117 of
// 21/10/2026 had a proof and a CRE, and its XML said nothing).
import 'server-only';
import { ok, type Result } from 'neverthrow';
import type { SourceError } from '../../../shared/errors.ts';
import { all } from '../../../shared/supabase/tables.ts';
import { nameCase } from '../../../shared/text.ts';
import type { RetentionsPort } from '../application/ports/RetentionsPort.ts';
import type { Retention, RetentionDoc, Retentions } from '../domain/entities/Retention.ts';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));

const SELECT =
    'serie,numero,fecha_emision,periodo,receptor_ruc,monto_base,monto_retenido,monto_pagado,estado,fecha_reversion,motivo_reversion,pdf_drive_id,xml_drive_id,' +
    'receptor:receptor_ruc(razon_social),' +
    'retencion_documento(serie,numero,fecha_emision,total,moneda,fecha_pago,monto_pagado,monto_retenido,' +
    'comprobante(xml_estado,detraccion_monto,pdf_drive_id,registro_compras(detraccion),detraccion_constancia(monto)))';

/** The XML's detraction, else the highest of its SIRE lines, else what its SPOT proofs deposited (null: none). */
function detractionOf(k: Row | null): number | null {
    if (!k) return null;
    const declared =
        k.xml_estado === 'OK' && k.detraccion_monto != null
            ? n(k.detraccion_monto)
            : Math.max(0, ...((k.registro_compras as Row[] | null) ?? []).map((l) => n(l.detraccion) ?? 0));
    if (declared) return declared;
    const deposited = ((k.detraccion_constancia as Row[] | null) ?? []).reduce((a, d) => a + (n(d.monto) ?? 0), 0);
    return deposited || null;
}

function doc(d: Row): RetentionDoc {
    const k = d.comprobante as Row | null;
    return {
        number: `${s(d.serie)}-${s(d.numero)}`,
        issuedOn: s(d.fecha_emision),
        total: n(d.total),
        currency: s(d.moneda) || 'PEN',
        paidOn: s(d.fecha_pago),
        paid: n(d.monto_pagado),
        retained: n(d.monto_retenido),
        found: !!k,
        detraction: detractionOf(k),
        invoicePdf: s(k?.pdf_drive_id),
    };
}

function retention(r: Row): Retention {
    return {
        cre: `${s(r.serie)}-${s(r.numero)}`,
        issuedOn: s(r.fecha_emision),
        period: s(r.periodo),
        supplierRuc: s(r.receptor_ruc),
        supplierName: nameCase(s((r.receptor as Row | null)?.razon_social)),
        base: n(r.monto_base),
        retained: n(r.monto_retenido),
        paid: n(r.monto_pagado),
        status: r.estado === 'REVERTIDO' ? 'REVERTIDO' : 'EMITIDO',
        revertedOn: s(r.fecha_reversion),
        revertReason: s(r.motivo_reversion),
        pdf: s(r.pdf_drive_id),
        xml: s(r.xml_drive_id),
        docs: ((r.retencion_documento as Row[] | null) ?? []).map(doc).sort((a, b) => a.number.localeCompare(b.number, 'es', { numeric: true })),
    };
}

export class SupabaseRetentionsAdapter implements RetentionsPort {
    async read(companyRuc: string): Promise<Result<Retentions, SourceError>> {
        const rows = await all<Row>('retencion_comprobante', (c) =>
            c.from('retencion_comprobante').select(SELECT).eq('empresa_ruc', companyRuc).eq('sentido', 'COMPRA').order('serie').order('numero'),
        );
        return rows.andThen((list) => ok({ retentions: list.map(retention), readAt: new Date().toISOString() }));
    }
}
