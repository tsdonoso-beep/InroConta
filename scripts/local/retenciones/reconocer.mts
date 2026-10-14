// Reconnaissance of «Consultar Emisión y Recepción» of the IGV withholding certificates (comprobantes de
// retención, CRE), in the usual SOL menu (MenuInternet.htm, option 11.5.8, the one of the XML robots):
//   Empresas → Comprobantes de pago → SEE - SOL → Comprobante de Retención Electrónico
//   → Consultar Emisión y Recepción
// The form lives in ww1.sunat.gob.pe/ol-ti-itcpretencion/consulta/ and answers JSON (2.ª corrida,
// 14/10/2026): buscarComprobanteEmiRec lists the certificates, cargarDetalleComprobante shows one.
// From inside that frame this asks, by the same API the page uses:
//   1. the ISSUED and the RECEIVED certificates of a date range, WITHOUT a series (the form brings E001,
//      which hid the received ones: each client has its own series);
//   2. the detail of the first DETALLES of each side (which invoices it covers, payment dates?);
//   3. the downloads the detail offers (XML, PDF…), if any.
// It SAVES NOTHING in the base or Drive. Everything goes to scripts/out/logs/retenciones-reconocer-<date>/:
//   capturas/, formulario.html, <sentido>.json (the list), detalle-<sentido>-<serie>-<n>.html and its
//   downloads, red.jsonl + red/ (without keys, tokens or cookies), resumen.json.
//
// Use:   pnpm retenciones:reconocer
//        DESDE=01/01/2026 HASTA=14/10/2026 DETALLES=3 HEADLESS=0 pnpm retenciones:reconocer
// The same SOL account as the other robots: never at the same time as another run with it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Frame, Page } from 'playwright';
import { num, texto } from '../comun/config.mts';
import { crearBitacora, primeraLinea, vigilarProceso } from '../comun/bitacora.mts';
import { abrirNavegador, entrar, guardarEvidencia, nuevoContexto } from '../sol/sesion.mts';
import { limpiarTexto, limpiarUrl, registrarRed } from '../detracciones/red.mts';

const hoy = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
const DESDE = texto('DESDE', `01/01/${hoy.slice(6)}`);
const HASTA = texto('HASTA', hoy);
const DETALLES = Math.max(0, num('DETALLES', 2));
const RUTA = ['Empresas', 'Comprobantes de pago', 'SEE - SOL', 'Comprobante de Retención Electrónico', 'Consultar Emisión y Recepción'];

interface Cre {
    numRuc: string;
    codCpe: string;
    numSerieCpe: string;
    numCpe: number;
    numDocRecep: string;
    fechaEmision: number;
    montoTotalRetenido: number;
    codEstadoCpe: string;
}

const b = crearBitacora('retenciones-reconocer');
vigilarProceso(b);
mkdirSync(join(b.dir, 'capturas'), { recursive: true });
const resumen: Record<string, unknown> = { desde: DESDE, hasta: HASTA };

const nav = await abrirNavegador();
const ctx = await nuevoContexto(nav);
const page = await ctx.newPage();
page.on('dialog', (d) => {
    b.log('aviso', 'dialogo', `la página mostró: «${d.message().slice(0, 200)}»`);
    d.accept().catch(() => {});
});

try {
    await entrar(b, page, 'login');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const red = registrarRed(b, ctx);
    for (const t of RUTA) {
        if (!(await clicVisible(page, t))) throw new Error(`no apareció «${t}» en el menú`);
        await page.waitForTimeout(1500);
    }
    const form = await esperarFormulario(page);
    resumen.urlFormulario = limpiarUrl(form.url());
    writeFileSync(join(b.dir, 'formulario.html'), limpiarTexto(await form.content()));
    await page.screenshot({ path: join(b.dir, 'capturas', '01-formulario.png'), fullPage: true }).catch(() => {});

    for (const sentido of ['emitido', 'recibido'] as const) resumen[sentido] = await lado(form, sentido);
    resumen.pedidosDeRed = red.pedidos();
} catch (e) {
    resumen.error = primeraLinea(e);
    b.log('error', 'reconocer', primeraLinea(e));
    for (const p of ctx.pages()) await guardarEvidencia(b, p, 'fallo');
} finally {
    writeFileSync(join(b.dir, 'resumen.json'), JSON.stringify(resumen, null, 2));
    b.log('info', 'resumen', JSON.stringify(resumen).slice(0, 3000));
    await nav.close().catch(() => {});
}
process.exit(resumen.error ? 1 : 0);

/** The list of one side, and the detail (and downloads) of its first DETALLES certificates. */
async function lado(form: Frame, sentido: 'emitido' | 'recibido'): Promise<Record<string, unknown>> {
    const cuerpo = new URLSearchParams({
        opcionTipoCompReten: sentido,
        tipoDocReceptor: '000',
        numDocReceptor: '',
        serieCompReten: '',
        numeroCompReten: '',
        fechaInicio: DESDE,
        fechaFin: HASTA,
        estadoCompReten: '000',
    }).toString();
    const t0 = Date.now();
    const r = await pedir(form, './buscarComprobanteEmiRec', cuerpo);
    writeFileSync(join(b.dir, `${sentido}.json`), r.texto);
    const out: Record<string, unknown> = { estado: r.estado, ms: Date.now() - t0 };
    let lista: Cre[] = [];
    try {
        const j = JSON.parse(r.texto) as { mensaje?: string; listaCompRetencion?: Cre[] };
        lista = j.listaCompRetencion ?? [];
        out.mensaje = j.mensaje;
    } catch {
        out.noEsJson = r.texto.slice(0, 300);
    }
    out.comprobantes = lista.length;
    out.estados = lista.reduce<Record<string, number>>((a, c) => ((a[c.codEstadoCpe] = (a[c.codEstadoCpe] ?? 0) + 1), a), {});
    out.series = [...new Set(lista.map((c) => `${c.numRuc}-${c.numSerieCpe}`))].slice(0, 20);
    out.retenido = Math.round(lista.reduce((a, c) => a + (c.montoTotalRetenido || 0), 0) * 100) / 100;
    b.log('info', sentido, `${lista.length} comprobante(s) de ${DESDE} a ${HASTA} · S/ ${out.retenido} · ${out.ms} ms · ${out.mensaje ?? ''}`);

    const detalles: Record<string, unknown>[] = [];
    for (const c of lista.slice(0, DETALLES)) detalles.push(await detalle(form, sentido, c));
    out.detalles = detalles;
    return out;
}

async function detalle(form: Frame, sentido: string, c: Cre): Promise<Record<string, unknown>> {
    const q = new URLSearchParams({ codCpe: c.codCpe, numSerieCpe: c.numSerieCpe, numCpe: String(c.numCpe), numRuc: c.numRuc });
    const r = await pedir(form, `./cargarDetalleComprobante?${q}`);
    const nombre = `detalle-${sentido}-${c.numSerieCpe}-${c.numCpe}`;
    writeFileSync(join(b.dir, `${nombre}.html`), limpiarTexto(r.texto));
    // What the detail shows in words (invoices, dates, amounts) and the links it offers (downloads?).
    const visto = await form.evaluate((html) => {
        const d = new DOMParser().parseFromString(html, 'text/html');
        const enlaces = Array.from(d.querySelectorAll('a, button, input[type=button], form'))
            .map((e) => ({
                texto: (e.textContent || (e as HTMLInputElement).value || '').replace(/\s+/g, ' ').trim().slice(0, 60),
                href: e.getAttribute('href') || e.getAttribute('action') || '',
                onclick: (e.getAttribute('onclick') || '').slice(0, 200),
            }))
            .filter((e) => e.href || e.onclick || /descarg|xml|pdf|imprim|cdr/i.test(e.texto));
        return { texto: (d.body?.innerText || d.body?.textContent || '').replace(/\s+/g, ' ').slice(0, 3000), enlaces };
    }, r.texto);
    writeFileSync(join(b.dir, `${nombre}.txt`), visto.texto);
    const descargas: Record<string, unknown>[] = [];
    for (const e of visto.enlaces.filter((x) => /descarg|xml|pdf|imprim|cdr/i.test(`${x.texto} ${x.href} ${x.onclick}`)).slice(0, 4)) {
        const url = e.href && !e.href.startsWith('#') && !/^javascript/i.test(e.href) ? e.href : '';
        if (!url) {
            descargas.push({ ...e, resultado: 'sin href (lo hace un script: ver el onclick)' });
            continue;
        }
        const d = await pedirBinario(form, url);
        const archivo = `${nombre}-${descargas.length + 1}.${/pdf/i.test(d.tipo) ? 'pdf' : /xml/i.test(d.tipo) ? 'xml' : /zip/i.test(d.tipo) ? 'zip' : 'bin'}`;
        if (d.bytes.length) writeFileSync(join(b.dir, archivo), Buffer.from(d.bytes));
        descargas.push({ ...e, estado: d.estado, tipo: d.tipo, bytes: d.bytes.length, archivo });
    }
    b.log('info', 'detalle', `${c.numSerieCpe}-${c.numCpe}: HTTP ${r.estado} · ${r.texto.length} bytes · ${descargas.length} descarga(s)`);
    return { comprobante: `${c.numSerieCpe}-${c.numCpe}`, estado: r.estado, enlaces: visto.enlaces.slice(0, 15), descargas, texto: visto.texto.slice(0, 800) };
}

/** A request from inside the form's frame (same cookies and origin as the page). */
function pedir(f: Frame, url: string, cuerpo?: string): Promise<{ estado: number; texto: string }> {
    return f.evaluate(
        async ([u, c]) => {
            const r = await fetch(u, {
                method: c === null ? 'GET' : 'POST',
                headers:
                    c === null
                        ? { 'X-Requested-With': 'XMLHttpRequest' }
                        : { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
                body: c ?? undefined,
                credentials: 'include',
            });
            return { estado: r.status, texto: await r.text() };
        },
        [url, cuerpo ?? null] as const,
    );
}

function pedirBinario(f: Frame, url: string): Promise<{ estado: number; tipo: string; bytes: number[] }> {
    return f.evaluate(async (u) => {
        const r = await fetch(u, { credentials: 'include' });
        return { estado: r.status, tipo: r.headers.get('content-type') ?? '', bytes: Array.from(new Uint8Array(await r.arrayBuffer())) };
    }, url);
}

async function esperarFormulario(p: Page): Promise<Frame> {
    const fin = Date.now() + 40000;
    while (Date.now() < fin) {
        const f = ctx
            .pages()
            .flatMap((pg) => pg.frames())
            .find((x) => /ol-ti-itcpretencion/i.test(x.url()));
        if (f) {
            await f.waitForLoadState('domcontentloaded').catch(() => {});
            return f;
        }
        await p.waitForTimeout(500);
    }
    throw new Error('el formulario de retenciones (ol-ti-itcpretencion) no apareció en 40 s');
}

/** Clicks the first VISIBLE element with that exact text, in any frame. */
async function clicVisible(p: Page, t: string, ms = 20000): Promise<boolean> {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
        for (const f of p.frames()) {
            const c = f.getByText(t, { exact: true });
            for (let i = 0; i < (await c.count().catch(() => 0)); i++)
                if (
                    await c
                        .nth(i)
                        .isVisible()
                        .catch(() => false)
                )
                    if (
                        await c
                            .nth(i)
                            .click({ timeout: 5000 })
                            .then(
                                () => true,
                                () => false,
                            )
                    )
                        return true;
        }
        await p.waitForTimeout(400);
    }
    return false;
}
