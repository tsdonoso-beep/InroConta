// One document per invoice, from the detail lines (one per item).
//
// The port of the «docs» part of datosCompactosVista_ (apps-script/inroconta/VistaEjecutiva.gs).
// Same rules, so the app and the Apps Script view cannot disagree: tests/unit/modules proves it
// on the same tab.
import { fechaCorta, nombreDeTipo } from '../../../../shared/lib/export/comprobantes-sunat.ts';
import type { FilaDetalleCpe } from '../../../../shared/lib/export/items-sunat.ts';
import { nameCase, sentenceCase } from '../../../../shared/text.ts';
import { driveId, kindOf, type Doc, type Origin } from '../entities/Doc.ts';

const round2 = (n: number) => Math.round(n * 100) / 100;
const signed = (isNote: boolean, n: number | null | undefined) => (n == null || isNaN(n) ? null : round2((isNote ? -1 : 1) * Math.abs(n)));
const text = (v: string | null | undefined) => (v ?? '').trim();

const ORIGIN: Record<string, Origin> = { RECIBIDO: 'compra', EMITIDO: 'venta' };

export function documentsFromLines(rows: FilaDetalleCpe[]): Doc[] {
    const seen = new Set<string>();
    const docs: Doc[] = [];
    for (const f of rows) {
        if (!f.proveedorRuc && !f.serie) continue;
        const typeName = nombreDeTipo(f.tipoComprobante);
        const origin = ORIGIN[f.origen ?? ''] ?? 'otro';
        const key = [f.proveedorRuc, typeName, f.serie, f.numero, origin].join('|');
        if (seen.has(key)) continue;
        seen.add(key);

        const kind = kindOf(typeName);
        const isNote = kind === 'C';
        const currency = text(f.moneda) || 'PEN';
        const oc = text(f.ocCarpeta);
        const proofStatus = text(f.detraccionConstanciaEstado);
        docs.push({
            period: text(f.periodo),
            origin,
            ruc: text(f.proveedorRuc),
            name: nameCase(f.proveedorNombre),
            kind,
            currency,
            total: round2((isNote ? -1 : 1) * Math.abs(f.totalComprobante ?? 0)),
            detraction: round2(f.detraccionMonto ?? 0),
            oc,
            ocLegajo: text(f.legajoOc),
            ocPayment: sentenceCase(f.situacionPagoOc),
            ocFolder: driveId(f.carpetaOcUrl),
            costCenter: text(f.centroCostoCg) === '-' ? '' : nameCase(f.centroCostoCg),
            isImport: /COMEX|IMPORTA/i.test(text(f.areaOc)) || oc.split(' / ').some((o) => /^\d{3}-\d{4}$/.test(o.trim())),
            number: `${text(f.serie).toUpperCase()}-${text(f.numero).replace(/^0+(?=\d)/, '')}`,
            issuedOn: fechaCorta(f.fechaEmision),
            pdf: driveId(f.enlacePdf),
            xml: driveId(f.enlaceXml),
            totalPen: signed(isNote, currency === 'PEN' ? f.totalComprobante : f.totalSoles),
            taxBase: signed(isNote, f.baseGravada),
            igv: signed(isNote, f.igvComprobante),
            untaxed: signed(isNote, f.noGravado),
            detractionIssue: text(f.detraccionRevisar),
            exchangeRate: currency === 'PEN' ? 1 : (f.tipoCambio ?? null),
            detractionProof:
                text(f.detraccionConstancia) || proofStatus
                    ? {
                          constancia: text(f.detraccionConstancia),
                          paidOn: fechaCorta(f.detraccionFechaPago ?? null),
                          deposited: f.detraccionDepositado ?? null,
                          pdf: driveId(f.detraccionPdf),
                          html: driveId(f.detraccionHtml),
                          status: proofStatus,
                      }
                    : null,
        });
    }
    return docs;
}
