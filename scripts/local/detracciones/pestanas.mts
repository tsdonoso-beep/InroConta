// Las pestañas DETRACCIONES y DETRACCIONES SIN CONSTANCIA del libro INROCONTA (migración 067).
//
// La constancia también va en la hoja DETALLE (migración 066), pero ahí solo se ven las de facturas con XML
// y del período de la hoja. Estas pestañas traen TODAS, con el caso marcado, para rastrear los atípicos.

import { RUC } from "../comun/config.mts";
import { primeraLinea, type Bitacora } from "../comun/bitacora.mts";
import { base } from "../comun/base.mts";
import { publicarHoja } from "../../../src/shared/lib/drive/servidor.ts";
import type { TipoColumna } from "../../../src/shared/lib/export/comprobantes-sunat.ts";

type Columna = [titulo: string, campo: string, tipo: TipoColumna];

const DETRACCIONES: Columna[] = [
  ["Caso", "caso", "texto"],
  ["Período", "periodo", "texto"],
  ["Sentido", "sentido", "texto"],
  ["Fecha de pago", "fecha_pago", "fecha"],
  ["Meses entre período y pago", "meses_hasta_pago", "numero"],
  ["Constancia", "numero_constancia", "texto"],
  ["Tipo", "tipo_comprobante", "texto"],
  ["Serie", "serie", "texto"],
  ["Número", "numero", "texto"],
  ["RUC proveedor", "proveedor_ruc", "texto"],
  ["Proveedor", "proveedor_nombre", "texto"],
  ["Doc. adquiriente", "adquiriente_numero", "texto"],
  ["Adquiriente", "adquiriente_nombre", "texto"],
  ["Bien o servicio", "codigo_bien_servicio", "texto"],
  ["Monto depositado", "monto", "numero"],
  ["Detracción de la factura", "detraccion_factura", "numero"],
  ["Factura en", "factura_en", "texto"],
  ["Total factura", "total_factura", "numero"],
  ["Moneda", "moneda", "texto"],
  ["Cuenta Banco de la Nación", "numero_cuenta", "texto"],
  ["Cuenta en el XML", "cuenta_xml", "texto"],
  ["N.° de operación", "numero_operacion", "texto"],
  ["PDF constancia", "pdf_constancia", "texto"],
  ["HTML constancia", "html_constancia", "texto"],
  ["PDF factura", "pdf_factura", "texto"],
  ["Fecha y hora de pago", "fecha_hora_pago", "texto"],
];

const SIN_CONSTANCIA: Columna[] = [
  ["Sentido", "sentido", "texto"],
  ["Período", "periodo", "texto"],
  ["Fecha de emisión", "fecha_emision", "fecha"],
  ["Meses desde la emisión", "meses_desde_emision", "numero"],
  ["RUC", "ruc", "texto"],
  ["Proveedor / cliente", "nombre", "texto"],
  ["Tipo", "tipo_comprobante", "texto"],
  ["Serie", "serie", "texto"],
  ["Número", "numero", "texto"],
  ["Total", "total", "numero"],
  ["Moneda", "moneda", "texto"],
  ["Detracción", "detraccion", "numero"],
  ["Detracción según", "detraccion_segun", "texto"],
  ["PDF factura", "pdf_factura", "texto"],
];

/** Un valor de la base como texto de celda: fecha aaaa-mm-dd → dd/mm/aaaa; vacío si no hay. */
function celda(v: unknown, tipo: TipoColumna): string {
  if (v == null || v === "") return "";
  const s = String(v);
  if (tipo === "fecha" && /^\d{4}-\d{2}-\d{2}/.test(s)) return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  return s;
}

/** Todas las filas, de a 1000: la API de la base no entrega más por pedido (la función ordena de forma fija). */
async function todas(funcion: string): Promise<Record<string, unknown>[]> {
  const sb = await base();
  const filas: Record<string, unknown>[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.rpc(funcion, { p_empresa_ruc: RUC }).range(desde, desde + 999);
    if (error) throw new Error(`${funcion}: ${error.message}`);
    const pagina = (data ?? []) as Record<string, unknown>[];
    filas.push(...pagina);
    if (pagina.length < 1000) return filas;
  }
}

async function publicar(b: Bitacora, funcion: string, nombre: string, columnas: Columna[]): Promise<void> {
  const filas = (await todas(funcion)).map(r => columnas.map(([, campo, tipo]) => celda(r[campo], tipo)));
  const h = await publicarHoja({ filas: [columnas.map(c => c[0]), ...filas], nombre, carpetas: ["SUNAT"], tipos: columnas.map(c => c[2]) });
  b.log("info", "hoja", `${nombre}: ${filas.length} filas · ${h.url}`);
}

/** Reescribe las dos pestañas. Un error se anota y no tumba la corrida (las constancias ya quedaron guardadas). */
export async function publicarPestanas(b: Bitacora): Promise<void> {
  if (!process.env.GOOGLE_DRIVE_FOLDER_ID) {
    b.log("info", "hoja", "sin GOOGLE_DRIVE_FOLDER_ID: no se publican las pestañas");
    return;
  }
  for (const [funcion, nombre, columnas] of [
    ["detracciones_hoja", "DETRACCIONES", DETRACCIONES],
    ["detracciones_sin_constancia", "DETRACCIONES SIN CONSTANCIA", SIN_CONSTANCIA],
  ] as const) {
    try {
      await publicar(b, funcion, nombre, columnas);
    } catch (e) {
      b.log("error", "hoja", `no se publicó ${nombre}: ${primeraLinea(e)}`);
    }
  }
}
