// La consulta SPOT de SOL («Consulta de Pago de Detracciones»): menú nuevo, filtros, tabla y constancia.
//
// Recorrido (pantallazos del 07/10/2026, docs/detracciones-spot.md §4):
//   login en MenuInternetPlataforma.htm (el menú nuevo, con su propio login) → «Opciones» → Mis declaraciones y pagos → Consultas
//   → Consultas de Presentación y Pago → Consulta de Pago de Detracciones
//   → filtros (fechas vacías, tipo de cuenta, período) → «Consultar» → tabla
//   → número azul de «Constancia» → modal → «Guardar» → constancia_dtr_<número>.html

import type { BrowserContext, Download, Frame, Page } from "playwright";
import type { Bitacora } from "../comun/bitacora.mts";
import { ErrorSesion, entrar, guardarEvidencia, irConReintento, menuVisible } from "../sol/sesion.mts";

/** El menú nuevo de SOL. Sin sesión, SUNAT redirige al ingreso (con un `state` nuevo cada vez). */
export const MENU_PLATAFORMA = "https://e-menu.sunat.gob.pe/cl-ti-itmenu2/MenuInternetPlataforma.htm?pestana=*&agrupacion=*";

// Textos EXACTOS: «Mis declaraciones y pagos» (árbol) no es «Mis Declaraciones y Pagos» (botón de arriba),
// y «Consultas» no es «Consultas de Presentación y Pago».
const RUTA = ["Opciones", "Mis declaraciones y pagos", "Consultas", "Consultas de Presentación y Pago", "Consulta de Pago de Detracciones"];
const OPCION = RUTA[RUTA.length - 1];

/**
 * ENTRADA=antiguo: el menú nuevo en una pestaña APARTE, después del login por
 * el menú de siempre. El menú nuevo tiene su propio cliente en api-seguridad
 * (59d39217-…) y NO toma esa sesión: pide ingresar otra vez (3.ª corrida,
 * 08/10/2026), y se ingresa ahí también. Son dos logins seguidos —puede pedir
 * captcha—: por eso lo normal es ENTRADA=directo. La pestaña del menú de
 * siempre NO se cierra ni se navega: salir de ella cierra la sesión.
 */
export async function abrirMenuNuevo(b: Bitacora, ctx: BrowserContext): Promise<Page> {
  const p = await ctx.newPage();
  p.on("dialog", d => {
    d.accept().catch(() => {});
  });
  await irConReintento(b, p, MENU_PLATAFORMA, "menu-nuevo");
  const fin = Date.now() + 60000;
  while (Date.now() < fin) {
    if (await menuVisible(p)) {
      b.log("info", "menu-nuevo", "menú nuevo abierto con la misma sesión");
      return p;
    }
    if (
      await p
        .locator("#txtRuc")
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      b.log("aviso", "menu-nuevo", "el menú nuevo pide ingresar otra vez (tiene su propio login): se ingresa");
      await entrar(b, p, "login-menu-nuevo", MENU_PLATAFORMA);
      return p;
    }
    await p.waitForTimeout(500);
  }
  await guardarEvidencia(b, p, "menu-nuevo-sin-menu");
  throw new ErrorSesion("el menú nuevo no apareció en 60 s");
}

/** Un control del formulario, tal cual lo ve la página (para anotar ids y opciones reales). */
export interface Control {
  etiqueta: string;
  tag: string;
  tipo: string;
  id: string;
  name: string;
  placeholder: string;
  valor: string;
  visible: boolean;
  opciones?: { valor: string; texto: string; elegida: boolean }[];
}

/** El primer elemento VISIBLE con ese texto exacto, en cualquier recuadro de la pestaña. */
async function visibleExacto(page: Page, texto: string) {
  for (const f of page.frames()) {
    const c = f.getByText(texto, { exact: true });
    const n = await c.count().catch(() => 0);
    for (let i = 0; i < n; i++)
      if (
        await c
          .nth(i)
          .isVisible()
          .catch(() => false)
      )
        return c.nth(i);
  }
  return null;
}

async function clicExacto(page: Page, texto: string, timeoutMs = 20000): Promise<boolean> {
  const fin = Date.now() + timeoutMs;
  while (Date.now() < fin) {
    const el = await visibleExacto(page, texto);
    if (
      el &&
      (await el.click({ timeout: 5000 }).then(
        () => true,
        () => false,
      ))
    )
      return true;
    await page.waitForTimeout(400);
  }
  return false;
}

/** El recuadro (o pestaña nueva) donde quedó la consulta SPOT: el que muestra «Periodo Tributario». */
export async function marcoSpot(ctx: BrowserContext): Promise<Frame | null> {
  for (const p of ctx.pages())
    for (const f of p.frames()) {
      const ok = await f
        .getByText("Periodo Tributario", { exact: false })
        .first()
        .isVisible()
        .catch(() => false);
      if (ok) return f;
    }
  return null;
}

async function esperarSpot(ctx: BrowserContext, ms: number): Promise<Frame | null> {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    const f = await marcoSpot(ctx);
    if (f) return f;
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

/**
 * Del menú a la consulta SPOT, sin salir del menú (salir cierra la sesión).
 * Si un nivel ya está desplegado se salta (clicarlo de nuevo lo cerraría). Si
 * el árbol no responde, se prueba el buscador «Busque una opción del menú».
 */
export async function abrirConsultaSpot(b: Bitacora, page: Page): Promise<Frame> {
  for (let i = 0; i < RUTA.length; i++) {
    let j = RUTA.length - 1;
    while (j > i && !(await visibleExacto(page, RUTA[j]))) j--;
    i = j;
    b.log("info", "menu", `clic en «${RUTA[i]}»`);
    if (!(await clicExacto(page, RUTA[i]))) {
      b.log("aviso", "menu", `no apareció «${RUTA[i]}»: se prueba el buscador del menú`);
      await guardarEvidencia(b, page, `menu-sin-${i + 1}`);
      if (!(await porBuscador(page))) throw new Error(`no se llegó a la consulta SPOT: falta «${RUTA[i]}»`);
      break;
    }
    await page.waitForTimeout(1200);
  }
  const f = await esperarSpot(page.context(), 60000);
  if (f) return f;
  await guardarEvidencia(b, page, "spot-no-abrio");
  throw new Error("se eligió la opción pero la consulta SPOT no apareció en 60 s");
}

async function porBuscador(page: Page): Promise<boolean> {
  for (const f of page.frames()) {
    const caja = f.getByPlaceholder("Busque una opción del menú").first();
    if (!(await caja.isVisible().catch(() => false))) continue;
    await caja.fill("Detracciones");
    return clicExacto(page, OPCION, 15000);
  }
  return false;
}

/** Todos los campos y desplegables de la consulta, con sus opciones. */
export function controles(f: Frame): Promise<Control[]> {
  return f.evaluate(() =>
    Array.from(document.querySelectorAll("input, select, textarea, button")).map(el => {
      const e = el as HTMLInputElement & HTMLSelectElement;
      const fila = el.closest(".form-group, .row, tr");
      const r = (el as HTMLElement).getBoundingClientRect();
      return {
        etiqueta: (fila?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
        tag: el.tagName.toLowerCase(),
        tipo: e.type ?? "",
        id: el.id,
        name: e.name ?? "",
        placeholder: e.placeholder ?? "",
        valor: el.tagName === "BUTTON" ? (el.textContent ?? "").trim() : (e.value ?? ""),
        visible: r.width > 0 && r.height > 0,
        opciones:
          el.tagName === "SELECT"
            ? Array.from(e.options).map(o => ({ valor: o.value, texto: o.text.trim(), elegida: o.selected }))
            : undefined,
      };
    }),
  );
}

/**
 * Filtros: fechas vacías, el tipo de cuenta cuyo texto contenga `tipoCuenta`
 * y el período. Lo que no se encuentre queda anotado en la bitácora: es un
 * reconocimiento, se sigue con lo que haya.
 */
export async function llenarFiltros(b: Bitacora, f: Frame, periodo: string, tipoCuenta: string): Promise<void> {
  const lista = await controles(f);
  for (const c of lista.filter(c => c.tag === "input" && c.visible && /^\d{2}\/\d{2}\/\d{4}$/.test(c.valor))) {
    await f.locator(selector(c)).first().fill("");
    b.log("info", "filtros", `fecha vaciada (${selector(c)}, tenía ${c.valor})`);
  }
  const cuenta = lista.find(c => c.tag === "select" && c.opciones?.some(o => /convencional/i.test(o.texto)));
  const opcion = cuenta?.opciones?.find(o => o.texto.toLowerCase().includes(tipoCuenta.toLowerCase()));
  if (cuenta && opcion) {
    await f.locator(selector(cuenta)).first().selectOption(opcion.valor);
    b.log("info", "filtros", `tipo de cuenta: «${opcion.texto}»`);
  } else b.log("aviso", "filtros", `no se encontró el tipo de cuenta «${tipoCuenta}»`);
  const per = lista.find(c => c.tag === "input" && /aaaamm/i.test(c.placeholder));
  if (!per) return b.log("aviso", "filtros", "no se encontró el campo del período (placeholder aaaamm)");
  const campo = f.locator(selector(per)).first();
  await campo.fill(periodo);
  // Si el selector de mes no tomó lo escrito, se fija el valor y se avisa a la página.
  if ((await campo.inputValue()) !== periodo)
    await campo.evaluate((el, v) => {
      (el as HTMLInputElement).value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, periodo);
  await campo.press("Escape").catch(() => {});
  b.log("info", "filtros", `período: escrito ${periodo}, quedó «${await campo.inputValue()}»`);
}

function selector(c: Control): string {
  if (c.id) return /^[A-Za-z][\w-]*$/.test(c.id) ? `#${c.id}` : `[id="${c.id}"]`;
  if (c.name) return `${c.tag}[name="${c.name}"]`;
  return `${c.tag}[placeholder="${c.placeholder}"]`;
}

export async function consultar(f: Frame): Promise<void> {
  await f.getByRole("button", { name: "Consultar" }).first().click();
}

/** Los números azules de la columna «Constancia» (enlaces de solo dígitos). */
export function enlacesConstancia(f: Frame) {
  return f.locator("a").filter({ hasText: /^\s*\d{6,}\s*$/ });
}

/** El modal de la constancia, ya abierto. */
export function modalConstancia(f: Frame) {
  return f.locator(".modal, [role=dialog]").filter({ hasText: "CONSTANCIA DE DEP" }).first();
}

/** «Guardar» del modal → el HTML que entrega SUNAT. */
export async function guardarConstancia(f: Frame): Promise<{ nombre: string; datos: Buffer }> {
  const modal = modalConstancia(f);
  const [d] = await Promise.all([
    f.page().waitForEvent("download", { timeout: 60000 }) as Promise<Download>,
    modal.getByText("Guardar", { exact: true }).first().click(),
  ]);
  const trozos: Buffer[] = [];
  for await (const t of await d.createReadStream()) trozos.push(t as Buffer);
  return { nombre: d.suggestedFilename(), datos: Buffer.concat(trozos) };
}

/** Cierra el modal con su ×, o con Escape. */
export async function cerrarConstancia(f: Frame): Promise<void> {
  const modal = modalConstancia(f);
  const x = modal.locator("button.close, [aria-label=Close], [data-dismiss=modal]").first();
  if (await x.isVisible().catch(() => false)) await x.click().catch(() => {});
  else await f.page().keyboard.press("Escape");
  await modal.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
}
