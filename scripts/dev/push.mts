// pnpm apps-script:push — uploads apps-script/inroconta (CarpetaMadre.gs and PadronRuc.gs, the
// scripts that keep the book's tabs up to date) to its Apps Script project. There is nothing to
// deploy: since 13/10/2026 the view is the web app (src/app), and these scripts run on their
// triggers. Needs `pnpm exec clasp login` once per machine.
import { APP_DIR, runTool } from '../deploy/shared.mts';

try {
    console.log(runTool('node_modules/@google/clasp/build/src/index.js', ['push', '--force'], { cwd: APP_DIR, capture: true }).trim());
    console.log('\n✓ Pushed. The triggers run the new code from their next run.');
} catch (e) {
    console.error('✗', e instanceof Error ? e.message : e);
    process.exit(1);
}
