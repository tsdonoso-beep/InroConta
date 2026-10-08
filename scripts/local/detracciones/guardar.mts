// Las constancias en la base (migración 066) y las pestañas DETRACCIONES y DETRACCIONES SIN CONSTANCIA.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { RUC } from "../comun/config.mts";
import { dormir, primeraLinea, type Bitacora } from "../comun/bitacora.mts";
import { base } from "../comun/base.mts";
import { publicarHoja } from "../../../src/shared/lib/drive/servidor.ts";
import type { TipoColumna } from "../../../src/shared/lib/export/comprobantes-sunat.ts";
import type { Registro } from "./registro.mts";

/** ¿Falta la migración 066? (la función no existe en la base). */
const sinMigracion = (e: { code?: string; message: string }) =>
  e.code === "PGRST202" || e.code === "42883" || /could not find the function/i.test(e.message);

/** Las constancias ya guardadas con su PDF y su HTML en Drive; null si la base no tiene la migración 066. */
export async function guardadas(b: Bitacora): Promise<Set<string> | null> {
  const { data, error } = await (await base()).rpc("detracciones_guardadas", { p_empresa_ruc: RUC });
  if (error) {
    b.log(
      sinMigracion(error) ? "aviso" : "error",
      "base",
      `detracciones_guardadas: ${error.message}${sinMigracion(error) ? " (¿falta aplicar la migración 066?)" : ""}`,
    );
    return null;
  }
  return new Set(((data ?? []) as { numero_constancia: string }[]).map(r => r.numero_constancia));
}

export const statsBase = { nuevos: 0, actualizados: 0, fallidos: 0 };

/** guardar_detracciones con 3 intentos; si no entra, el lote queda en disco (en la bitácora de la corrida). */
export async function guardarLote(b: Bitacora, lote: Registro[]): Promise<void> {
  if (!lote.length) return;
  for (let i = 1; i <= 3; i++) {
    const { data, error } = await (await base(i > 1)).rpc("guardar_detracciones", { p_empresa_ruc: RUC, p_filas: lote });
    if (!error) {
      const r = (Array.isArray(data) ? data[0] : data) as { nuevos: number; actualizados: number } | null;
      statsBase.nuevos += r?.nuevos ?? 0;
      statsBase.actualizados += r?.actualizados ?? 0;
      b.log("info", "base", `guardadas ${lote.length}: ${r?.nuevos ?? "?"} nuevas, ${r?.actualizados ?? "?"} actualizadas`);
      return;
    }
    b.log("error", "base", `guardar_detracciones falló (intento ${i}/3): ${error.message}`, { error });
    if (sinMigracion(error)) break;
    await dormir(3000 * i);
  }
  statsBase.fallidos += lote.length;
  const archivo = join(b.dir, `lote-no-guardado-${Date.now()}.json`);
  writeFileSync(archivo, JSON.stringify(lote, null, 2));
  b.log("error", "base", `el lote quedó en ${archivo}: la próxima corrida lo vuelve a bajar y guardar`);
}

const fecha = (iso: string | null) =>
  iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "";
const num = (n: number | string | null) => (n == null || n === "" ? "" : String(n));
const txt = (s: string | null) => s ?? "";

const COLUMNAS: [string, TipoColumna][] = [
  ["Período", "texto"],
  ["Sentido", "texto"],
  ["Fecha de pago", "fecha"],
  ["Constancia", "texto"],
  ["Tipo", "texto"],
  ["Serie", "texto"],
  ["Número", "texto"],
  ["RUC proveedor", "texto"],
  ["Proveedor", "texto"],
  ["Doc. adquiriente", "texto"],
  ["Adquiriente", "texto"],
  ["Bien o servicio", "texto"],
  ["Monto depositado", "numero"],
  ["Cuenta Banco de la Nación", "texto"],
  ["N.° de operación", "texto"],
  ["Estado", "texto"],
  ["Total factura", "numero"],
  ["Detracción SIRE", "numero"],
  ["Detracción XML", "numero"],
  ["Cuenta en el XML", "texto"],
  ["PDF constancia", "texto"],
  ["PDF factura", "texto"],
  ["Fecha y hora de pago", "texto"],
];

const COLUMNAS_FALTAN: [string, TipoColumna][] = [
  ["Período", "texto"],
  ["Fecha de emisión", "fecha"],
  ["RUC proveedor", "texto"],
  ["Proveedor", "texto"],
  ["Tipo", "texto"],
  ["Serie", "texto"],
  ["Número", "texto"],
  ["Total", "numero"],
  ["Moneda", "texto"],
  ["Detracción SIRE", "numero"],
];

type Fila = Record<string, string | number | null>;

/** Reescribe las dos pestañas en el libro INROCONTA (y la hoja suelta en SUNAT/, si corresponde). */
export async function publicarHojas(b: Bitacora): Promise<void> {
  if (!process.env.GOOGLE_DRIVE_FOLDER_ID) {
    b.log("info", "hoja", "sin GOOGLE_DRIVE_FOLDER_ID: no se publica");
    return;
  }
  try {
    const sb = await base();
    const { data, error } = await sb.rpc("detracciones_hoja", { p_empresa_ruc: RUC });
    if (error) throw new Error(`detracciones_hoja: ${error.message}`);
    const filas = ((data ?? []) as Fila[]).map(r =>
      [
        txt(r.periodo as string),
        txt(r.sentido as string),
        fecha(r.fecha_pago as string),
        txt(r.numero_constancia as string),
        txt(r.tipo_comprobante as string),
        txt(r.serie as string),
        txt(r.numero as string),
        txt(r.proveedor_ruc as string),
        txt(r.proveedor_nombre as string),
        txt(r.adquiriente_numero as string),
        txt(r.adquiriente_nombre as string),
        txt(r.codigo_bien_servicio as string),
        num(r.monto),
        txt(r.numero_cuenta as string),
        txt(r.numero_operacion as string),
        txt(r.estado as string),
        num(r.total_factura),
        num(r.detraccion_sire),
        num(r.detraccion_xml),
        txt(r.cuenta_xml as string),
        txt(r.pdf_constancia as string),
        txt(r.pdf_factura as string),
        txt(r.fecha_hora_pago as string),
      ].map(String),
    );
    const h1 = await publicarHoja({
      filas: [COLUMNAS.map(c => c[0]), ...filas],
      nombre: "DETRACCIONES",
      carpetas: ["SUNAT"],
      tipos: COLUMNAS.map(c => c[1]),
    });
    b.log("info", "hoja", `DETRACCIONES: ${filas.length} constancias · ${h1.url}`);

    const f = await sb.rpc("detracciones_sin_constancia", { p_empresa_ruc: RUC });
    if (f.error) throw new Error(`detracciones_sin_constancia: ${f.error.message}`);
    const faltan = ((f.data ?? []) as Fila[]).map(r =>
      [
        txt(r.periodo as string),
        fecha(r.fecha_emision as string),
        txt(r.proveedor_ruc as string),
        txt(r.proveedor_nombre as string),
        txt(r.tipo_comprobante as string),
        txt(r.serie as string),
        txt(r.numero as string),
        num(r.total),
        txt(r.moneda as string),
        num(r.detraccion),
      ].map(String),
    );
    const h2 = await publicarHoja({
      filas: [COLUMNAS_FALTAN.map(c => c[0]), ...faltan],
      nombre: "DETRACCIONES SIN CONSTANCIA",
      carpetas: ["SUNAT"],
      tipos: COLUMNAS_FALTAN.map(c => c[1]),
    });
    b.log("info", "hoja", `DETRACCIONES SIN CONSTANCIA: ${faltan.length} facturas · ${h2.url}`);
  } catch (e) {
    b.log("error", "hoja", `no se publicaron las pestañas: ${primeraLinea(e)}`);
  }
}
