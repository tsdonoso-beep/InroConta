// Del menú nuevo de SOL a la consulta SPOT («Consulta de Pago de Detracciones»).
//
// Recorrido (pantallazos del 07/10/2026 y corridas del 08/10/2026, docs/detracciones-spot.md §4 y §7):
//   login en MenuInternetPlataforma.htm (el menú nuevo, con su propio login)
//   → la opción 55.2.1.1.4, elegida como lo hace la misma página (porCodigo)
//   → respaldo: «Opciones» → Mis declaraciones y pagos → Consultas → Consultas de Presentación y Pago
//     → Consulta de Pago de Detracciones (porArbol), o el buscador del menú

import type { BrowserContext, Frame, Page } from 'playwright';
import type { Bitacora } from '../comun/bitacora.mts';
import { ErrorSesion, entrar, guardarEvidencia, irConReintento, menuVisible } from '../sol/sesion.mts';

/** El menú nuevo de SOL. Sin sesión, SUNAT redirige al ingreso (con un `state` nuevo cada vez). */
export const MENU_PLATAFORMA = 'https://e-menu.sunat.gob.pe/cl-ti-itmenu2/MenuInternetPlataforma.htm?pestana=*&agrupacion=*';

// Textos EXACTOS: «Mis declaraciones y pagos» (árbol) no es «Mis Declaraciones y Pagos» (botón de arriba),
// y «Consultas» no es «Consultas de Presentación y Pago».
const RUTA = ['Opciones', 'Mis declaraciones y pagos', 'Consultas', 'Consultas de Presentación y Pago', 'Consulta de Pago de Detracciones'];
const OPCION = RUTA[RUTA.length - 1];
/**
 * El código de la opción en el menú nuevo (`data-id` del árbol; 4.ª corrida, 08/10/2026). La página trae en
 * `var opciones` lo que el usuario puede abrir: el secundario solo tiene esta, con
 * `url: /plataforma/fConsultaDetracciones.html`.
 */
export const CODIGO_OPCION = '55.2.1.1.4';

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
    p.on('dialog', (d) => {
        d.accept().catch(() => {});
    });
    await irConReintento(b, p, MENU_PLATAFORMA, 'menu-nuevo');
    const fin = Date.now() + 60000;
    while (Date.now() < fin) {
        if (await menuVisible(p)) {
            b.log('info', 'menu-nuevo', 'menú nuevo abierto con la misma sesión');
            return p;
        }
        if (
            await p
                .locator('#txtRuc')
                .first()
                .isVisible()
                .catch(() => false)
        ) {
            b.log('aviso', 'menu-nuevo', 'el menú nuevo pide ingresar otra vez (tiene su propio login): se ingresa');
            await entrar(b, p, 'login-menu-nuevo', MENU_PLATAFORMA);
            return p;
        }
        await p.waitForTimeout(500);
    }
    await guardarEvidencia(b, p, 'menu-nuevo-sin-menu');
    throw new ErrorSesion('el menú nuevo no apareció en 60 s');
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
            // La consulta vive en un recuadro de e-plataformaunica (…/html/carrito.html#…). Buscar el TEXTO
            // «Periodo Tributario» no bastó en la 5.ª corrida (08/10/2026): la pantalla estaba y no se reconoció.
            // Se reconoce por sus campos (#periodo, #tipoCuenta de fconsultaDetracciones.html).
            if (!/plataformaunica\.sunat\.gob\.pe/i.test(f.url())) continue;
            const ok = await f
                .locator('#periodo')
                .first()
                .isVisible()
                .catch(() => false);
            if (
                ok &&
                (await f
                    .locator('#tipoCuenta')
                    .count()
                    .catch(() => 0))
            )
                return f;
        }
    return null;
}

async function esperarSpot(ctx: BrowserContext, ms: number): Promise<Frame | null> {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
        const f = await marcoSpot(ctx);
        if (f) return f;
        await new Promise((r) => setTimeout(r, 500));
    }
    return null;
}

/**
 * Del menú a la consulta SPOT, sin salir del menú (salir cierra la sesión).
 * Si un nivel ya está desplegado se salta (clicarlo de nuevo lo cerraría). Si
 * el árbol no responde, se prueba el buscador «Busque una opción del menú».
 */
export async function abrirConsultaSpot(b: Bitacora, page: Page): Promise<Frame> {
    // Lo de la página antes que los clics: en la 4.ª corrida el clic en «Opciones» llegó antes de que la
    // página enganchara sus eventos y no desplegó nada.
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    if (await porCodigo(b, page)) {
        const f = await esperarSpot(page.context(), 60000);
        if (f) return f;
        b.log('aviso', 'menu', `se eligió ${CODIGO_OPCION} pero la consulta no apareció en 60 s: se prueba por el árbol`);
        await guardarEvidencia(b, page, 'spot-por-codigo');
    }
    return porArbol(b, page);
}

/**
 * Elige la opción como lo hace la misma página cuando la URL trae `exe=…`:
 * clic (jQuery) en `#nivel4_55_2_1_1_4` y en sus padres. Ese clic llama a
 * `logoutAndLoad('MenuInternetPlataforma.htm?action=execute&code=55.2.1.1.4')`.
 * No depende de que el árbol esté desplegado ni visible.
 */
async function porCodigo(b: Bitacora, page: Page): Promise<boolean> {
    const id = `#nivel4_${CODIGO_OPCION.replace(/\./g, '_')}`;
    const lista = await page
        .waitForFunction(
            (sel) => {
                const $ = (window as unknown as { jQuery?: (s: string) => { length: number } }).jQuery;
                return !!$ && $(sel).length > 0;
            },
            id,
            { timeout: 20000 },
        )
        .then(
            () => true,
            () => false,
        );
    if (!lista) {
        b.log('aviso', 'menu', `la página no tiene la opción ${CODIGO_OPCION} (${id}) o no cargó jQuery`);
        return false;
    }
    const opcion = await page.evaluate((codigo) => {
        const w = window as unknown as { opciones?: string };
        try {
            const items = (JSON.parse(w.opciones ?? '[]') as { items?: { name: string; url?: string; description?: string }[] }[]).flatMap(
                (p) => p.items ?? [],
            );
            return items.find((i) => i.name === codigo) ?? null;
        } catch {
            return null;
        }
    }, CODIGO_OPCION);
    b.log('info', 'menu', `opción ${CODIGO_OPCION}: «${opcion?.description ?? '?'}» → ${opcion?.url ?? '?'}`);
    await page.evaluate((sel) => {
        type J = { trigger(e: string): void; attr(k: string): string | undefined };
        const $ = (window as unknown as { jQuery: (s: string) => J }).jQuery;
        const el = $(sel);
        el.trigger('click');
        for (const k of ['data-padre1', 'data-padre2', 'data-padre3']) {
            const padre = el.attr(k);
            if (padre) $(padre).trigger('click');
        }
    }, id);
    return true;
}

/** Respaldo: los clics por texto en el árbol, como lo hace una persona. */
async function porArbol(b: Bitacora, page: Page): Promise<Frame> {
    for (let i = 0; i < RUTA.length; i++) {
        let j = RUTA.length - 1;
        while (j > i && !(await visibleExacto(page, RUTA[j]))) j--;
        i = j;
        b.log('info', 'menu', `clic en «${RUTA[i]}»`);
        if (!(await clicExacto(page, RUTA[i]))) {
            b.log('aviso', 'menu', `no apareció «${RUTA[i]}»: se prueba el buscador del menú`);
            await guardarEvidencia(b, page, `menu-sin-${i + 1}`);
            if (!(await porBuscador(page))) throw new Error(`no se llegó a la consulta SPOT: falta «${RUTA[i]}»`);
            break;
        }
        await page.waitForTimeout(1200);
    }
    const f = await esperarSpot(page.context(), 60000);
    if (f) return f;
    await guardarEvidencia(b, page, 'spot-no-abrio');
    throw new Error('se eligió la opción pero la consulta SPOT no apareció en 60 s');
}

async function porBuscador(page: Page): Promise<boolean> {
    for (const f of page.frames()) {
        const caja = f.getByPlaceholder('Busque una opción del menú').first();
        if (!(await caja.isVisible().catch(() => false))) continue;
        await caja.fill('Detracciones');
        return clicExacto(page, OPCION, 15000);
    }
    return false;
}
