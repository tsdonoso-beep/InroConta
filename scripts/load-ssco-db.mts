// Loads SUNAT's list of «sujetos sin capacidad operativa» (SSCO) into the v2 base (lista_ssco),
// replacing the previous list, and flags contribuyente.ssco in the same transaction.
//
//   pnpm ssco:db data/sujesincapacidadOperativa.xlsx     parse, then replace the list in the base
//   pnpm ssco:db --dry-run                               parse the newest .xlsx in data/ and stop
//
// load_ssco replaces the whole list in one transaction and refuses a file with less than half
// the RUC already loaded (a cut download, not SUNAT emptying the list). Uses the v2 service key.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { base } from './local/comun/base.mts';
import { parseSsco } from '../src/shared/lib/sunat/ssco.ts';
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
    if (!rows.length) throw new Error('The file has no RUC: the list in the base is left as it was.');

    const sb = base();
    const { data, error } = await sb.rpc('load_ssco', { p_rows: rows });
    if (error) {
        console.error('✗ load_ssco failed:', { code: error.code, message: error.message, details: error.details, hint: error.hint });
        process.exit(1);
    }
    const r = data as { loaded: number; removed: number; flagsChanged: number };
    const { count } = await sb.from('lista_ssco').select('ruc', { count: 'exact', head: true });
    console.log(
        `✓ ${r.loaded} RUC loaded, ${r.removed} removed, ${r.flagsChanged} contribuyente flags changed; lista_ssco now has ${count} (list as of ${latest}).`,
    );
}

main().catch((e) => {
    console.error('✗', e instanceof Error ? e.message : e);
    process.exit(1);
});
