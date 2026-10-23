// Fills the full Consulta RUC ficha of every RUC in the v2 base (contribuyente), from this laptop.
//
//   pnpm ruc:fichas                       every RUC without a ficha (ficha_en null)
//   pnpm ruc:fichas --dry-run             queries but saves nothing (try it first with MAX=10)
//   DIAS=30 pnpm ruc:fichas               also the fichas older than 30 days
//   RUCS=20512201611,20100047218 pnpm ruc:fichas     only those
//
// Pool: BROWSERS Chromium processes × TABS tabs each (default 2 × 3 = 6 queries at a time),
// every tab in its own context (own cookies, so the reCAPTCHA sees separate visits), all taking
// from ONE queue. The limit is SUNAT, not this machine: Chromium already runs in its own
// processes and Node only waits on the network, so worker threads would add nothing. More tabs
// than ~8 tends to make the reCAPTCHA score drop and the pages stop reading.
//
// Same brake as the daily robot: if 3 of the last 10 pages could not be read, every tab stops
// 60 s and the pause between queries doubles (up to 16 s). A page that fails is retried twice,
// at the back of the queue. Results are saved in batches of 25 (comun/padron.mts), so a cut
// loses at most one batch; what could not be saved goes to scripts/out/ruc-fichas/.
// Re-running continues where it stopped: it only picks rows still without a ficha.
// Ctrl+C: the tabs finish the query in hand, the batch is saved, and it exits. Twice: exits now.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { base } from './comun/base.mts';
import { savePadron } from './comun/padron.mts';
import { Barra, duracion, simpleBarText } from './comun/barra.mts';
import { crearBitacora, crudo, dormir, primeraLinea, usarSalida, vigilarProceso } from './comun/bitacora.mts';
import { consultarRuc, launchBrowser, newRucPage, randomPause } from './comun/consulta-ruc-web.mts';
import type { CondicionRuc } from '../../src/shared/lib/sunat/consulta-ruc.ts';

const num = (name: string, fallback: number) => Math.max(0, Number(process.env[name]?.trim() || fallback) || fallback);
const DRY = process.argv.includes('--dry-run');
const BROWSERS = Math.max(1, num('BROWSERS', 2));
const TABS = Math.max(1, num('TABS', 3));
const MAX = num('MAX', Infinity);
const DAYS = num('DIAS', 0);
const BATCH = 25;
const ATTEMPTS = 3;
const ONLY = (process.env.RUCS ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter((r) => /^\d{11}$/.test(r));

const b = crearBitacora('ruc-fichas');
vigilarProceso(b);
const OUT = join(process.cwd(), 'scripts', 'out', 'ruc-fichas');
mkdirSync(OUT, { recursive: true });

const sb = base();

/** RUC still without a ficha (or with one older than DIAS), by cursor on the primary key. */
async function pending(): Promise<string[]> {
    if (ONLY.length) return ONLY;
    const rucs: string[] = [];
    const older = DAYS ? new Date(Date.now() - DAYS * 86400000).toISOString() : null;
    for (let after = ''; ;) {
        // The RUC the Consulta RUC already answered (padron_en), as padron_ruc held them.
        let q = sb.from('contribuyente').select('ruc').eq('tipo_documento', '6').not('padron_en', 'is', null).gt('ruc', after).order('ruc').limit(1000);
        q = older ? q.or(`ficha_en.is.null,ficha_en.lt.${older}`) : q.is('ficha_en', null);
        const { data, error } = await q;
        if (error) {
            b.log('error', 'base', `could not read contribuyente: ${error.code} ${error.message}`, { error });
            process.exit(1);
        }
        rucs.push(...data.map((r) => r.ruc as string).filter((r) => /^\d{11}$/.test(r)));
        if (data.length < 1000) return rucs;
        after = data[data.length - 1].ruc as string;
    }
}

const all = await pending();
const queue = all.slice(0, MAX).map((ruc) => ({ ruc, attempts: 0 }));
const total = queue.length;
const workers = Math.min(BROWSERS * TABS, total);
b.log(
    'info',
    'inicio',
    `${all.length} RUC pendientes; ${total} en esta corrida, ${BROWSERS} navegador(es) × ${TABS} pestaña(s)` + (DRY ? ' · EN SECO: no se guarda nada' : ''),
);
if (!total) process.exit(0);

// ── Saving, in batches ────────────────────────────────────────────

let buffer: CondicionRuc[] = [];
let saved = 0;
const unsaved: CondicionRuc[] = [];

async function flush(): Promise<void> {
    if (!buffer.length) return;
    const rows = buffer;
    buffer = [];
    if (DRY) {
        saved += rows.length;
        return;
    }
    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
            saved += await savePadron(sb, rows);
            return;
        } catch (e) {
            b.log('aviso', 'base', `guardar las fichas falló (intento ${attempt}/4): ${primeraLinea(e)}`);
        }
        await dormir(3000 * attempt);
    }
    unsaved.push(...rows);
}

// ── The pool ──────────────────────────────────────────────────────

let done = 0;
let inFlight = 0;
const failed: string[] = [];
const recent: boolean[] = [];
let pauseMin = 1500;
let brakeUntil = 0;
let stopping = false;
const start = Date.now();

function note(ok: boolean) {
    recent.push(ok);
    if (recent.length > 10) recent.shift();
    const bad = recent.filter((x) => !x).length;
    if (recent.length >= 5 && bad >= 3 && Date.now() > brakeUntil) {
        brakeUntil = Date.now() + 60000;
        pauseMin = Math.min(pauseMin * 2, 16000);
        recent.length = 0;
        b.log(
            'aviso',
            'freno',
            `${bad} de las últimas páginas no se leyeron: todas paran 60 s y la pausa sube a ${pauseMin / 1000}-${(pauseMin * 2) / 1000} s`,
        );
    }
}

async function worker(id: string, browser: Awaited<ReturnType<typeof launchBrowser>>) {
    let page: Page = await newRucPage(browser);
    for (let item = queue.shift(); item && !stopping; item = queue.shift()) {
        while (Date.now() < brakeUntil && !stopping) await dormir(1000);
        item.attempts++;
        inFlight++;
        let ok = false;
        try {
            const r = await consultarRuc(page, item.ruc);
            ok = r.encontrado && !!r.ficha;
            if (ok) {
                buffer.push(r);
                b.jsonl('resultados.jsonl', { ruc: r.ruc, estado: r.estado, condicion: r.condicion, ficha: r.ficha });
                if (buffer.length >= BATCH) await flush();
            } else b.log('aviso', id, `${item.ruc}: no se pudo leer la página (intento ${item.attempts}/${ATTEMPTS})`);
        } catch (e) {
            b.log('aviso', id, `${item.ruc}: ${primeraLinea(e)} (intento ${item.attempts}/${ATTEMPTS})`, { error: crudo(e) });
            // A broken context can poison the next queries: start a clean one.
            await page
                .context()
                .close()
                .catch(() => {});
            page = await newRucPage(browser);
        }
        inFlight--;
        note(ok);
        if (ok) done++;
        else if (item.attempts < ATTEMPTS) queue.push(item);
        else {
            done++;
            failed.push(item.ruc);
        }
        if (queue.length) await randomPause(pauseMin, pauseMin * 2);
    }
    await page
        .context()
        .close()
        .catch(() => {});
}

const barra = new Barra((width) => simpleBarText({ done, total, failed: failed.length, inFlight, start, note: DRY ? 'en seco' : `guardados ${saved}` }, width));
usarSalida((line) => barra.escribir(line));
barra.iniciar();

let interrupts = 0;
process.on('SIGINT', () => {
    if (++interrupts > 1) process.exit(130);
    stopping = true;
    b.log('aviso', 'proceso', 'Ctrl+C: se terminan las consultas en curso y se guarda el lote. Otro Ctrl+C sale ya.');
});

const browsers = await Promise.all(Array.from({ length: BROWSERS }, () => launchBrowser()));
// Staggered start: not every tab in the same second.
await Promise.all(
    Array.from({ length: workers }, async (_, i) => {
        await dormir(i * 1200);
        await worker(`n${(i % BROWSERS) + 1}p${Math.floor(i / BROWSERS) + 1}`, browsers[i % BROWSERS]);
    }),
);
await flush();
await Promise.all(browsers.map((x) => x.close().catch(() => {})));
barra.terminar();
usarSalida((line) => console.log(line));

if (unsaved.length) {
    const file = join(OUT, `no-guardados-${b.corrida}.json`);
    writeFileSync(file, JSON.stringify(unsaved, null, 1));
    b.log('error', 'cierre', `${unsaved.length} fichas leídas que NO se guardaron: ${file}`);
}
if (failed.length) b.log('aviso', 'cierre', `${failed.length} RUC sin leer tras ${ATTEMPTS} intentos: ${failed.join(', ')}`);
const left = all.length - (DRY ? 0 : saved);
b.log(
    'info',
    'cierre',
    `${done - failed.length} de ${total} fichas leídas, ${saved} guardadas${DRY ? ' (en seco)' : ''}, en ${duracion(Date.now() - start)}. ` +
        `Quedan ~${Math.max(0, left)} sin ficha: volver a correr continúa desde ahí. Logs en ${b.dir}`,
);
