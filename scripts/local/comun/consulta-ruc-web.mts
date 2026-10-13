// The public Consulta RUC page, driven by a real browser. Shared by the daily robot
// (scripts/consultar-padron-ruc.mts) and the ficha backfill (scripts/refresh-ruc-fichas.mts).
//
// «Buscar» fires a reCAPTCHA v3 that only a real browser resolves: the page itself runs
// grecaptcha.execute(...) on the click, and only then posts the form to jcrS00Alias. Nothing
// here builds a token or a header by hand — we type the RUC and click, like a person.

import { chromium, type Browser, type Page } from 'playwright';
import { leerResultadoConsultaRuc, type CondicionRuc } from '../../../src/shared/lib/sunat/consulta-ruc.ts';

export const URL_CONSULTA_RUC = 'https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/FrameCriterioBusquedaWeb.jsp';

// A real browser User-Agent: without it SUNAT's WAF treats the request differently
// (seen with the SOL portal in descargar-cpe.mts).
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export function launchBrowser(): Promise<Browser> {
    return chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] });
}

/** A tab in its own context (own cookies): the reCAPTCHA sees each one as a separate visit. */
export async function newRucPage(browser: Browser): Promise<Page> {
    return (await browser.newContext({ locale: 'es-PE', userAgent: USER_AGENT })).newPage();
}

/** Queries one RUC and reads the result page. */
export async function consultarRuc(page: Page, ruc: string): Promise<CondicionRuc> {
    await page.goto(URL_CONSULTA_RUC, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#txtRuc', { timeout: 30000 });

    await page.fill('#txtRuc', ruc);
    await page.click('#btnAceptar');

    // After the click grecaptcha resolves the token (silent, no UI) and the form navigates to jcrS00Alias.
    await page.waitForURL(/jcrS00Alias/i, { timeout: 30000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    return leerResultadoConsultaRuc(await page.content(), ruc);
}

/** A random pause between queries: a human rhythm, not a loop. */
export function randomPause(minMs: number, maxMs: number): Promise<void> {
    return new Promise((r) => setTimeout(r, minMs + Math.random() * (maxMs - minMs)));
}
