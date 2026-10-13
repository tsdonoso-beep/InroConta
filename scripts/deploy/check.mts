// pnpm deploy:check — every test of the app (unit and end-to-end), in one command.
// Optional since 13/10/2026: deploy:app no longer requires it, nor a committed tree.
import { runTool } from './shared.mts';

function main(): void {
    console.log('▶ Unit tests');
    runTool('node_modules/vitest/vitest.mjs', ['run']);
    console.log('\n▶ End-to-end tests');
    runTool('node_modules/@playwright/test/cli.js', ['test']);
    console.log('\n✓ Every test passed.');
}

try {
    main();
} catch (e) {
    console.error('\n✗', e instanceof Error ? e.message : e);
    process.exit(1);
}
