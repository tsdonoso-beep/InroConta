// From the usual SOL menu to «Consultar Emisión y Recepción» of the withholding certificates (CRE), and
// the API its page uses (2.ª reconnaissance, 14/10/2026):
//   POST ./buscarComprobanteEmiRec       the list of a date range, issued or received (JSON)
//   GET  ./cargarDetalleComprobante?…    one CRE: an HTML page that carries the CRE (objRetencion) and the
//                                        invoices it covers (lstDocumentosRelacionados) as JSON in its script
//   GET  ./descargarArchivo/PDF | /XML   the files of the LAST detail loaded in the session: one CRE at a
//                                        time, detail first (like «obtener» before «descargar» in SPOT)
// Everything is asked from inside the form's frame, with its cookies.
import type { Frame, Page } from 'playwright';
import type { Bitacora } from '../comun/bitacora.mts';
import { ErrorSesion, guardarEvidencia } from '../sol/sesion.mts';

const RUTA = ['Empresas', 'Comprobantes de pago', 'SEE - SOL', 'Comprobante de Retención Electrónico', 'Consultar Emisión y Recepción'];

/** A CRE as the list gives it. */
export interface CreLista {
    numRuc: string;
    codCpe: string;
    numSerieCpe: string;
    numCpe: number;
    numDocRecep: string;
    fechaEmision: number;
    codRegimenRet: string;
    montoTotalRetenido: number;
    codEstadoCpe: string;
    numTicket?: number | string;
}

/** The detail: the CRE (objRetencion) and the invoices it covers. */
export interface CreDetalle {
    cre: Record<string, unknown>;
    documentos: Record<string, unknown>[];
}

/** Clicks the first VISIBLE element with that exact text, in any frame. */
async function clicVisible(p: Page, t: string, ms = 20000): Promise<boolean> {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
        for (const f of p.frames()) {
            const c = f.getByText(t, { exact: true });
            for (let i = 0; i < (await c.count().catch(() => 0)); i++)
                if (
                    (await c
                        .nth(i)
                        .isVisible()
                        .catch(() => false)) &&
                    (await c
                        .nth(i)
                        .click({ timeout: 5000 })
                        .then(
                            () => true,
                            () => false,
                        ))
                )
                    return true;
        }
        await p.waitForTimeout(400);
    }
    return false;
}

/** The menu path to the form, without leaving the menu (leaving it closes the SOL session). */
export async function abrirConsulta(b: Bitacora, page: Page): Promise<Frame> {
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    for (const t of RUTA) {
        if (!(await clicVisible(page, t))) {
            await guardarEvidencia(b, page, 'menu-retenciones');
            throw new Error(`no apareció «${t}» en el menú`);
        }
        await page.waitForTimeout(1500);
    }
    const fin = Date.now() + 40000;
    while (Date.now() < fin) {
        const f = page
            .context()
            .pages()
            .flatMap((pg) => pg.frames())
            .find((x) => /ol-ti-itcpretencion/i.test(x.url()));
        if (f) {
            await f.waitForLoadState('domcontentloaded').catch(() => {});
            return f;
        }
        await page.waitForTimeout(500);
    }
    await guardarEvidencia(b, page, 'formulario-retenciones');
    throw new Error('el formulario de retenciones (ol-ti-itcpretencion) no apareció en 40 s');
}

async function pedir(f: Frame, url: string, cuerpo?: string): Promise<{ estado: number; texto: string }> {
    const r = await f.evaluate(
        async ([u, c]) => {
            const res = await fetch(u, {
                method: c === null ? 'GET' : 'POST',
                headers:
                    c === null
                        ? { 'X-Requested-With': 'XMLHttpRequest' }
                        : { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
                body: c ?? undefined,
                credentials: 'include',
            });
            return { estado: res.status, texto: await res.text() };
        },
        [url, cuerpo ?? null] as const,
    );
    if (r.estado === 401 || r.estado === 403 || /loginMenuSol|txtRuc/.test(r.texto.slice(0, 3000)))
        throw new ErrorSesion(`${url.split('?')[0]} respondió ${r.estado} o la pantalla de ingreso: venció la sesión`);
    return r;
}

/** The CREs of a date range (dd/mm/aaaa), issued or received, every state, any series. */
export async function buscar(
    f: Frame,
    sentido: 'emitido' | 'recibido',
    desde: string,
    hasta: string,
): Promise<{ estado: number; lista: CreLista[] | null; texto: string }> {
    const cuerpo = new URLSearchParams({
        opcionTipoCompReten: sentido,
        tipoDocReceptor: '000',
        numDocReceptor: '',
        serieCompReten: '',
        numeroCompReten: '',
        fechaInicio: desde,
        fechaFin: hasta,
        estadoCompReten: '000',
    }).toString();
    const r = await pedir(f, './buscarComprobanteEmiRec', cuerpo);
    try {
        const j = JSON.parse(r.texto) as { listaCompRetencion?: CreLista[] };
        return { estado: r.estado, lista: j.listaCompRetencion ?? [], texto: r.texto };
    } catch {
        return { estado: r.estado, lista: null, texto: r.texto };
    }
}

/** The JSON a script of the page assigns to `nombre` («objRetencion = {…};»). */
export function jsonDeScript(html: string, nombre: string): unknown {
    const m = new RegExp(`${nombre}\\s*=\\s*(\\{[\\s\\S]*?\\}|\\[[\\s\\S]*?\\]);\\s*\\n`).exec(html);
    if (!m) return null;
    try {
        return JSON.parse(m[1]);
    } catch {
        return null;
    }
}

/** One CRE's detail; it also leaves that CRE in the session for descargar(). */
export async function detalle(f: Frame, c: CreLista): Promise<CreDetalle> {
    const q = new URLSearchParams({ codCpe: c.codCpe, numSerieCpe: c.numSerieCpe, numCpe: String(c.numCpe), numRuc: c.numRuc });
    const r = await pedir(f, `./cargarDetalleComprobante?${q}`);
    const cre = jsonDeScript(r.texto, 'objRetencion') as Record<string, unknown> | null;
    const documentos = jsonDeScript(r.texto, 'lstDocumentosRelacionados') as Record<string, unknown>[] | null;
    if (r.estado !== 200 || !cre) throw new Error(`cargarDetalleComprobante: HTTP ${r.estado}, ${cre ? '' : 'sin objRetencion'}`);
    return { cre, documentos: documentos ?? [] };
}

/** The PDF or XML of the last detail loaded; null if SUNAT gives nothing (a reverted CRE has no download). */
export async function descargar(f: Frame, tipo: 'PDF' | 'XML'): Promise<Buffer | null> {
    const r = await f.evaluate(async (u) => {
        const res = await fetch(u, { credentials: 'include' });
        return { estado: res.status, bytes: Array.from(new Uint8Array(await res.arrayBuffer())) };
    }, `./descargarArchivo/${tipo}`);
    const datos = Buffer.from(r.bytes);
    const firma = datos.subarray(0, 5).toString('latin1');
    const ok = tipo === 'PDF' ? firma.startsWith('%PDF') : firma.startsWith('<?xml') || firma.startsWith('<') || firma.startsWith('PK');
    return r.estado === 200 && ok ? datos : null;
}
