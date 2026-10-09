// Deploys the INROCONTA Apps Script app (apps-script/inroconta) with clasp.
//
//   pnpm deploy:app "what changed"        tests → push → new version → same deployment → DESPLIEGUES tab
//   pnpm deploy:app --dry-run             only the checks and the tests; nothing is pushed
//
// The link never changes: every run updates the SAME deployment (clasp redeploy
// <id>) to a new version, instead of creating a new deployment (which is what
// gives a new /exec link). Each run also leaves the link and the list of
// commits it carried in the DESPLIEGUES tab of the INROCONTA book.
//
// It refuses to deploy a dirty tree: what goes live must be a commit. Needs
// `pnpm exec clasp login` once per machine, and the service account in .env.local.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cargarClaveDeArchivo } from '../local/comun/config.mts';
import { LIBRO_ID } from '../../src/shared/lib/drive/servidor.ts';
import { connectSheets, lastDeployedCommit, recordDeployment, type Deployment } from './deployments-sheet.mts';

const ROOT = join(import.meta.dirname, '..', '..');
const PROJECT_DIR = join(ROOT, 'apps-script', 'inroconta');
// The web app deployment that is shared with Accounting (docs/ESTADO-Y-PENDIENTES.md).
const DEPLOYMENT_ID = 'AKfycbzwyVcFPhZqhp5bXjo2TWA9JjibhzGJeKE1mC33m0zQKM637f0many_4VsLghUXyLb-';
const WEB_APP_URL = `https://script.google.com/a/macros/inroprin.com/s/${DEPLOYMENT_ID}/exec`;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const descriptionArg = args
    .filter((a) => !a.startsWith('--'))
    .join(' ')
    .trim();

function git(...a: string[]): string {
    return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
}

/** Runs a command with its output on screen; stops the deployment if it fails. */
function step(title: string, command: string, commandArgs: string[], cwd = ROOT): void {
    console.log(`\n▶ ${title}`);
    const r = spawnSync(command, commandArgs, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) throw new Error(`${title} failed (exit ${r.status}). Nothing was deployed after this step.`);
}

/** Runs clasp on the app folder and returns what it printed. */
function clasp(...a: string[]): string {
    const r = spawnSync('pnpm', ['exec', 'clasp', ...a], { cwd: PROJECT_DIR, encoding: 'utf8', shell: process.platform === 'win32' });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    if (r.status !== 0) throw new Error(`clasp ${a[0]} failed (exit ${r.status}):\n${out}`);
    return out;
}

function checkPreconditions(): void {
    if (!existsSync(join(PROJECT_DIR, '.clasp.json'))) {
        throw new Error(`${PROJECT_DIR}\\.clasp.json is missing: the scriptId of the INROCONTA project goes there.`);
    }
    const dirty = git('status', '--porcelain');
    if (dirty && !dryRun) {
        throw new Error(`The working tree has uncommitted changes; commit them first so the deployment is a commit:\n${dirty}`);
    }
    if (dirty) console.log('⚠ Uncommitted changes (allowed in --dry-run):\n' + dirty);
}

async function main(): Promise<void> {
    cargarClaveDeArchivo();
    checkPreconditions();

    step('Unit tests', 'pnpm', ['test']);
    step('End-to-end tests', 'pnpm', ['test:e2e']);

    const head = git('rev-parse', '--short', 'HEAD');
    const sheets = connectSheets();
    const previous = await lastDeployedCommit(sheets, LIBRO_ID);
    const range = previous ? `${previous}..HEAD` : 'HEAD~10..HEAD';
    const changes = git('log', '--format=%h %s', range, '--', 'apps-script/inroconta').split('\n').filter(Boolean);
    const description = descriptionArg || git('log', '-1', '--format=%s');

    console.log(`\nCommit ${head} · ${changes.length} change(s) to the app since ${previous ?? 'the start'}:`);
    changes.forEach((c) => console.log(`  ${c}`));
    if (dryRun) {
        console.log('\n--dry-run: tests passed; nothing was pushed or deployed.');
        return;
    }

    console.log('\n▶ clasp push');
    console.log(clasp('push', '--force'));
    const versionOut = clasp('version', `${head} ${description}`.slice(0, 100));
    const version = Number(/version (\d+)/i.exec(versionOut)?.[1]);
    if (!version) throw new Error(`Could not read the new version number from clasp:\n${versionOut}`);
    console.log(`▶ version ${version}`);
    console.log(clasp('redeploy', DEPLOYMENT_ID, '-V', String(version), '-d', description.slice(0, 100)));

    const deployment: Deployment = {
        when: new Date(),
        version,
        commit: head,
        changes,
        description,
        deployedBy: git('config', 'user.name'),
        url: WEB_APP_URL,
    };
    await recordDeployment(sheets, LIBRO_ID, deployment);
    console.log(`\n✓ Version ${version} is live at ${WEB_APP_URL}\n  (recorded in the DESPLIEGUES tab of INROCONTA)`);
}

main().catch((e) => {
    console.error('\n✗', e instanceof Error ? e.message : e);
    process.exit(1);
});
