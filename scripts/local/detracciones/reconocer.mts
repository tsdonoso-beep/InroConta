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
// Uso:  pnpm detracciones:reconocer
//       PERIODO=202609 CONSTANCIAS=3 HEADLESS=0 pnpm detracciones:reconocer
// Variables: PERIODO (aaaamm; por omisión el mes anterior) · TIPO_CUENTA (Convencional) · CONSTANCIAS (3) · HEADLESS (1)
//   ENTRADA (directo: login en el menú nuevo · antiguo: login por el menú de siempre y el nuevo en otra pestaña)
// Detalle del recorrido: docs/detracciones-spot.md. Nunca a la vez que otra corrida con la misma cuenta de SOL.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Frame, Page } from "playwright";
import { num, RUC, texto } from "../comun/config.mts";
import { crearBitacora, primeraLinea, vigilarProceso } from "../comun/bitacora.mts";
import { abrirNavegador, entrar, guardarEvidencia, nuevoContexto } from "../sol/sesion.mts";
import { limpiarTexto, limpiarUrl, registrarRed } from "./red.mts";
import { apiLista, consultar as consultarApi, descargarConstancia, obtenerConstancia, valorTipoCuenta } from "./api.mts";
import { MENU_PLATAFORMA, abrirConsultaSpot, abrirMenuNuevo } from "./menu.mts";
import { cerrarConstancia, consultar, controles, enlacesConstancia, guardarConstancia, llenarFiltros, modalConstancia } from "./spot.mts";

function mesAnteriorLima(): string {
  const [a, m] = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 7).split("-").map(Number);
  return m === 1 ? `${a - 1}12` : `${a}${String(m - 1).padStart(2, "0")}`;
}

const PERIODO = texto("PERIODO", mesAnteriorLima()).split(",")[0].trim();
const TIPO_CUENTA = texto("TIPO_CUENTA", "Convencional");
const CONSTANCIAS = Math.max(0, num("CONSTANCIAS", 3));
// «directo» por omisión: el menú nuevo tiene su propio login (otro cliente de api-seguridad) y no toma la
// sesión del de siempre (3.ª corrida, 08/10/2026). Su falla de la 1.ª corrida era la del formulario apurado
// (sol/ingreso.mts), igual que la del menú de siempre.
const ENTRADA = texto("ENTRADA", "directo") === "antiguo" ? "antiguo" : "directo";

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

  // Primero la API de la página (5.ª corrida: la tabla llega en JSON); si no responde, por pantalla.
  if (!(await porApi(spot))) await porPantalla(spot);
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

/**
 * La consulta y las constancias por la API que usa la página (api.mts), desde la misma página.
 * false = no había token o la consulta no devolvió filas: se sigue por pantalla.
 */
async function porApi(f: Frame): Promise<boolean> {
  const fin = Date.now() + 20000;
  while (!(await apiLista(f)) && Date.now() < fin) await f.page().waitForTimeout(500);
  if (!(await apiLista(f))) {
    b.log("aviso", "api", "la página no tiene su token (sessionStorage.token): se sigue por pantalla");
    return false;
  }
  const q = { periodo: PERIODO, tipoCuenta: valorTipoCuenta(TIPO_CUENTA), tipoConsulta: "pagosIndividuales" };
  const t0 = Date.now();
  const r = await consultarApi(f, q);
  resumen.api = { estado: r.estado, filas: r.filas?.length ?? null, ms: Date.now() - t0, filtros: q };
  if (!r.filas) {
    writeFileSync(join(b.dir, "api-consultar.txt"), limpiarTexto(r.texto.slice(0, 4000)));
    b.log("aviso", "api", `consultar respondió ${r.estado} sin filas (api-consultar.txt): se sigue por pantalla`);
    return false;
  }
  writeFileSync(join(b.dir, "resultado.json"), JSON.stringify(r.filas, null, 2));
  const ventas = r.filas.filter(d => d.num_ruc_proveedor === RUC).length;
  b.log(
    "info",
    "api",
    `consultar ${PERIODO}: ${r.filas.length} depósito(s) · ${r.filas.length - ventas} compras · ${ventas} ventas · ${Date.now() - t0} ms`,
  );
  const constancias: Record<string, unknown>[] = [];
  for (const [fila, d] of r.filas.slice(0, CONSTANCIAS).entries()) {
    const numero = d.num_constancia.trim();
    const c: Record<string, unknown> = {
      numero,
      comprobante: `${d.cod_tipcomprobante} ${d.num_serie}-${d.num_comprobante}`,
      proveedor: d.num_ruc_proveedor,
      monto: d.mto_deposito,
    };
    try {
      // Como el clic en el número azul: primero «obtener» (llena el modal y deja la constancia en la sesión).
      for (const indice of [fila, fila + 1]) {
        const o = await obtenerConstancia(f, numero, indice);
        const cod = (o.json as { cod?: number } | null)?.cod;
        c.obtener = { indice, estado: o.estado, cod };
        if (o.estado === 200 && cod === 200) {
          writeFileSync(join(dirConstancias, `constancia_${numero}-modal.json`), JSON.stringify(o.json, null, 2));
          break;
        }
        writeFileSync(join(dirConstancias, `constancia_${numero}-obtener-${indice}.txt`), limpiarTexto(o.texto.slice(0, 4000)));
      }
      const { estado, datos } = await descargarConstancia(f, numero);
      Object.assign(c, { estado, bytes: datos.length });
      if (estado === 200 && datos.length) {
        const nombre = `constancia_dtr_${numero}.html`;
        writeFileSync(join(dirConstancias, nombre), datos);
        c.archivo = nombre;
        c.pdf = await aPdf(datos, join(dirConstancias, `constancia_dtr_${numero}.pdf`));
      }
      if (estado !== 200)
        writeFileSync(
          join(dirConstancias, `constancia_${numero}-error-${estado}.txt`),
          limpiarTexto(datos.toString("utf8").slice(0, 4000)),
        );
      b.log(
        "info",
        "constancia",
        `${numero} (${c.comprobante}): obtener ${JSON.stringify(c.obtener)} · descargar HTTP ${estado} · ${datos.length} bytes · PDF ${c.pdf ?? "-"}`,
      );
    } catch (e) {
      c.error = primeraLinea(e);
      b.log("aviso", "constancia", `${numero}: ${c.error}`);
    }
    constancias.push(c);
  }
  resumen.constancias = constancias;
  return true;
}

/** El camino por pantalla (respaldo): filtros, «Consultar», tabla y el modal de cada constancia. */
async function porPantalla(spot: Frame): Promise<void> {
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
}

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
      r.pdf = await aPdf(datos, join(dirConstancias, nombre.replace(/\.html?$/i, "") + ".pdf"));
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
async function aPdf(datos: Buffer, archivo: string): Promise<string> {
  const p = await ctx.newPage();
  try {
    await p.setContent(decodificar(datos), { waitUntil: "load", timeout: 30000 });
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

/** UTF-8 si lo es; si no, latin1 (SUNAT mezcla las dos: «Espa�ol» en otra respuesta del 08/10/2026). */
function decodificar(datos: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(datos);
  } catch {
    return datos.toString("latin1");
  }
}
