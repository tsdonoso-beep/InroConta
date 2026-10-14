// pnpm perf — how long each screen of the web app takes and how much it sends, against a
// running `pnpm start` (never `next dev`: there every route compiles the first time it is
// touched and no number means anything). Same rule as GRAMA's scripts/perf/screens.mjs:
// 6 runs, the first one discarded (it pays the cold caches), the median of the rest.
//
//   pnpm build && DEV_USER_EMAIL=… pnpm start      in another terminal (DEV_USER_EMAIL skips Google)
//   pnpm perf                                       the document load of each screen
//   pnpm perf --rsc                                 the client-side navigation (what a click sends)
//
// It measures time to the last byte and the bytes (uncompressed and gzip), which is what a
// person waits for on a click. The server-side reads are in PERF_LOG=1 (src/app/_lib/perf.ts).
import { gzipSync } from 'node:zlib';

const BASE = process.env.PERF_URL ?? 'http://localhost:3000';
const SCREENS = (process.env.PERF_SCREENS ?? '/,/impuestos,/legajo,/sin-oc,/cambios,/api/comprobantes,/api/legajo,/login').split(',');
const RUNS = 6;
const rsc = process.argv.includes('--rsc');

async function once(path: string): Promise<{ ms: number; bytes: number; gzip: number; status: number }> {
    const t0 = performance.now();
    // A client navigation asks with the RSC header and a ?_rsc= key that hashes the headers; a wrong
    // key gets a 307 to the right one, which is followed (the redirect counts in the time, as the
    // router would not pay it: the number is a ceiling).
    const headers: Record<string, string> = rsc ? { RSC: '1' } : {};
    let r = await fetch(BASE + path + (rsc ? '?_rsc=perf' : ''), { headers, redirect: 'manual' });
    const next = r.headers.get('location');
    if (rsc && r.status === 307 && next?.includes('_rsc')) r = await fetch(new URL(next, BASE), { headers, redirect: 'manual' });
    const body = Buffer.from(await r.arrayBuffer());
    return { ms: performance.now() - t0, bytes: body.length, gzip: gzipSync(body).length, status: r.status };
}

const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
console.log(`${rsc ? 'navigation (RSC)' : 'document'} · ${BASE} · median of ${RUNS - 1} (first discarded)\n`);
for (const path of SCREENS) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(await once(path));
    const first = runs[0];
    const rest = runs.slice(1).sort((a, b) => a.ms - b.ms);
    const median = rest[Math.floor(rest.length / 2)];
    console.log(
        `${path.padEnd(18)} ${String(Math.round(median.ms)).padStart(6)} ms  (first ${Math.round(first.ms)} ms) · ${kb(median.bytes).padStart(8)} · gzip ${kb(median.gzip).padStart(7)} · ${median.status}`,
    );
}
