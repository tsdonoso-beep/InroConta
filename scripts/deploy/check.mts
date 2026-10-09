// pnpm deploy:check — the tests a commit must pass before `pnpm deploy:app`
// will deploy it. On success it marks that exact commit as tested
// (scripts/out/deploy/tested.json); a new commit needs a new check.
import { headCommit, markTested, requireCleanTree, runTool } from './shared.mts';

function main(): void {
    requireCleanTree('checking a deployment');
    const commit = headCommit();

    console.log('▶ Unit tests');
    runTool('node_modules/vitest/vitest.mjs', ['run']);
    console.log('\n▶ End-to-end tests');
    runTool('node_modules/@playwright/test/cli.js', ['test']);

    markTested(commit);
    console.log(`\n✓ ${commit.slice(0, 7)} passed every test: it can be deployed with  pnpm deploy:app "what changed"`);
}

try {
    main();
} catch (e) {
    console.error('\n✗', e instanceof Error ? e.message : e);
    process.exit(1);
}
