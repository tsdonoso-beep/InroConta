// La API que la consulta SPOT usa por debajo (e-plataformaunica.sunat.gob.pe), llamada DESDE la misma página.
//
// Rutas leídas del código público de la página (constantes-fconsultaDetracciones.js y
// fconsultaDetracciones.service.js, 5.ª corrida del reconocimiento, 08/10/2026):
//   GET  /v1/recaudacion/tributaria/declapago/detracciones/t/consultar?&fechaInicio=&fechaFin=&tipoCuenta=&tipoConsulta=&periodo=
//        → { cod: 200, msg, resultado: Deposito[] }   la tabla, en JSON
//   POST …/t/descargarconstancia?numeroConstancia={n}   cuerpo `""` → el HTML de «Guardar» (constancia_dtr_{n}.html)
//   GET  …/e/obtenerconstancia?indice={i}&numeroConstancia={n}   lo que muestra el modal
//   POST …/t/descargararchivoexcel · …/t/descargararchivotexto   la tabla en .csv / .txt
// Cabeceras: `IdCache: sessionStorage.token` (el token de la página) e `IdFormulario: *MENU*`.
//
// Se llama con `frame.evaluate`: corre en la página (su origen, sus cookies, su token). El token nunca
// sale de ahí: ni a Node ni a la bitácora.

import type { Frame } from "playwright";

const BASE = "/v1/recaudacion/tributaria/declapago/detracciones";

/** Una fila de la consulta, tal cual la devuelve SUNAT (ejemplo real en docs/detracciones-spot.md §5). */
export interface Deposito {
  num_constancia: string;
  num_cuenta: string;
  cod_tipcta: string;
  fec_pago: number;
  fec_pago_desc: string;
  per_tributario: string;
  cod_tipcomprobante: string;
  num_serie: string;
  num_comprobante: string;
  num_ruc_proveedor: string;
  des_prov: string;
  tip_doc_adq: string;
  num_doc_adq: string;
  des_adq: string;
  tip_operacion: string;
  tip_bien: string;
  mto_deposito: number;
  num_pres: number;
  num_npd: string;
  origen_desc: string;
  cod_usuario_sol: string;
}

export interface Filtros {
  periodo: string;
  /** 1 Convencional · 2 Especial IVAP · 3 Ley N° 30737 (valores del desplegable «Tipo de Cuenta»). */
  tipoCuenta: string;
  /** pagosIndividuales · pagosMasivos · pagosTransPasajeros (desplegable «Pagos»). */
  tipoConsulta: string;
  fechaInicio?: string;
  fechaFin?: string;
}

/** «Convencional» → "1"; un número se deja como está. */
export function valorTipoCuenta(texto: string): string {
  if (/^\d$/.test(texto.trim())) return texto.trim();
  if (/ivap|especial/i.test(texto)) return "2";
  if (/30737|ley/i.test(texto)) return "3";
  return "1";
}

/** ¿Esta es la consulta SPOT y ya tiene su token? */
export function apiLista(f: Frame): Promise<boolean> {
  return f
    .evaluate(() => typeof sessionStorage !== "undefined" && !!sessionStorage.getItem("token") && /plataformaunica/.test(location.host))
    .catch(() => false);
}

export async function consultar(f: Frame, q: Filtros): Promise<{ estado: number; filas: Deposito[] | null; texto: string }> {
  const r = await f.evaluate(
    async ({ base, q }) => {
      const p = new URLSearchParams({
        fechaInicio: q.fechaInicio ?? "",
        fechaFin: q.fechaFin ?? "",
        tipoCuenta: q.tipoCuenta,
        tipoConsulta: q.tipoConsulta,
        periodo: q.periodo,
        _: String(Date.now()),
      });
      // Como la página: «?&fechaInicio=…» y las fechas dd/mm/aaaa sin codificar la barra.
      const url = `${base}/t/consultar?&${p.toString().replace(/%2F/g, "/")}`;
      const res = await fetch(url, {
        credentials: "include",
        headers: { IdCache: sessionStorage.getItem("token") ?? "", IdFormulario: "*MENU*", "Content-Type": "application/json" },
      });
      return { estado: res.status, texto: await res.text() };
    },
    { base: BASE, q },
  );
  let filas: Deposito[] | null = null;
  try {
    const j = JSON.parse(r.texto) as { cod?: number; resultado?: Deposito[] };
    if (j.cod === 200 && Array.isArray(j.resultado)) filas = j.resultado;
  } catch {
    /* no era JSON: queda en texto */
  }
  return { ...r, filas };
}

/**
 * Lo que muestra el modal de la constancia. La página lo pide al hacer clic en el número azul
 * (`constancia(numero, indice)`) y recién después «Guardar» baja el HTML: sin este paso,
 * `descargarconstancia` responde 500 «Request failed» (6.ª y 7.ª corridas, 08/10/2026), así que
 * SUNAT debe dejar la constancia en la sesión aquí. `indice`: la fila en la tabla (a probar si
 * empieza en 0 o en 1).
 */
export async function obtenerConstancia(
  f: Frame,
  numero: string,
  indice: number,
): Promise<{ estado: number; json: unknown; texto: string }> {
  const r = await f.evaluate(
    async ({ base, numero, indice }) => {
      const url = `${base}/e/obtenerconstancia?indice=${indice}&numeroConstancia=${encodeURIComponent(numero)}&_=${Date.now()}`;
      const res = await fetch(url, {
        credentials: "include",
        headers: { IdCache: sessionStorage.getItem("token") ?? "", IdFormulario: "*MENU*", "Content-Type": "application/json" },
      });
      return { estado: res.status, texto: await res.text() };
    },
    { base: BASE, numero, indice },
  );
  let json: unknown = null;
  try {
    json = JSON.parse(r.texto);
  } catch {
    /* no era JSON */
  }
  return { ...r, json };
}

/** El HTML de la constancia, el mismo que baja «Guardar», con sus bytes tal cual (sin adivinar la codificación). */
export async function descargarConstancia(f: Frame, numero: string): Promise<{ estado: number; datos: Buffer }> {
  const r = await f.evaluate(
    async ({ base, numero }) => {
      const res = await fetch(`${base}/t/descargarconstancia?numeroConstancia=${encodeURIComponent(numero)}`, {
        method: "POST",
        credentials: "include",
        headers: { IdCache: sessionStorage.getItem("token") ?? "", IdFormulario: "*MENU*", "Content-Type": "application/json" },
        body: JSON.stringify(""),
      });
      const bytes = new Uint8Array(await res.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { estado: res.status, b64: btoa(bin) };
    },
    { base: BASE, numero },
  );
  return { estado: r.estado, datos: Buffer.from(r.b64, "base64") };
}
