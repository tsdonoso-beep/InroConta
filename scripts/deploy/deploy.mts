// Deploys the INROCONTA Apps Script app (apps-script/inroconta) with clasp.
//
//   pnpm deploy:check                     first: the tests, which mark the commit as tested
//   pnpm deploy:app "what changed"        push → new version → same deployment → DESPLIEGUES tab
//   pnpm deploy:app --dry-run             what would be deployed; nothing is pushed
//
// The link never changes: every run updates the SAME deployment (clasp redeploy
// <id>) to a new version, instead of creating a new deployment (which is what
// gives a new /exec link). Each run leaves the link, the app version
// (package.json) and the commits it carried in the DESPLIEGUES tab.
//
// It only deploys a clean tree whose HEAD passed `pnpm deploy:check`. Needs
// `pnpm exec clasp login` once per machine, and the service account in .env.local.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cargarClaveDeArchivo } from '../local/comun/config.mts';
import { LIBRO_ID } from '../../src/shared/lib/drive/servidor.ts';
import { connectSheets, lastDeployment, recordDeployment, type Deployment } from './deployments-sheet.mts';
import { APP_DIR, appVersion, git, headCommit, requireCleanTree, runTool, testedCommit } from './shared.mts';

// The web app deployment that is shared with Accounting (docs/ESTADO-Y-PENDIENTES.md).
const DEPLOYMENT_ID = 'AKfycbzwyVcFPhZqhp5bXjo2TWA9JjibhzGJeKE1mC33m0zQKM637f0many_4VsLghUXyLb-';
const WEB_APP_URL = `https://script.google.com/a/macros/inroprin.com/s/${DEPLOYMENT_ID}/exec`;
const CLASP = 'node_modules/@google/clasp/build/src/index.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const descriptionArg = args
    .filter((a) => !a.startsWith('--'))
    .join(' ')
    .trim();

const clasp = (...a: string[]) => runTool(CLASP, a, { cwd: APP_DIR, capture: true });

function checkPreconditions(commit: string): void {
    if (!existsSync(join(APP_DIR, '.clasp.json'))) {
        throw new Error(`${APP_DIR}\\.clasp.json is missing: the scriptId of the INROCONTA project goes there.`);
    }
    requireCleanTree('deploying');
    if (testedCommit() !== commit) {
        throw new Error(`${commit.slice(0, 7)} has not passed the tests yet. Run  pnpm deploy:check  first.`);
    }
}

async function main(): Promise<void> {
    cargarClaveDeArchivo();
    const commit = headCommit();
    checkPreconditions(commit);

    const head = commit.slice(0, 7);
    const version = appVersion();
    const sheets = connectSheets();
    const previous = await lastDeployment(sheets, LIBRO_ID);
    const range = previous ? `${previous.commit}..HEAD` : 'HEAD~10..HEAD';
    const changes = git('log', '--format=%h %s', range, '--', 'apps-script/inroconta').split('\n').filter(Boolean);
    const description = descriptionArg || git('log', '-1', '--format=%s');

    console.log(`Version ${version} · commit ${head} · ${changes.length} change(s) to the app since ${previous?.commit ?? 'the start'}:`);
    changes.forEach((c) => console.log(`  ${c}`));
    if (previous && previous.appVersion === version && changes.length) {
        console.log(`⚠ The version is still ${version}, as in the last deployment: bump it in package.json if this is a new release.`);
    }
    if (dryRun) {
        console.log('\n--dry-run: nothing was pushed or deployed.');
        return;
    }

    console.log('\n▶ clasp push');
    console.log(clasp('push', '--force').trim());
    const versionOut = clasp('create-version', `${version} · ${head} · ${description}`.slice(0, 100));
    const scriptVersion = Number(/version (\d+)/i.exec(versionOut)?.[1]);
    if (!scriptVersion) throw new Error(`Could not read the new version number from clasp:\n${versionOut}`);
    console.log(`▶ Apps Script version ${scriptVersion}`);
    console.log(clasp('update-deployment', DEPLOYMENT_ID, '-V', String(scriptVersion), '-d', `${version} · ${description}`.slice(0, 100)).trim());

    const deployment: Deployment = {
        when: new Date(),
        appVersion: version,
        scriptVersion,
        commit: head,
        changes,
        description,
        deployedBy: git('config', 'user.name'),
        url: WEB_APP_URL,
    };
    await recordDeployment(sheets, LIBRO_ID, deployment);
    console.log(`\n✓ ${version} (Apps Script version ${scriptVersion}) is live at ${WEB_APP_URL}\n  Recorded in the DESPLIEGUES tab of INROCONTA.`);
}

main().catch((e) => {
    console.error('\n✗', e instanceof Error ? e.message : e);
    process.exit(1);
});
