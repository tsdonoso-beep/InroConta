// Constancias de detracción (SPOT): bajarlas de SOL, archivarlas en Drive (HTML + PDF) y guardarlas en la base.
//
//   login (menú nuevo) → «Consulta de Pago de Detracciones» → por cada tramo de FECHA DE PAGO y tipo de cuenta:
//   consultar (API de la página) → por cada constancia nueva: obtenerconstancia → descargarconstancia → PDF
//   → Drive: Detracciones/Compras|Ventas/AAAA-MM (período tributario) → base (guardar_detracciones, de a 20)
//   → al final, si bajó constancias nuevas, republica COMPROBANTES SUNAT - DETALLE: la detracción va en la misma
//     hoja que el resto de la extracción (seis columnas al final, con el enlace al PDF y al HTML; migración 066),
//     y en cada corrida las pestañas DETRACCIONES y DETRACCIONES SIN CONSTANCIA (todas, con el caso; migración 067).
//
// Por fecha de pago y no por período: un depósito puede llegar meses después de la factura (el 07/10/2026 se
// pagó una de 202608). Las que ya están en la base con su PDF y su HTML no se vuelven a bajar.
//
// Uso:  npm run detracciones:local                                  (los últimos 10 días)
//       DESDE=01/01/2026 npm run detracciones:local                 (primera carga: de enero a hoy, mes por mes)
//       GUARDAR=0 DESDE=01/09/2026 HASTA=30/09/2026 npm run detracciones:local   (prueba: solo disco)
// Variables: DESDE · HASTA (dd/mm/aaaa; HASTA por omisión hoy en Lima) · DIAS (10, si no hay DESDE)
//   TIPOS_CUENTA (1,2,3: Convencional, IVAP, Ley 30737) · GUARDAR (1; 0 = ni Drive ni base) · LIMITE (0 = todas)
//   PUBLICAR (si-hay-nuevas | siempre | nunca) · CONTAR_MASIVOS (1)
// Detalle: docs/detracciones-spot.md. Nunca a la vez que otra corrida con la misma cuenta de SOL.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Frame } from "playwright";
import { num, RUC, texto } from "../comun/config.mts";
import { crearBitacora, primeraLinea, vigilarProceso } from "../comun/bitacora.mts";
import { abrirNavegador, entrar, ErrorSesion, guardarEvidencia, nuevoContexto } from "../sol/sesion.mts";
import { MENU_PLATAFORMA, abrirConsultaSpot } from "./menu.mts";
import { apiLista, consultar, descargarConstancia, obtenerConstancia, type Deposito } from "./api.mts";
import {
  aFecha,
  haceDias,
  hoyLima,
  nombreBase,
  partir,
  registro,
  rutaDrive,
  sentidoDe,
  tramosPorMes,
  type Registro,
  type Tramo,
} from "./registro.mts";
import { aPdf, DIR_SALIDA, respaldar, statsDrive, subir } from "./archivo.mts";
import { guardadas, guardarLote, statsBase } from "./guardar.mts";
import { publicarDetalle } from "../comun/guardar.mts";
import { publicarPestanas } from "./pestanas.mts";

const HASTA = texto("HASTA", hoyLima());
const DESDE = texto("DESDE", haceDias(num("DIAS", 10), HASTA));
const TIPOS_CUENTA = texto("TIPOS_CUENTA", "1,2,3")
  .split(",")
  .map(t => t.trim())
  .filter(t => /^[123]$/.test(t));
const GUARDAR = texto("GUARDAR", "1") !== "0";
const LIMITE = num("LIMITE", 0);
const PUBLICAR = texto("PUBLICAR", "si-hay-nuevas");
const CONTAR_MASIVOS = texto("CONTAR_MASIVOS", "1") !== "0";
const TIPO_CONSULTA = "pagosIndividuales";

const b = crearBitacora("detracciones");
vigilarProceso(b);
aFecha(DESDE);
aFecha(HASTA);
b.log(
  "info",
  "inicio",
  `fecha de pago ${DESDE} a ${HASTA} · cuentas ${TIPOS_CUENTA.join(",")} · ${GUARDAR ? "guarda en Drive y en la base" : "PRUEBA: solo disco"}${LIMITE ? ` · límite ${LIMITE}` : ""} · logs en ${b.dir}`,
);

const s = { consultas: 0, depositos: 0, yaEstaban: 0, bajadas: 0, fallidas: 0, masivos: 0, sentidos: { COMPRA: 0, VENTA: 0 } };
const resumen: Record<string, unknown> = { desde: DESDE, hasta: HASTA, tiposCuenta: TIPOS_CUENTA, guardar: GUARDAR };
const conocidas = GUARDAR ? await guardadas(b) : null;
if (conocidas) b.log("info", "base", `${conocidas.size} constancias ya guardadas con su PDF: no se vuelven a bajar`);

const nav = await abrirNavegador();
const ctx = await nuevoContexto(nav);
const page = await ctx.newPage();
page.on("dialog", d => {
  b.log("aviso", "dialogo", `la página mostró: «${d.message().slice(0, 200)}»`);
  d.accept().catch(() => {});
});

const lote: Registro[] = [];
const todas: Registro[] = [];
const masivos: Deposito[] = [];
const vistas = new Set<string>();

try {
  await entrar(b, page, "login", MENU_PLATAFORMA);
  const spot = await abrirConsultaSpot(b, page);
  for (let fin = Date.now() + 20000; !(await apiLista(spot)) && Date.now() < fin;) await page.waitForTimeout(500);
  if (!(await apiLista(spot))) throw new ErrorSesion("la consulta SPOT abrió sin su token (sessionStorage.token)");

  const cola: Array<{ t: Tramo; tc: string }> = tramosPorMes(DESDE, HASTA).flatMap(t => TIPOS_CUENTA.map(tc => ({ t, tc })));
  for (let item = cola.shift(); item; item = cola.shift()) {
    if (LIMITE && s.bajadas >= LIMITE) break;
    const { t, tc } = item;
    const r = await consultar(spot, { periodo: "", tipoCuenta: tc, tipoConsulta: TIPO_CONSULTA, fechaInicio: t.desde, fechaFin: t.hasta });
    s.consultas++;
    if (r.estado === 401 || r.estado === 403) throw new ErrorSesion(`la consulta respondió ${r.estado}: venció la sesión`);
    if (!r.filas) {
      // Solo un error del servidor (5xx, o sin respuesta) se reintenta partiendo el rango: puede ser un rango
      // demasiado largo. Una respuesta «sin datos» (p. ej. una cuenta sin depósitos) se anota y se sigue.
      const errorServidor = r.estado === 0 || r.estado >= 500;
      const mitades = errorServidor ? partir(t) : null;
      b.log("aviso", "consulta", `${t.desde}–${t.hasta} cuenta ${tc}: HTTP ${r.estado} sin filas${mitades ? ": se parte en dos" : ""}`, {
        respuesta: r.texto.slice(0, 500),
      });
      if (mitades) cola.unshift(...mitades.map(m => ({ t: m, tc })));
      else if (errorServidor) s.fallidas++;
      continue;
    }
    s.depositos += r.filas.length;
    b.log("info", "consulta", `${t.desde}–${t.hasta} cuenta ${tc}: ${r.filas.length} depósito(s)`);
    for (const [indice, d] of r.filas.entries()) {
      if (LIMITE && s.bajadas >= LIMITE) break;
      const n = String(d.num_constancia).trim();
      if (vistas.has(n)) continue;
      vistas.add(n);
      if (conocidas?.has(n)) s.yaEstaban++;
      else await bajar(spot, d, indice);
    }
    if (CONTAR_MASIVOS && tc === "1") await contarMasivos(spot, t);
  }
  if (GUARDAR) await guardarLote(b, lote.splice(0));
  // Las pestañas, en cada corrida (son livianas y cambian con el tiempo: «Meses desde la emisión», facturas
  // nuevas sin constancia); el DETALLE (27 000 filas, ~3 min), solo si entró alguna constancia.
  if (GUARDAR && PUBLICAR !== "nunca") await publicarPestanas(b);
  if (GUARDAR && PUBLICAR !== "nunca" && (PUBLICAR === "siempre" || s.bajadas > 0)) await publicarDetalle(b);
} catch (e) {
  resumen.error = primeraLinea(e);
  b.log("error", "detracciones", primeraLinea(e));
  for (const p of ctx.pages()) await guardarEvidencia(b, p, "fallo");
  if (GUARDAR) await guardarLote(b, lote.splice(0));
} finally {
  writeFileSync(join(b.dir, "constancias.json"), JSON.stringify(todas, null, 2));
  if (masivos.length) writeFileSync(join(b.dir, "pagos-masivos.json"), JSON.stringify(masivos, null, 2));
  Object.assign(resumen, { ...s, drive: statsDrive, base: statsBase, salida: DIR_SALIDA });
  writeFileSync(join(b.dir, "resumen.json"), JSON.stringify(resumen, null, 2));
  b.log(
    "info",
    "resumen",
    `${s.consultas} consultas · ${s.depositos} depósitos · ${s.yaEstaban} ya estaban · ${s.bajadas} bajadas (${s.sentidos.COMPRA} compras, ${s.sentidos.VENTA} ventas) · ${s.fallidas} fallidas · masivos ${s.masivos} · Drive ${JSON.stringify(statsDrive)} · base ${JSON.stringify(statsBase)}`,
  );
  await nav.close().catch(() => {});
}
process.exit(resumen.error || (s.fallidas > 0 && s.bajadas === 0) ? 1 : 0);

/** Una constancia: obtener (como el clic en el número azul) → descargar → PDF → disco → Drive → lote. */
async function bajar(spot: Frame, d: Deposito, indice: number): Promise<void> {
  const n = String(d.num_constancia).trim();
  const sentido = sentidoDe(d, RUC);
  try {
    // Sin este paso, descargarconstancia responde 500: SUNAT deja la constancia en la sesión aquí (docs §8).
    const o = await obtenerConstancia(spot, n, indice);
    const j = o.json as { cod?: number; resultado?: { constancia?: { strFechaPago?: string } } } | null;
    if (o.estado === 401 || o.estado === 403) throw new ErrorSesion(`obtenerconstancia respondió ${o.estado}: venció la sesión`);
    if (o.estado !== 200 || j?.cod !== 200) throw new Error(`obtenerconstancia: HTTP ${o.estado}, cod ${j?.cod ?? "?"}`);
    const dl = await descargarConstancia(spot, n);
    if (dl.estado !== 200 || !dl.datos.length) throw new Error(`descargarconstancia: HTTP ${dl.estado}, ${dl.datos.length} bytes`);
    const pdf = await aPdf(spot.page().context(), dl.datos).catch(e => {
      b.log("aviso", "pdf", `${n}: no se imprimió el PDF: ${primeraLinea(e)}`);
      return null;
    });
    const ruta = rutaDrive(sentido, d.per_tributario);
    const nombre = nombreBase(d);
    respaldar(ruta, `${nombre}.html`, dl.datos);
    if (pdf) respaldar(ruta, `${nombre}.pdf`, pdf);
    const htmlDriveUrl = GUARDAR ? await subir(b, ruta, `${nombre}.html`, dl.datos, "text/html") : null;
    const pdfDriveUrl = GUARDAR && pdf ? await subir(b, ruta, `${nombre}.pdf`, pdf, "application/pdf") : null;
    const reg = registro(d, RUC, {
      tipoConsulta: TIPO_CONSULTA,
      fechaHora: j?.resultado?.constancia?.strFechaPago ?? null,
      pdfDriveUrl,
      htmlDriveUrl,
    });
    todas.push(reg);
    s.bajadas++;
    s.sentidos[sentido]++;
    b.log(
      "info",
      "constancia",
      `${n} · ${sentido} · ${ruta.slice(1).join("/")}/${nombre} · S/ ${d.mto_deposito}${GUARDAR && !pdfDriveUrl ? " · ⚠ sin enlace de Drive" : ""}`,
    );
    if (GUARDAR) {
      lote.push(reg);
      if (lote.length >= 20) await guardarLote(b, lote.splice(0));
    }
  } catch (e) {
    if (e instanceof ErrorSesion) throw e;
    s.fallidas++;
    b.log("error", "constancia", `${n}: ${primeraLinea(e)} (la próxima corrida la vuelve a intentar)`);
  }
}

/** Los pagos masivos del tramo, solo contados y anotados (su constancia es otra, en .txt): pregunta para Contabilidad. */
async function contarMasivos(spot: Frame, t: Tramo): Promise<void> {
  const r = await consultar(spot, {
    periodo: "",
    tipoCuenta: "1",
    tipoConsulta: "pagosMasivos",
    fechaInicio: t.desde,
    fechaFin: t.hasta,
  }).catch(() => null);
  if (!r?.filas) return;
  s.masivos += r.filas.length;
  masivos.push(...r.filas);
  if (r.filas.length)
    b.log("info", "masivos", `${t.desde}–${t.hasta}: ${r.filas.length} pago(s) masivo(s) (no se bajan; ver pagos-masivos.json)`);
}
