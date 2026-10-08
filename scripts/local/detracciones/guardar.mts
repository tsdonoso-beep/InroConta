// Las constancias en la base (migración 066). La hoja que las muestra es COMPROBANTES SUNAT - DETALLE (comun/guardar.mts).

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { RUC } from "../comun/config.mts";
import { dormir, type Bitacora } from "../comun/bitacora.mts";
import { base } from "../comun/base.mts";
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
