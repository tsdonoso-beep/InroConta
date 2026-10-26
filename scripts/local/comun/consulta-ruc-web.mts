// The public Consulta RUC page, driven by a real browser. Shared by the daily robot
// (scripts/consultar-padron-ruc.mts) and the ficha backfill (scripts/refresh-ruc-fichas.mts).
//
// «Buscar» fires a reCAPTCHA v3 that only a real browser resolves: the page itself runs
// grecaptcha.execute(...) on the click, and only then posts the form to jcrS00Alias. Nothing
// here builds a token or a header by hand — we type the RUC and click, like a person.

import { chromium, type Browser, type Page } from 'playwright';
import { leerResultadoConsultaRuc, type CondicionRuc } from '../../../src/shared/lib/sunat/consulta-ruc.ts';
import { HEADLESS } from './config.mts';

export const URL_CONSULTA_RUC = 'https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/FrameCriterioBusquedaWeb.jsp';

// A real browser User-Agent: without it SUNAT's WAF treats the request differently
// (seen with the SOL portal in descargar-cpe.mts).
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

// PATCHRIGHT=1 drives Chrome through patchright, a Playwright fork that hides the automation
// leaks Cloudflare looks for; the test is whether it passes without a window (HEADLESS=1).
const PATCHRIGHT = process.env.PATCHRIGHT?.trim() === '1';
const CHANNEL = process.env.BROWSER_CHANNEL?.trim() || 'chrome';

// HEADLESS=0 opens a visible window: since 21/10/2026 Cloudflare challenges the headless one on every query.
export async function launchBrowser(): Promise<Browser> {
    if (!PATCHRIGHT) return chromium.launch({ headless: HEADLESS, args: ['--disable-blink-features=AutomationControlled'] });
    const { chromium: patched } = await import('patchright');
    console.log(`  · patchright, canal ${CHANNEL}, ${HEADLESS ? 'sin ventana' : 'con ventana'}`);
    return (await patched.launch({ channel: CHANNEL, headless: HEADLESS })) as unknown as Browser;
}

/**
 * patchright asks not to fake the User-Agent: a Windows one on a Linux runner is itself a tell. Only
 * the «HeadlessChrome» word of the real one is swapped, so it still matches the platform.
 */
async function userAgentFor(browser: Browser): Promise<string> {
    if (!PATCHRIGHT) return USER_AGENT;
    const probe = await browser.newPage();
    const real = await probe.evaluate(() => navigator.userAgent);
    await probe.context().close();
    return real.replace('HeadlessChrome', 'Chrome');
}

/** A tab in its own context (own cookies): the reCAPTCHA sees each one as a separate visit. */
export async function newRucPage(browser: Browser): Promise<Page> {
    return (await browser.newContext({ locale: 'es-PE', userAgent: await userAgentFor(browser) })).newPage();
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
