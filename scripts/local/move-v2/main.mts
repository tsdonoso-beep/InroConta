// pnpm db:mudanza — copies the old database (vqabgnynidehfqueupki) into the v2 one
// (docs/database/v2/), transformed to the new tables. Can be run as many times as needed: the ids
// are derived from the natural keys, so a second run updates the same rows, and at the end it
// deletes from v2 what the old base no longer has.
//
//   pnpm db:mudanza --seco         reads and transforms, writes nothing (JSON in scripts/out/move-v2/)
//   pnpm db:mudanza                copies
//   pnpm db:mudanza --sin-limpiar  copies without deleting what is left over in v2
//
// Not moved: viáticos (its app keeps writing the old base until it switches; it moves with it)
// and CAPTURA (retired). Run it with no workflow writing to the old base, or a page may shift.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pool } from './pool.mts';
import { Notes, type Row } from './helpers.mts';
import { readOld, oldDb } from './source.mts';
import { changes, costCentres, CostCentres, lookups, runs, ssco, Taxpayers } from './map-core.mts';
import { documents } from './map-documents.mts';
import { detractions, withholdings } from './map-payments.mts';
import { controlBase, orders, Orders, warehouse } from './map-orders.mts';
import { folders, links, rules, withoutOc } from './map-links.mts';
import { newDb, prune, replaceMoved, TABLES, write } from './target.mts';

const dry = process.argv.includes('--seco');
const keep = process.argv.includes('--sin-limpiar');
const OUT = join(process.cwd(), 'scripts', 'out', 'move-v2');
const t0 = Date.now();
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

console.log(`▶ Mudanza a la base v2${dry ? ' (en seco: no escribe nada)' : ''}\n\n1. Leyendo la base vieja…`);
const old = await readOld(await oldDb(), (what, n, ms) => console.log(`  ✓ ${what.padEnd(28)} ${String(n).padStart(7)} filas  ${secs(ms)}`));

console.log('\n2. Transformando…');
const notes = new Notes();
const people = new Taxpayers(new Set(old.ruc_ssco.map((r) => String(r.ruc))));
lookups(old, people);
const cc = new CostCentres();
costCentres(old, cc);
const docs = documents(old, people, notes);
const detraccion_constancia = detractions(old, people, docs.ids, notes);
const { retencion_comprobante, retencion_documento } = withholdings(old, people, docs.ids, notes);
const oc = new Orders();
const { orden_compra_dua } = orders(old, oc, people, cc, notes);
const { carpeta_oc, archivo } = folders(old, oc, cc, notes);
const { orden_compra_centro_costo } = controlBase(old, oc, people, cc, notes);
const vale_almacen = warehouse(old, oc, notes);
const comprobante_oc = links(old, docs.ids, oc, carpeta_oc, new Set(archivo.map((a) => a.drive_id)), notes);
withoutOc(old, docs.comprobante, notes);
const { regla_centro_costo, proveedor_sin_oc } = rules(old, cc, people, notes);
const orden_compra = [...oc.rows.values()];
for (const o of orden_compra) people.see(o.proveedor_ruc);

const data: Record<string, Row[]> = {
    lista_ssco: ssco(old),
    centro_costo: cc.all(notes),
    comprobante: docs.comprobante,
    registro_compras: docs.registro_compras,
    comprobante_item: docs.comprobante_item,
    comprobante_cuota: docs.comprobante_cuota,
    detraccion_constancia,
    retencion_comprobante,
    retencion_documento,
    orden_compra,
    orden_compra_centro_costo,
    orden_compra_dua,
    vale_almacen,
    carpeta_oc,
    archivo,
    comprobante_oc,
    regla_centro_costo,
    proveedor_sin_oc,
    contribuyente: people.all(), // last: every mapper above may have named a new RUC
};
const corrida = runs(old);
const cambio = changes(old, docs.sireKey, notes);

for (const t of TABLES) console.log(`  ${t.table.padEnd(28)} ${String(data[t.table].length).padStart(7)}`);
console.log(`  ${'corrida'.padEnd(28)} ${String(corrida.length).padStart(7)}\n  ${'cambio'.padEnd(28)} ${String(cambio.length).padStart(7)}`);
if (notes.entries().length) {
    console.log('\n  Lo que no calzó (no detiene la mudanza):');
    for (const [what, n] of notes.entries()) console.log(`   · ${what}: ${n}`);
}

mkdirSync(OUT, { recursive: true });
const report: Row = {
    inicio: new Date(t0).toISOString(),
    seco: dry,
    filas: Object.fromEntries(TABLES.map((t) => [t.table, data[t.table].length])),
    notas: Object.fromEntries(notes.entries()),
};

if (dry) {
    mkdirSync(join(OUT, 'seco'), { recursive: true });
    for (const [t, rows] of Object.entries({ ...data, corrida, cambio })) writeFileSync(join(OUT, 'seco', `${t}.json`), JSON.stringify(rows, null, 1));
    writeFileSync(join(OUT, 'informe-seco.json'), JSON.stringify(report, null, 2));
    console.log(`\n✓ En seco, ${secs(Date.now() - t0)}. Las filas que se escribirían están en scripts/out/move-v2/seco/.`);
    process.exit(0);
}

console.log('\n3. Escribiendo en la base v2 (cada tabla en cuanto están las que la necesitan)…');
const db = newDb();
const writers = pool(8);
const rejected: Record<string, { row: Row; error: string }[]> = {};
const done = new Map<string, Promise<void>>();
const start = (table: string): Promise<void> => {
    if (!done.has(table)) {
        const t = TABLES.find((x) => x.table === table)!;
        done.set(
            table,
            Promise.all(t.after.map(start)).then(async () => {
                const t1 = Date.now();
                const bad = await write(db, writers, t.table, t.key, data[t.table], t.principal);
                if (bad.length) rejected[t.table] = bad;
                console.log(
                    `  ✓ ${t.table.padEnd(28)} ${String(data[t.table].length - bad.length).padStart(7)} filas  ${secs(Date.now() - t1)}${bad.length ? `  ✗ ${bad.length} rechazadas` : ''}`,
                );
            }),
        );
    }
    return done.get(table)!;
};
await Promise.all([
    ...TABLES.map((t) => start(t.table)),
    replaceMoved(db, writers, 'corrida', 'resumen', corrida).then((n) => console.log(`  ✓ ${'corrida'.padEnd(28)} ${String(n).padStart(7)} filas`)),
    replaceMoved(db, writers, 'cambio', 'detalle', cambio).then((n) => console.log(`  ✓ ${'cambio'.padEnd(28)} ${String(n).padStart(7)} filas`)),
]);

if (!keep) {
    console.log('\n4. Quitando de la v2 lo que la base vieja ya no tiene…');
    for (const t of [...TABLES].reverse()) {
        const r = await prune(db, writers, t.table, t.key, data[t.table]);
        if (r) console.log(`  ${typeof r === 'number' ? '✓' : '⚠'} ${t.table.padEnd(28)} ${typeof r === 'number' ? `${r} quitadas` : r}`);
    }
}

report.rechazadas = Object.fromEntries(Object.entries(rejected).map(([t, r]) => [t, r.length]));
writeFileSync(join(OUT, 'informe.json'), JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'rechazadas.json'), JSON.stringify(rejected, null, 1));
const nBad = Object.values(rejected).reduce((s, r) => s + r.length, 0);
console.log(
    `\n${nBad ? '⚠' : '✓'} Mudanza terminada en ${secs(Date.now() - t0)}.${nBad ? ` ${nBad} filas rechazadas: scripts/out/move-v2/rechazadas.json` : ''}`,
);
process.exit(nBad ? 1 : 0);
