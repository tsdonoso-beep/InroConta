// Opens the INROCONTA view page (apps-script/inroconta/VistaEjecutivaPagina.html) in a real
// browser without Google: the HTML is served from a fake origin and
// google.script.run is replaced by a stub that answers each server function
// with a canned response. By default the SUNAT data is what the real
// VistaEjecutiva.gs builds from the fixture DETALLE tab.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { callFromPage, loadAppsScript } from '../helpers/apps-script.mts';
import { sunatFicha } from '../fixtures/base-data.mts';
import { DETAIL_TAB, detailGrid } from '../fixtures/detail-sheet.mts';
import type { ViewData } from '../fixtures/view-data.mts';

const ROOT = join(import.meta.dirname, '..', '..');
const PAGE_URL = 'https://inroconta.test/';

/** Server functions the page may call, and what each one answers. */
export type Responses = Record<string, { ok: unknown } | { fails: string }>;

export function fixtureViewData() {
    const scope = loadAppsScript(['apps-script/inroconta/VistaEjecutiva.gs'], { sheets: { [DETAIL_TAB]: detailGrid() } });
    return callFromPage<ViewData>(scope, 'datosCompactosVista_');
}

export function defaultResponses(): Responses {
    return {
        datosDeLaVistaEjecutiva: { ok: fixtureViewData() },
        datosDeLaBaseVista: { ok: { error: 'Sin base en las pruebas.' } },
        // Every RUC opened in Consulta RUC gets this ficha (one stubbed answer per function).
        fichaRucVista: { ok: { ficha: sunatFicha() } },
    };
}

/** Installs the google.script.run stub. Runs inside the page, before its own scripts. */
function installStub(responses: Responses) {
    const make = (success?: (v: unknown) => void, failure?: (e: Error) => void): unknown =>
        new Proxy(
            {},
            {
                get(_target, name: string) {
                    if (name === 'withSuccessHandler') return (fn: (v: unknown) => void) => make(fn, failure);
                    if (name === 'withFailureHandler') return (fn: (e: Error) => void) => make(success, fn);
                    if (name === 'withUserObject') return () => make(success, failure);
                    return () => {
                        const r = responses[name];
                        setTimeout(() => {
                            if (!r) failure?.(new Error(`No stubbed response for ${name}`));
                            else if ('fails' in r) failure?.(new Error(r.fails));
                            else success?.(r.ok);
                        }, 10);
                    };
                },
            },
        );
    Object.assign(window, { google: { script: { run: make() } } });
}

const APP_DIR = join(ROOT, 'apps-script', 'inroconta');

/**
 * The page as HtmlService serves it: each `<?!= include_('Name') ?>` scriptlet replaced by
 * that file (VistaEjecutiva.gs → include_). Any other scriptlet fails, so a new one is noticed.
 */
export function renderPage(file = 'VistaEjecutivaPagina'): string {
    const html = readFileSync(join(APP_DIR, `${file}.html`), 'utf8');
    const rendered = html.replace(/<\?!=\s*include_\('([\w/-]+)'\)\s*\?>/g, (_, name: string) => readFileSync(join(APP_DIR, `${name}.html`), 'utf8'));
    if (rendered.includes('<?')) throw new Error(`${file}.html has a scriptlet the test server does not render`);
    return rendered;
}

// The web font of shared/Styles. Tests stay offline (fallback font); pnpm dev lets it through.
const FONT_HOSTS = ['https://fonts.googleapis.com/', 'https://fonts.gstatic.com/'];

/** Opens the view (or another page of the app) with the given responses (the fixture ones by default). */
export async function openView(page: Page, responses: Responses = defaultResponses(), file = 'VistaEjecutivaPagina', { fonts = false } = {}) {
    // Rendered on every request, so a reload (pnpm dev) shows the files as they are now.
    await page.route('**/*', (route) => {
        const url = route.request().url();
        if (url === PAGE_URL) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: renderPage(file) });
        return fonts && FONT_HOSTS.some((h) => url.startsWith(h)) ? route.continue() : route.abort();
    });
    await page.addInitScript(installStub, responses);
    await page.goto(PAGE_URL);
}
