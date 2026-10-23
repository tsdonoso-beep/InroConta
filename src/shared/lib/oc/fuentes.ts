// The rows of the private Compras/COMEX/Almacén sheet (drive/fuentes-compras.ts) as the JSON that
// v2's guardar_fuente_oc expects (docs/database/v2/005_escrituras_oc.sql): one row per OC with the
// column names of orden_compra, the procedencia in capitals and empty cells as null (SQL casts
// '' to a date and fails). Same normalizations as db:mudanza (scripts/local/move-v2/map-orders.mts).

import type { ComexOC, CompraOC, Fuentes, Procedencia, Vale } from '../drive/fuentes-compras.ts';

export type Proc = 'NACIONAL' | 'IMPORTACION';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

const OWN_COMPANY = /^(INDUSTRIAS ROLAND PRINT S\.?A\.?C\.?|INROPRIN)$/i;

export const proc = (p: Procedencia | null | undefined): Proc | null => (p === 'Nacional' ? 'NACIONAL' : p === 'Importación' ? 'IMPORTACION' : null);
/** Empty → null. */
export const nul = (v: string | null | undefined) => (v == null || String(v).trim() === '' ? null : String(v).trim());
/** The first date of a cell as yyyy-mm-dd («2026-01-09 / 2026-02-03» with two shipments); «POR CONFIRMAR» is null. */
export function isoDate(v: string | null | undefined): string | null {
    const s = (v ?? '').trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    return dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : null;
}

const CURRENCY: Record<string, string> = { SOLES: 'PEN', SOL: 'PEN', 'S/': 'PEN', DOLARES: 'USD', DÓLARES: 'USD', EUROS: 'EUR', 'PESOS MEX': 'MXN' };
/** «Soles» → PEN, «Dolares» → USD, an ISO code as is; two currencies in one OC («USD / EUR») is null. */
export function currency(v: string | null | undefined): string | null {
    const s = (v ?? '').trim().toUpperCase();
    return CURRENCY[s] ?? (/^[A-Z]{3}$/.test(s) ? s : null);
}
/** The consortium when the company is not INROPRIN. */
const consortium = (empresa: string) => (nul(empresa) && !OWN_COMPANY.test(empresa.trim()) ? empresa.trim() : null);
/** ¿SUBIO OC?: SI / NO / blank. */
const yesNo = (v: string) => {
    const s = v.trim().toUpperCase();
    return s === 'SI' || s === 'SÍ' ? true : s === 'NO' ? false : null;
};

export function comprasRow(c: CompraOC): Row {
    return {
        procedencia: proc(c.procedencia),
        oc: c.oc,
        tipo: /SERVICIO/i.test(c.tipoDocumento) ? 'OS' : 'OC',
        consorcio: consortium(c.empresa),
        requerimiento: nul(c.requerimiento),
        solicitado: nul(c.solicitado),
        elaborado: nul(c.elaborado),
        proyecto: nul(c.proyecto),
        concepto: nul(c.concepto),
        forma_pago: nul(c.formaPago),
        condicion_pago: nul(c.condicionPago),
        incoterm: nul(c.incoterm),
        lugar_entrega: nul(c.lugarEntrega),
        tiempo_entrega: nul(c.tiempoEntrega),
        items: c.items,
        proveedor_ruc: nul(c.proveedorRuc),
        proveedor_nombre: nul(c.proveedor),
        pais: nul(c.pais),
        fecha_oc: isoDate(c.fecha),
        moneda: currency(c.moneda),
        monto: c.total,
        monto_pen: c.totalSoles,
    };
}

export function comexRow(c: ComexOC): Row {
    return {
        procedencia: 'IMPORTACION',
        oc: c.oc,
        consorcio: consortium(c.empresa),
        comex_estado: nul(c.estadoCompra),
        comex_origen: nul(c.origen),
        incoterm: nul(c.incoterm),
        modalidad: nul(c.modalidad),
        operador: nul(c.operador),
        awb_bl: nul(c.awbBl),
        etd: isoDate(c.etd),
        eta: isoDate(c.eta),
        ata: isoDate(c.ata),
        llegada_planta_prevista: isoDate(c.fechaAproxPlanta),
        llegada_planta: isoDate(c.fechaRealPlanta),
        agente_aduanas: nul(c.agenteAduanas),
        documentos_enviados: nul(c.documentosEnviados),
        dam: nul(c.dam),
        costeo: nul(c.costeo),
        embarques: c.embarques,
        comex_observaciones: nul(c.observaciones),
        comprador: nul(c.comprador),
        proveedor_nombre: nul(c.proveedor),
        fecha_oc: isoDate(c.fechaOc),
        duas: c.duas.map((d) => ({
            dua: d.dua,
            fecha: isoDate(d.fecha),
            encargado: nul(d.encargado),
            subio_oc: yesNo(d.subioOc),
            fecha_subida: isoDate(d.fechaSubida),
            observacion: nul(d.observacion),
        })),
    };
}

export function valeRow(v: Vale): Row {
    return {
        id: v.id,
        oc: v.oc,
        procedencia: proc(v.procedencia),
        vale: nul(v.vale),
        fecha_registro: isoDate(v.fechaRegistro),
        fecha_operacion: isoDate(v.fechaOperacion),
        movimiento: nul(v.movimiento),
        operacion: nul(v.operacion),
        proveedor: nul(v.proveedor),
        tipo_documento: nul(v.tipoDocumento),
        numero_documento: nul(v.numeroDocumento),
        tipo_orden: nul(v.tipoOrden),
        numero_orden: nul(v.numeroOrden),
        proyecto: nul(v.proyecto),
        sede: nul(v.sede),
        responsable: nul(v.responsable),
        recepcionado: nul(v.recepcionado),
        documento_ruta: nul(v.documentoRuta),
        documento_url: nul(v.documentoUrl),
        vale_url: nul(v.valeUrl),
        items: v.items,
        cantidad: v.cantidad,
    };
}

/** Each source's rows for guardar_fuente_oc (CG comes from its own tab: base-cg.ts). */
export const sourceRows = (f: Fuentes) => ({
    COMPRAS: f.compras.map(comprasRow),
    COMEX: f.comex.map(comexRow),
    ALMACEN: f.vales.map(valeRow),
});

/** A timestamp Postgres accepts, or null. */
const stamp = (v: string | null) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

/** COPIA - ESTADO → one corrida row per tab (job copia-fuentes), as db:mudanza moved fuente_copia. */
export function copyRuns(estado: Fuentes['estado'], companyRuc: string, readAt: string): Row[] {
    return estado
        .filter((e) => nul(e.pestana))
        .map((e) => ({
            job: 'copia-fuentes',
            empresa_ruc: companyRuc,
            iniciada_en: stamp(e.inicio) ?? readAt,
            terminada_en: stamp(e.fin),
            resultado: ['OK', 'PARCIAL', 'ERROR'].find((r) => e.resultado.startsWith(r)) ?? null,
            filas: e.filas === null ? null : Math.trunc(e.filas),
            resumen: { pestana: e.pestana, origen: e.origen, inicio: e.inicio, fin: e.fin, leido_en: readAt, resultado: e.resultado },
        }));
}

/**
 * Compras is the first source for the supplier, currency and date, so its load overwrites them even
 * when its cell is blank, and only CG's load fills them back. The blanks keep what v2 already has
 * (from CG or the approvals table), so an OC does not lose its RUC between the two loads.
 */
export function keepResolved(rows: Row[], orders: Map<string, Row>, key: (procedencia: Proc, oc: string) => string | null): Row[] {
    return rows.map((r) => {
        const o = orders.get(key(r.procedencia, r.oc) ?? '');
        if (!o) return r;
        return {
            ...r,
            proveedor_ruc: r.proveedor_ruc ?? o.proveedor_ruc ?? null,
            moneda: r.moneda ?? o.moneda ?? null,
            fecha_oc: r.fecha_oc ?? o.fecha_oc ?? null,
        };
    });
}
