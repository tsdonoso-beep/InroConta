// The proofs and the invoices with detraction that have none, from the v2 tables. The proof points
// to its invoice (detraccion_constancia.comprobante_id, resolved when it is saved), so «is the
// invoice in the SIRE / the XML» is a join, not the text match detracciones_hoja and
// detracciones_sin_constancia redid on every read. The issued CRE are read too: an invoice with a
// detraction must not have a retention (R.S. 037-2002/SUNAT, art. 5), and that is the case
// «Con retención».
import 'server-only';
import { err, ok, type Result } from 'neverthrow';
import type { SourceError } from '../../../shared/errors.ts';
import { all } from '../../../shared/supabase/tables.ts';
import { nameCase } from '../../../shared/text.ts';
import type { DetractionsPort } from '../application/ports/DetractionsPort.ts';
import type { Detractions, MissingProof, Proof } from '../domain/entities/Proof.ts';
import { monthsFrom, proofCase } from '../domain/policies/cases.ts';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));
const name = (v: unknown) => nameCase(s((v as Row | null)?.razon_social));

/** The SIRE's line of the latest reading (registro_compras is one row per month). */
const latest = (lines: unknown) => ((lines as Row[] | null) ?? []).slice().sort((a, z) => s(z.ultima_vez).localeCompare(s(a.ultima_vez)))[0] as Row | undefined;

/** dd/mm/yyyy hh:mm:ss in Lima. */
const limaDateTime = (at: unknown) => {
    if (!at) return '';
    const p = Object.fromEntries(
        new Intl.DateTimeFormat('en-GB', {
            timeZone: 'America/Lima',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        })
            .formatToParts(new Date(String(at)))
            .map((x) => [x.type, x.value]),
    );
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
};

const DOC = 'id,total,moneda,detraccion_monto,detraccion_cuenta,pdf_drive_id,xml_estado,registro_compras(total,detraccion,ultima_vez)';

/** comprobante_id → the issued CRE that covers it («E001-2845»). */
type CreOf = Map<string, string>;

function proof(d: Row, since: string, creOf: CreOf): Proof {
    const k = d.comprobante as Row | null;
    const line = d.sentido === 'COMPRA' ? latest(k?.registro_compras) : undefined;
    const inXml = k?.xml_estado === 'OK';
    const xmlDet = inXml ? n(k!.detraccion_monto) : null;
    const invoiceDetraction = xmlDet ?? n(line?.detraccion);
    const period = s(d.periodo);
    const paidOn = s(d.fecha_pago);
    const monthsToPay = monthsFrom(period, paidOn);
    const retentionCre = creOf.get(s(d.comprobante_id)) ?? '';
    return {
        case: proofCase({
            period,
            since,
            deposited: n(d.monto),
            invoiceDetraction,
            inSire: !!line,
            inXml,
            xmlDetraction: xmlDet,
            monthsToPay,
            retained: !!retentionCre,
        }),
        period,
        direction: d.sentido === 'VENTA' ? 'venta' : 'compra',
        paidOn,
        monthsToPay,
        constancia: s(d.numero_constancia),
        docType: s(d.tipo),
        series: s(d.serie),
        number: s(d.numero),
        supplierRuc: s(d.emisor_ruc),
        supplierName: name(d.emisor),
        buyerDoc: s(d.adquiriente_ruc),
        buyerName: name(d.adquiriente),
        goodsCode: s(d.codigo_bien_servicio),
        deposited: n(d.monto),
        invoiceDetraction,
        invoiceIn: line && inXml ? 'SIRE y XML' : inXml ? 'XML' : line ? 'SIRE' : 'No encontrada',
        invoiceTotal: (inXml ? n(k!.total) : null) ?? n(line?.total),
        currency: s(k?.moneda),
        account: s(d.numero_cuenta),
        xmlAccount: inXml ? s(k!.detraccion_cuenta) : '',
        operation: s(d.numero_operacion),
        proofPdf: s(d.pdf_drive_id),
        proofHtml: s(d.html_drive_id),
        invoicePdf: inXml ? s(k!.pdf_drive_id) : '',
        paidAt: limaDateTime(d.fecha_hora_pago),
        retentionCre,
    };
}

const thisMonth = () => {
    const t = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    return Number(t.slice(0, 4)) * 12 + Number(t.slice(5, 7));
};

function missing(k: Row, source: 'XML' | 'SIRE', line: Row | undefined, now: number, creOf: CreOf): MissingProof {
    const issued = s(line?.fecha_emision ?? k.fecha_emision);
    const sale = k.origen === 'EMITIDO';
    return {
        direction: sale ? 'venta' : 'compra',
        period: s(source === 'SIRE' ? line?.periodo : k.periodo),
        issuedOn: issued,
        monthsSinceIssue: issued ? now - (Number(issued.slice(0, 4)) * 12 + Number(issued.slice(5, 7))) : null,
        ruc: s(sale ? k.receptor_ruc : k.emisor_ruc),
        name: name(sale ? k.receptor : k.emisor),
        docType: s(k.tipo),
        series: s(k.serie),
        number: s(k.numero),
        total: source === 'XML' ? n(k.total) : n(line?.total),
        currency: s(k.moneda) || 'PEN',
        detraction: source === 'XML' ? n(k.detraccion_monto) : n(line?.detraccion),
        source,
        invoicePdf: source === 'XML' ? s(k.pdf_drive_id) : '',
        retentionCre: creOf.get(s(k.id)) ?? '',
    };
}

export class SupabaseDetractionsAdapter implements DetractionsPort {
    async read(companyRuc: string, since: string): Promise<Result<Detractions, SourceError>> {
        const from = Number(since);
        const [proofs, xml, sire, cres] = await Promise.all([
            all<Row>('detraccion_constancia', (c) =>
                c
                    .from('detraccion_constancia')
                    .select(`*,emisor:emisor_ruc(razon_social),adquiriente:adquiriente_ruc(razon_social),comprobante(${DOC})`)
                    .eq('empresa_ruc', companyRuc)
                    .order('numero_constancia'),
            ),
            // Invoices whose XML declares a detraction.
            all<Row>('comprobante (detracción del XML)', (c) =>
                c
                    .from('comprobante')
                    .select(
                        'id,origen,periodo,fecha_emision,emisor_ruc,receptor_ruc,tipo,serie,numero,total,moneda,detraccion_monto,pdf_drive_id,emisor:emisor_ruc(razon_social),receptor:receptor_ruc(razon_social)',
                    )
                    .eq('empresa_ruc', companyRuc)
                    .eq('xml_estado', 'OK')
                    .gt('detraccion_monto', 0)
                    .gte('periodo', from)
                    .order('id'),
            ),
            // SIRE lines with a detraction (for the invoices without XML).
            all<Row>('registro_compras (detracción)', (c) =>
                c
                    .from('registro_compras')
                    .select(
                        'id,periodo,total,detraccion,ultima_vez,comprobante!inner(id,origen,periodo,fecha_emision,emisor_ruc,receptor_ruc,tipo,serie,numero,moneda,xml_estado,emisor:emisor_ruc(razon_social))',
                    )
                    .eq('empresa_ruc', companyRuc)
                    .gt('detraccion', 0)
                    .gte('periodo', from)
                    .order('id'),
            ),
            // The invoices an issued CRE covers (for «Con retención»).
            all<Row>('retencion_documento (CRE emitidos)', (c) =>
                c
                    .from('retencion_documento')
                    .select('comprobante_id,retencion_comprobante!inner(serie,numero,estado,empresa_ruc)')
                    .not('comprobante_id', 'is', null)
                    .eq('retencion_comprobante.estado', 'EMITIDO')
                    .eq('retencion_comprobante.empresa_ruc', companyRuc)
                    .order('retencion_id')
                    .order('tipo')
                    .order('serie')
                    .order('numero')
                    .order('numero_pago'),
            ),
        ]);
        if (proofs.isErr()) return err(proofs.error);
        if (xml.isErr()) return err(xml.error);
        if (sire.isErr()) return err(sire.error);
        if (cres.isErr()) return err(cres.error);
        const creOf: CreOf = new Map(
            cres.value.map((d) => {
                const r = d.retencion_comprobante as Row;
                return [s(d.comprobante_id), `${s(r.serie)}-${s(r.numero)}`];
            }),
        );

        const withProof = new Set(proofs.value.map((d) => d.comprobante_id).filter(Boolean));
        const now = thisMonth();
        const out: MissingProof[] = xml.value.filter((k) => !withProof.has(k.id)).map((k) => missing(k, 'XML', undefined, now, creOf));
        // One per invoice, its latest reading; only the ones without XML (those are above).
        const byDoc = new Map<string, Row>();
        for (const l of sire.value) {
            const k = l.comprobante as Row;
            if (k.xml_estado === 'OK' || withProof.has(k.id)) continue;
            const cur = byDoc.get(s(k.id));
            if (!cur || s(l.ultima_vez) > s(cur.ultima_vez)) byDoc.set(s(k.id), l);
        }
        for (const l of byDoc.values())
            out.push(missing(l.comprobante as Row, 'SIRE', { ...l, fecha_emision: (l.comprobante as Row).fecha_emision }, now, creOf));
        out.sort(
            (a, z) =>
                a.period.localeCompare(z.period) ||
                a.issuedOn.localeCompare(z.issuedOn) ||
                a.series.localeCompare(z.series) ||
                a.number.localeCompare(z.number),
        );

        const list = proofs.value
            .map((d) => proof(d, since, creOf))
            .sort((a, z) => z.period.localeCompare(a.period) || z.paidOn.localeCompare(a.paidOn) || a.constancia.localeCompare(z.constancia));
        return ok({ proofs: list, missing: out, since, readAt: new Date().toISOString() });
    }
}
