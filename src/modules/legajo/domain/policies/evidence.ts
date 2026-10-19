// What another source says about a document the folder lacks («it exists, only upload it»), and
// the texts the folder list shows. Before, evidencias_de_fuentes and carpetas_madre_fuentes did
// this in the base on every read; now the server builds it from the v2 rows of the OC.

/** A kardex voucher of the OC (vale_almacen). */
export interface Voucher {
    vale: string | null;
    fecha_operacion: string | null;
    fecha_registro: string | null;
    movimiento: string | null;
    operacion: string | null;
    tipo_documento: string | null;
    numero_documento: string | null;
    documento_url: string | null;
}

export interface Evidence {
    /** GUIA, DAM or COSTEO. */
    doc: string;
    evidencia: string;
    enlace: string | null;
    /** yyyy-mm-dd of the first entry (GUIA) or the first DUA (DAM). */
    fecha: string | null;
}

const dmy = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : 's/f');
const day = (v: Voucher) => v.fecha_operacion ?? v.fecha_registro;

/** The purchase entries of the warehouse: the guide is there even if the folder lacks it. */
export function warehouseEvidence(vouchers: Voucher[]): Evidence | null {
    const entries = vouchers
        .filter((v) => v.movimiento === 'INGRESO' && /(COMPRA|ORDEN DE SERVICIO)/.test(v.operacion ?? ''))
        .sort((a, z) => String(a.fecha_operacion ?? '9999').localeCompare(String(z.fecha_operacion ?? '9999')) || String(a.vale).localeCompare(String(z.vale)));
    if (!entries.length) return null;
    const text = entries
        .map(
            (v) =>
                `${(v.tipo_documento ?? '').startsWith('FACTURA') ? 'ingresó con factura ' : 'guía '}${v.numero_documento || 's/n'} (vale ${v.vale}, ${dmy(day(v))})`,
        )
        .join('; ');
    const linked = entries.filter((v) => v.documento_url).sort((a, z) => String(z.fecha_operacion).localeCompare(String(a.fecha_operacion)));
    const dates = entries
        .map(day)
        .filter((d): d is string => !!d)
        .sort();
    return { doc: 'GUIA', evidencia: `Almacén: ${text}`, enlace: linked[0]?.documento_url ?? null, fecha: dates[0] ?? null };
}

/** COMEX's DAM and DUAs, and its cost sheet when it says COSTEADO. */
export function comexEvidence(dam: string | null, duas: { dua: string; fecha: string | null }[], costeo: string | null): Evidence[] {
    const out: Evidence[] = [];
    if (dam || duas.length) {
        const parts = [dam ? `DAM ${dam}` : '', duas.length ? `DUA ${duas.map((d) => d.dua).join(' / ')}` : ''].filter(Boolean);
        const dates = duas
            .map((d) => d.fecha)
            .filter((d): d is string => !!d)
            .sort();
        out.push({ doc: 'DAM', evidencia: `COMEX: ${parts.join(' · ')}`, enlace: null, fecha: dates[0] ?? null });
    }
    if (costeo && /COSTEAD/i.test(costeo)) out.push({ doc: 'COSTEO', evidencia: `COMEX: ${costeo}`, enlace: null, fecha: null });
    return out;
}

/** Each missing document with its evidence, split in «to upload» and «found nowhere». */
export function missingSplit(missing: string[], evidence: Evidence[], sunatInvoices: string, sunatCount: number) {
    const by = (doc: string) => evidence.find((e) => e.doc === doc)?.evidencia;
    const withEvidence = (name: string) =>
        name === 'Guía de remisión'
            ? by('GUIA')
            : name === 'DAM'
              ? by('DAM')
              : name === 'Cuadro de costeo'
                ? by('COSTEO')
                : name === 'Factura' && sunatCount > 0
                  ? `SUNAT: ${sunatInvoices}`
                  : undefined;
    const toUpload: string[] = [];
    const nowhere: string[] = [];
    for (const name of missing) {
        const e = withEvidence(name);
        if (e) toUpload.push(`${name} (${e})`);
        else nowhere.push(name);
    }
    return { toUpload: toUpload.join(' | '), nowhere: nowhere.join(', ') };
}

export function statusDetail(status: string, toUpload: string, nowhere: string): string {
    if (status === 'OK') return 'Completo';
    if (status === 'VACÍA') return 'Carpeta vacía';
    if (!nowhere && toUpload) return 'Por subir';
    if (toUpload) return 'Falta y por subir';
    return 'Falta';
}

export { costCentreSource, documentsText } from '../../../../shared/lib/drive/folder-texts.ts';

/** empresa_corta(): the company as the list shows it. */
export function shortCompany(name: string | null): string {
    const s = (name ?? '')
        .toUpperCase()
        .replace(/INDUSTRIAS ROLAND PRINT S\.?A\.?C\.?/g, 'INROPRIN')
        .replace(/INRO ?PL[AÁ]STICOS S\.?A\.?C\.?/g, 'INROPLAS')
        .replace(/\bROLAND PRINT\b/g, 'INROPRIN')
        .replace(/\s+/g, ' ')
        .trim();
    return s || 'INROPRIN';
}
