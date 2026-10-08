// El formulario de ingreso de SOL (api-seguridad): llenarlo sin apurarse y, si la autenticación queda
// en la portada de SUNAT, llevar el `code` al menú como debió hacerlo SUNAT.

import type { Page } from "playwright";
import { num, RUC } from "../comun/config.mts";
import type { Bitacora } from "../comun/bitacora.mts";

/**
 * Los códigos de un solo uso que SUNAT pone en la URL (`code`, `state`) y
 * cualquier JWT: fuera de la bitácora y de la evidencia, que van al artefacto
 * de la corrida. El `code` es un JWT de 5 minutos con el RUC y el usuario
 * (visto el 08/10/2026).
 */
export function ocultarCodigos(t: string): string {
  // Solo valores largos: así un `state=` vacío se sigue viendo vacío, y el `code=…` del menú (el número de
  // opción, p. ej. «code='+name» en el JavaScript de la página) no se toca.
  return t.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "***").replace(/([?&](?:code|state)=)[^&#\s"']{16,}/gi, "$1***");
}

/** A dónde debía volver la autenticación: `originalUrl` y `state` de la URL del formulario. */
export interface Vuelta {
  originalUrl: string;
  state: string;
}

export function vueltaDe(url: string): Vuelta | null {
  try {
    const u = new URL(url);
    const originalUrl = u.searchParams.get("originalUrl");
    return originalUrl ? { originalUrl, state: u.searchParams.get("state") ?? "" } : null;
  } catch {
    return null;
  }
}

const ESPERA_INGRESO_MS = num("ESPERA_INGRESO_S", 2) * 1000;

/**
 * Llena RUC, usuario y clave y da «Iniciar sesión», pero recién cuando la
 * página terminó de cargar. Llenarlo apenas aparecía #txtRuc (menos de 1 s)
 * coincidía con que la autenticación volviera a la portada con el `state`
 * vacío: el 08/10/2026, 6 de 6 veces en dos corridas; a mano (más lento) entra.
 */
export async function llenarIngreso(page: Page, usuario: string, clave: string): Promise<void> {
  await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(ESPERA_INGRESO_MS);
  await page.fill("#txtRuc", RUC);
  await page.fill("#txtUsuario", usuario);
  await page.fill("#txtContrasena", clave);
  await page.click((await page.$("#btnAceptar")) ? "#btnAceptar" : "text=Iniciar sesión");
}

/**
 * La autenticación quedó en la portada (`api-seguridad.sunat.gob.pe/?state=&code=…`)
 * aunque las claves pasaron: el `code` está, lo que se perdió es a dónde volver.
 * Se va a `originalUrl` (el menú) con los mismos parámetros y el `state` del
 * formulario, que es lo que SUNAT debió hacer. false = no había con qué.
 */
export async function rescatarPortada(b: Bitacora, page: Page, vuelta: Vuelta | null, quien: string): Promise<boolean> {
  let actual: URL;
  try {
    actual = new URL(page.url());
  } catch {
    return false;
  }
  if (!vuelta || !actual.searchParams.get("code")) return false;
  const destino = new URL(vuelta.originalUrl);
  for (const [k, v] of actual.searchParams) destino.searchParams.set(k, v);
  destino.searchParams.set("state", vuelta.state);
  b.log(
    "aviso",
    quien,
    `se lleva el code de la portada a ${destino.origin}${destino.pathname} (state ${vuelta.state ? "del formulario" : "vacío: el formulario no lo traía"})`,
  );
  await page.goto(destino.toString(), { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  return true;
}
