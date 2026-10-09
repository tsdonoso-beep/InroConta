// Lo puro de las constancias: sentido, nombre del archivo, carpeta, tramos de fechas y la fila de la base.
// Sin SUNAT, Drive ni base: se puede probar solo.

import type { Deposito } from './api.mts';

export type Sentido = 'COMPRA' | 'VENTA';

/** VENTA si el proveedor somos nosotros (un cliente nos depositó); si no, COMPRA (depositamos nosotros). */
export function sentidoDe(d: Pick<Deposito, 'num_ruc_proveedor'>, ruc: string): Sentido {
    return d.num_ruc_proveedor?.trim() === ruc ? 'VENTA' : 'COMPRA';
}

/** Detracciones/Compras|Ventas/AAAA-MM, por período tributario (el mes de la factura, no el del pago). */
export function rutaDrive(sentido: Sentido, periodo: string): string[] {
    const mes = /^\d{6}$/.test(periodo) ? `${periodo.slice(0, 4)}-${periodo.slice(4)}` : 'Sin periodo';
    return ['Detracciones', sentido === 'COMPRA' ? 'Compras' : 'Ventas', mes];
}

/**
 * «20554893784-01-FE02-00070678_DTR-317405442»: empieza como el XML de la
 * factura (RUC-tipo-serie-número), así buscar la factura en Drive trae
 * también su constancia. Se le agrega .pdf o .html.
 */
export function nombreBase(d: Pick<Deposito, 'num_ruc_proveedor' | 'cod_tipcomprobante' | 'num_serie' | 'num_comprobante' | 'num_constancia'>) {
    const limpio = (s: string | number | null | undefined) =>
        String(s ?? '')
            .trim()
            .replace(/[^\w.-]+/g, '') || 'SN';
    return `${limpio(d.num_ruc_proveedor)}-${limpio(d.cod_tipcomprobante)}-${limpio(d.num_serie).toUpperCase()}-${limpio(d.num_comprobante)}_DTR-${limpio(d.num_constancia)}`;
}

/** «06/10/2026 17:58:29» (hora de Lima) → ISO con su zona; null si no calza. */
export function fechaHoraLima(texto: string | null | undefined): string | null {
    const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec((texto ?? '').trim());
    return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}-05:00` : null;
}

/** La fila que recibe guardar_detracciones (migración 066). */
export function registro(
    d: Deposito,
    ruc: string,
    extra: { tipoConsulta: string; fechaHora: string | null; pdfDriveUrl: string | null; htmlDriveUrl: string | null },
) {
    return {
        numeroConstancia: String(d.num_constancia).trim(),
        sentido: sentidoDe(d, ruc),
        tipoCuenta: d.cod_tipcta,
        numeroCuenta: d.num_cuenta,
        fechaPago: d.fec_pago_desc,
        fechaHoraPago: fechaHoraLima(extra.fechaHora),
        periodo: d.per_tributario,
        tipoComprobante: d.cod_tipcomprobante,
        serie: d.num_serie,
        numero: d.num_comprobante,
        proveedorRuc: d.num_ruc_proveedor,
        proveedorNombre: d.des_prov,
        adquirienteTipoDoc: d.tip_doc_adq,
        adquirienteNumero: d.num_doc_adq,
        adquirienteNombre: d.des_adq,
        tipoOperacion: d.tip_operacion,
        codigoBienServicio: d.tip_bien,
        monto: d.mto_deposito,
        numeroOperacion: d.num_pres == null ? null : String(d.num_pres),
        numeroPagoDetracciones: d.num_npd,
        origen: d.origen_desc,
        usuarioSol: d.cod_usuario_sol,
        tipoConsulta: extra.tipoConsulta,
        pdfDriveUrl: extra.pdfDriveUrl,
        htmlDriveUrl: extra.htmlDriveUrl,
    };
}
export type Registro = ReturnType<typeof registro>;

// ---------- fechas (dd/mm/aaaa, como las pide la consulta) ----------

export interface Tramo {
    desde: string;
    hasta: string;
}

const aTexto = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

export function aFecha(texto: string): Date {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim());
    if (!m) throw new Error(`fecha «${texto}»: se espera dd/mm/aaaa`);
    return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
}

/** Hoy en Lima (UTC-5 todo el año), como dd/mm/aaaa. */
export function hoyLima(): string {
    return aTexto(new Date(Date.now() - 5 * 3600_000));
}

export function haceDias(n: number, desde = hoyLima()): string {
    return aTexto(new Date(aFecha(desde).getTime() - n * 86400_000));
}

/** El rango partido por mes calendario: la primera carga pide un mes por consulta. */
export function tramosPorMes(desde: string, hasta: string): Tramo[] {
    const fin = aFecha(hasta);
    const tramos: Tramo[] = [];
    for (let d = aFecha(desde); d <= fin;) {
        const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
        const h = ultimo < fin ? ultimo : fin;
        tramos.push({ desde: aTexto(d), hasta: aTexto(h) });
        d = new Date(h.getTime() + 86400_000);
    }
    return tramos;
}

/** Un tramo en dos mitades (si SUNAT no acepta el rango); null si ya es de un día. */
export function partir(t: Tramo): [Tramo, Tramo] | null {
    const a = aFecha(t.desde).getTime();
    const z = aFecha(t.hasta).getTime();
    if (z <= a) return null;
    const medio = a + Math.floor((z - a) / 86400_000 / 2) * 86400_000;
    return [
        { desde: t.desde, hasta: aTexto(new Date(medio)) },
        { desde: aTexto(new Date(medio + 86400_000)), hasta: t.hasta },
    ];
}
