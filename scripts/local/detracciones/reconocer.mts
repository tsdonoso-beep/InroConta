// Reconocimiento de la consulta SPOT (constancias de detracción): recorre la ruta y anota lo que encuentra.
// NO guarda nada en la base ni en Drive. Todo queda en scripts/out/logs/detracciones-reconocer-<fecha>/:
//
//   capturas/        una captura por paso (menú, consulta, filtros, resultado, cada constancia)
//   controles-*.json los campos y desplegables de la consulta, con sus opciones reales
//   resultado.html   la página con la tabla · resultado.txt su texto
//   constancias/     el HTML que baja «Guardar», su PDF y el texto del modal
//   red.jsonl, red/  lo que la página pide por debajo (¿hay una API?)
//   resumen.json     lo encontrado, en una mirada
//
// Uso:  npm run detracciones:reconocer
//       PERIODO=202609 CONSTANCIAS=3 HEADLESS=0 npm run detracciones:reconocer
// Variables: PERIODO (aaaamm; por omisión el mes anterior) · TIPO_CUENTA (Convencional) · CONSTANCIAS (3) · HEADLESS (1)
//   ENTRADA (antiguo: login por el menú de siempre y el nuevo en otra pestaña · directo: login en el menú nuevo)
// Detalle del recorrido: docs/detracciones-spot.md. Nunca a la vez que otra corrida con la misma cuenta de SOL.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Frame, Page } from "playwright";
import { num, texto } from "../comun/config.mts";
import { crearBitacora, primeraLinea, vigilarProceso } from "../comun/bitacora.mts";
import { abrirNavegador, entrar, guardarEvidencia, nuevoContexto } from "../sol/sesion.mts";
import { limpiarUrl, registrarRed } from "./red.mts";
import {
  MENU_PLATAFORMA,
  abrirConsultaSpot,
  abrirMenuNuevo,
  cerrarConstancia,
  consultar,
  controles,
  enlacesConstancia,
  guardarConstancia,
  llenarFiltros,
  modalConstancia,
} from "./spot.mts";

function mesAnteriorLima(): string {
  const [a, m] = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 7).split("-").map(Number);
  return m === 1 ? `${a - 1}12` : `${a}${String(m - 1).padStart(2, "0")}`;
}

const PERIODO = texto("PERIODO", mesAnteriorLima()).split(",")[0].trim();
const TIPO_CUENTA = texto("TIPO_CUENTA", "Convencional");
const CONSTANCIAS = Math.max(0, num("CONSTANCIAS", 3));
// «directo» falló el 08/10/2026: la autenticación quedó en la portada de SUNAT (ver abrirMenuNuevo).
const ENTRADA = texto("ENTRADA", "antiguo") === "directo" ? "directo" : "antiguo";

const b = crearBitacora("detracciones-reconocer");
vigilarProceso(b);
const dirCapturas = join(b.dir, "capturas");
const dirConstancias = join(b.dir, "constancias");
mkdirSync(dirCapturas, { recursive: true });
mkdirSync(dirConstancias, { recursive: true });
b.log(
  "info",
  "inicio",
  `reconocimiento SPOT · período ${PERIODO} · cuenta «${TIPO_CUENTA}» · ${CONSTANCIAS} constancia(s) · entrada ${ENTRADA} · logs en ${b.dir}`,
);

let paso = 0;
async function captura(page: Page, nombre: string): Promise<void> {
  const archivo = join(dirCapturas, `${String(++paso).padStart(2, "0")}-${nombre}.png`);
  await page.screenshot({ path: archivo, fullPage: true, timeout: 20000 }).catch(e => b.log("aviso", "captura", primeraLinea(e)));
}

const resumen: Record<string, unknown> = { periodo: PERIODO, tipoCuenta: TIPO_CUENTA, entrada: ENTRADA };
const nav = await abrirNavegador();
const ctx = await nuevoContexto(nav);
const page = await ctx.newPage();
page.on("dialog", d => {
  b.log("aviso", "dialogo", `la página mostró: «${d.message().slice(0, 200)}»`);
  d.accept().catch(() => {});
});
ctx.on("page", p => b.log("info", "pestaña", `se abrió una pestaña nueva: ${limpiarUrl(p.url())}`));
// Por qué páginas pasa el login (sin state ni code): si vuelve a quedarse en la portada, se ve dónde.
const anotarRuta = (p: Page) =>
  p.on("framenavigated", f => {
    if (f === p.mainFrame()) b.log("info", "ruta", limpiarUrl(f.url()).slice(0, 200));
  });
anotarRuta(page);
ctx.on("page", anotarRuta);

try {
  let menu = page;
  if (ENTRADA === "directo") await entrar(b, page, "login", MENU_PLATAFORMA);
  else {
    // El login de siempre (el que usan los XML) y el menú nuevo en otra pestaña; esta queda abierta.
    await entrar(b, page, "login");
    await captura(page, "menu-de-siempre");
    menu = await abrirMenuNuevo(b, ctx);
  }
  await captura(menu, "menu-nuevo");
  const red = registrarRed(b, ctx);

  const spot = await abrirConsultaSpot(b, menu);
  resumen.urlConsulta = limpiarUrl(spot.url());
  resumen.enPestanaNueva = spot.page() !== menu;
  b.log("info", "spot", `consulta abierta en ${resumen.urlConsulta}${resumen.enPestanaNueva ? " (pestaña nueva)" : ""}`);
  await captura(spot.page(), "consulta-spot");
  const antes = await controles(spot);
  writeFileSync(join(b.dir, "controles-antes.json"), JSON.stringify(antes, null, 2));
  resumen.desplegables = antes
    .filter(c => c.tag === "select")
    .map(c => ({ etiqueta: c.etiqueta, opciones: c.opciones?.map(o => o.texto) }));

  await llenarFiltros(b, spot, PERIODO, TIPO_CUENTA);
  await captura(spot.page(), "filtros");
  writeFileSync(join(b.dir, "controles-despues.json"), JSON.stringify(await controles(spot), null, 2));

  const t0 = Date.now();
  await consultar(spot);
  const filas = await esperarResultado(spot);
  resumen.segundosConsulta = Math.round((Date.now() - t0) / 1000);
  await captura(spot.page(), "resultado");
  writeFileSync(join(b.dir, "resultado.html"), await spot.content());
  const textoPagina = await spot
    .locator("body")
    .innerText()
    .catch(() => "");
  writeFileSync(join(b.dir, "resultado.txt"), textoPagina);
  resumen.constanciasEnPantalla = filas;
  resumen.filasDeTabla = await spot
    .locator("table tbody tr")
    .count()
    .catch(() => -1);
  // ¿Tiene páginas o botón para exportar? Se anotan los textos que lo sugieren.
  resumen.paginacion = [
    ...new Set(textoPagina.match(/[^\n]*(siguiente|anterior|p[aá]gina|mostrando|registros|exportar|excel|descargar)[^\n]*/gi) ?? []),
  ].slice(0, 20);
  b.log("info", "resultado", `${filas} constancia(s) en pantalla · ${resumen.filasDeTabla} fila(s) · ${resumen.segundosConsulta} s`);

  resumen.constancias = await probarConstancias(spot, Math.min(CONSTANCIAS, filas));
  resumen.pedidosDeRed = red.pedidos();
} catch (e) {
  resumen.error = primeraLinea(e);
  b.log("error", "reconocer", primeraLinea(e));
  for (const p of ctx.pages()) await guardarEvidencia(b, p, "fallo");
} finally {
  writeFileSync(join(b.dir, "resumen.json"), JSON.stringify(resumen, null, 2));
  b.log("info", "resumen", JSON.stringify(resumen).slice(0, 1500));
  await nav.close().catch(() => {});
}
process.exit(resumen.error ? 1 : 0);

/** Espera la tabla (o el aviso de que no hay nada) hasta 90 s. Devuelve cuántas constancias se ven. */
async function esperarResultado(f: Frame): Promise<number> {
  const fin = Date.now() + 90000;
  while (Date.now() < fin) {
    const n = await enlacesConstancia(f)
      .count()
      .catch(() => 0);
    if (n) return n;
    const t = await f
      .locator("body")
      .innerText()
      .catch(() => "");
    if (/no (se )?(encontr|exist|hay)|sin resultados|sin registros/i.test(t)) {
      b.log("aviso", "resultado", "la consulta no trajo constancias");
      return 0;
    }
    await f.page().waitForTimeout(700);
  }
  b.log("aviso", "resultado", "en 90 s no apareció ninguna constancia");
  return 0;
}

/** Abre las primeras `n` constancias: captura del modal, su texto, el HTML de «Guardar» y un PDF de ese HTML. */
async function probarConstancias(f: Frame, n: number) {
  const salida: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) {
    const enlace = enlacesConstancia(f).nth(i);
    const numero = (await enlace.innerText().catch(() => `fila-${i + 1}`)).trim();
    const r: Record<string, unknown> = { numero };
    try {
      await enlace.click();
      const modal = modalConstancia(f);
      await modal.waitFor({ state: "visible", timeout: 30000 });
      await modal.screenshot({ path: join(dirCapturas, `constancia-${numero}.png`) }).catch(() => {});
      writeFileSync(join(dirConstancias, `${numero}-modal.txt`), await modal.innerText());
      const { nombre, datos } = await guardarConstancia(f);
      writeFileSync(join(dirConstancias, nombre), datos);
      Object.assign(r, { archivo: nombre, bytes: datos.length });
      r.pdf = await aPdf(datos.toString("utf8"), join(dirConstancias, nombre.replace(/\.html?$/i, "") + ".pdf"));
      b.log("info", "constancia", `${numero}: ${nombre} (${datos.length} bytes) · PDF ${r.pdf}`);
    } catch (e) {
      r.error = primeraLinea(e);
      b.log("aviso", "constancia", `${numero}: ${r.error}`);
      await guardarEvidencia(b, f.page(), `constancia-${numero}`);
    }
    await cerrarConstancia(f).catch(() => {});
    salida.push(r);
  }
  return salida;
}

/** El HTML de SUNAT impreso a PDF por el mismo navegador (solo funciona sin ventana: HEADLESS=1). */
async function aPdf(html: string, archivo: string): Promise<string> {
  const p = await ctx.newPage();
  try {
    await p.setContent(html, { waitUntil: "load", timeout: 30000 });
    await p.pdf({
      path: archivo,
      format: "A4",
      printBackground: true,
      margin: { top: "15mm", bottom: "15mm", left: "12mm", right: "12mm" },
    });
    return "ok";
  } catch (e) {
    return `no: ${primeraLinea(e)}`;
  } finally {
    await p.close().catch(() => {});
  }
}
