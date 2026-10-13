// pnpm dev — opens the INROCONTA view in a local browser window with the test
// data (tests/fixtures), the same way the end-to-end tests serve it: no Google
// data, nothing deployed (only the web font is fetched). For seeing an interface
// change at once. `pnpm dev colores` opens the palette sheet (Colors.html) instead.
// Reload the window (F5) after editing apps-script/inroconta/*.html or *.gs;
// close it to stop. For the real data, `pnpm app:push` and the /dev link.
import { chromium } from '@playwright/test';
import { baseData } from '../../tests/fixtures/base-data.mts';
import { defaultResponses, openView } from '../../tests/e2e/view-page.mts';

const colors = process.argv.includes('colores');
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: null });
page.on('pageerror', (e) => console.error('[page error]', e.message));

// F5 serves the files again from disk: the stub is installed on every load.
await openView(page, { ...defaultResponses(), datosDeLaBaseVista: { ok: baseData() } }, colors ? 'Colors' : 'VistaEjecutivaPagina', { fonts: true });
console.log(`INROCONTA ${colors ? 'palette sheet' : 'view'} with test data. F5 after editing the app files; close the window to stop.`);

await new Promise<void>((done) => browser.on('disconnected', () => done()));
