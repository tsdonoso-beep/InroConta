// What is pure about a withholding certificate (CRE): its row for the base, its file name and its Drive
// folder. Without SUNAT, Drive or the base: it can be tested alone.
import type { CreDetalle, CreLista } from './sol.mts';

export type Sentido = 'COMPRA' | 'VENTA';

/** SUNAT's dates are epoch ms of Lima midnight (05:00 UTC): back to yyyy-mm-dd in Lima. */
export function fechaLima(ms: unknown): string | null {
    const n = typeof ms === 'number' ? ms : Number(ms);
    if (!ms || !Number.isFinite(n)) return null;
    return new Date(n - 5 * 3600_000).toISOString().slice(0, 10);
}

const texto = (v: unknown) => (v == null ? '' : String(v).trim());
const numero = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** «01» EMITIDO, «02» REVERTIDO (the page shows the reversion block for «02»). */
export const estadoDe = (cod: unknown) => (texto(cod) === '02' ? 'REVERTIDO' : 'EMITIDO');

/** COMPRA when we issued it (we withheld from a supplier); VENTA when a client issued it to us. */
export const sentidoDe = (c: Pick<CreLista, 'numRuc'>, ruc: string): Sentido => (texto(c.numRuc) === ruc ? 'COMPRA' : 'VENTA');

/** «20512201611-20-E001-00002764»: SUNAT's own naming of an electronic document. Gets .pdf or .xml. */
export function nombreBase(c: Pick<CreLista, 'numRuc' | 'codCpe' | 'numSerieCpe' | 'numCpe'>): string {
    return `${texto(c.numRuc)}-${texto(c.codCpe) || '20'}-${texto(c.numSerieCpe).toUpperCase()}-${String(c.numCpe).padStart(8, '0')}`;
}

/** Retenciones/Compras|Ventas/AAAA-MM, by the CRE's issue date (the month of the payment). */
export function rutaDrive(sentido: Sentido, fecha: string | null): string[] {
    return ['Retenciones', sentido === 'COMPRA' ? 'Compras' : 'Ventas', fecha ? fecha.slice(0, 7) : 'Sin fecha'];
}

/** The row guardar_retenciones receives (migration 070): the CRE and the invoices it covers. */
export function registro(c: CreLista, d: CreDetalle, ruc: string, urls: { pdf: string | null; xml: string | null }) {
    const o = d.cre;
    const fecha = fechaLima(o.fechaEmision ?? c.fechaEmision);
    return {
        sentido: sentidoDe(c, ruc),
        emisorRuc: texto(c.numRuc),
        serie: texto(c.numSerieCpe).toUpperCase(),
        numero: Number(c.numCpe),
        fechaEmision: fecha,
        receptorRuc: texto(o.numDocRecep ?? c.numDocRecep),
        receptorNombre: texto(o.descNombreRecep) || null,
        regimen: texto(o.descTipoRegimenRet) || texto(c.codRegimenRet),
        montoRetenido: numero(o.montoTotalRetenido ?? c.montoTotalRetenido),
        montoPagado: numero(o.montoTotalPagado),
        montoBase: numero(o.montoBaseCalculo),
        estado: estadoDe(o.codEstadoCpe ?? c.codEstadoCpe),
        fechaReversion: fechaLima(o.fechaReversion),
        motivoReversion: texto(o.descMotivoReversion) || null,
        periodo: texto(o.numPeriodo) || (fecha ? fecha.slice(0, 4) + fecha.slice(5, 7) : null),
        ticket: texto(o.numTicket ?? c.numTicket) || null,
        pdfDriveUrl: urls.pdf,
        xmlDriveUrl: urls.xml,
        documentos: d.documentos.map((x) => ({
            tipoComprobante: texto(x.codTipoCpeRel),
            serie: texto(x.numSerieCpeRel).toUpperCase(),
            numero: texto(x.numCpeRel),
            fechaEmision: fechaLima(x.fechaEmisionCpeRel),
            total: numero(x.montoTotalCpeRel),
            moneda: texto(x.codMonedaCpeRel) || null,
            numeroPago: texto(x.numPago) || '1',
            fechaPago: fechaLima(x.fechaPago),
            montoPago: numero(x.montoPago),
            monedaPago: texto(x.codMonedaPago) || null,
            montoRetenido: numero(x.montoRetenido),
            fechaRetencion: fechaLima(x.fechaRetencion),
            montoPagado: numero(x.montoPagado),
            tipoCambio: numero(x.montoTipoCambio),
        })),
    };
}
export type Registro = ReturnType<typeof registro>;

/** The key of a CRE: emisor, series and number. */
export const claveCre = (emisorRuc: string, serie: string, numero: number | string) => `${emisorRuc}|${serie.toUpperCase()}|${Number(numero)}`;
