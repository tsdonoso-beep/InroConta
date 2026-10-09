// Loads SUNAT's list of «sujetos sin capacidad operativa» (SSCO) into the «SSCO»
// tab of the INROCONTA book, replacing the previous list. The view
// (apps-script/inroconta/VistaEjecutiva.gs → sscoVista_) reads it from there.
//
//   pnpm ssco:load data/sujesincapacidadOperativa.xlsx     parse, then replace the tab
//   pnpm ssco:load --dry-run                               parse the newest .xlsx in data/ and stop
//
// A tab and not a table: the Supabase project cannot take migrations right now
// (09/10/2026). The table version is ready for when it can (migration 068).
// Writes with the service account (.env.local), which is an editor of the book.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cargarClaveDeArchivo } from './local/comun/config.mts';
import { connectSheets } from './deploy/deployments-sheet.mts';
import { LIBRO_ID } from '../src/shared/lib/drive/servidor.ts';
import { parseSsco, sscoTabRows, SSCO_TAB } from '../src/shared/lib/sunat/ssco.ts';
import { readFirstSheet } from '../src/shared/lib/xlsx/read-sheet.ts';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'scripts', 'out', 'salida', 'ssco');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

/** The file given, or the most recent .xlsx in data/. */
function inputFile(): string {
    const given = args.find((a) => !a.startsWith('--'));
    if (given) return resolve(given);
    const dir = join(ROOT, 'data');
    const newest = readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith('.xlsx'))
        .map((f) => join(dir, f))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
    if (!newest) throw new Error('No .xlsx in data/: pass the path of the SSCO file.');
    return newest;
}

async function main(): Promise<void> {
    const file = inputFile();
    const { rows, skipped } = parseSsco(readFirstSheet(readFileSync(file)));
    const latest = rows.reduce((max, r) => (r.publishedOn > max ? r.publishedOn : max), '');
    console.log(`${file}\n${rows.length} RUC in the list (latest publication ${latest || 'unknown'}), ${skipped.length} rows skipped`);
    skipped.forEach((s) => console.log(`  ⚠ ${s}`));

    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, 'ssco.json'), JSON.stringify(rows, null, 1));
    if (dryRun) {
        console.log(`--dry-run: nothing was loaded. Read rows in ${join(OUT, 'ssco.json')}`);
        return;
    }
    if (!rows.length) throw new Error('The file has no RUC: the tab is left as it was.');

    cargarClaveDeArchivo();
    const sheets = connectSheets();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: LIBRO_ID, fields: 'sheets(properties(title))' });
    if (!meta.data.sheets?.some((s) => s.properties?.title === SSCO_TAB)) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: LIBRO_ID,
            requestBody: { requests: [{ addSheet: { properties: { title: SSCO_TAB, gridProperties: { frozenRowCount: 1 } } } }] },
        });
    }
    await sheets.spreadsheets.values.clear({ spreadsheetId: LIBRO_ID, range: `'${SSCO_TAB}'` });
    // RAW: RUCs and dates stay as text (Sheets would turn «2026-09-30» into a date and a RUC into a number).
    await sheets.spreadsheets.values.update({
        spreadsheetId: LIBRO_ID,
        range: `'${SSCO_TAB}'!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: sscoTabRows(rows) },
    });
    console.log(`✓ ${rows.length} RUC written to the ${SSCO_TAB} tab of INROCONTA (list as of ${latest}).`);
}

main().catch((e) => {
    console.error('✗', e instanceof Error ? e.message : e);
    process.exit(1);
});
