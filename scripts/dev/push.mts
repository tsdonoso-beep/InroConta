// pnpm app:push — uploads apps-script/inroconta to the Apps Script project
// WITHOUT deploying: Accounting keeps the published version. The pushed code is
// at the test link (/dev) with the real data, which only the project's editors
// can open. Nothing has to be committed; tests are not required.
import { APP_DIR, runTool } from '../deploy/shared.mts';

// The «head» deployment of the project (clasp list-deployments): always the last pushed code.
const HEAD_DEPLOYMENT = 'AKfycbzMCD8BTy-u7biT41RV_C4Et7fBNQr-k0kxbj9c34E';

try {
    console.log(runTool('node_modules/@google/clasp/build/src/index.js', ['push', '--force'], { cwd: APP_DIR, capture: true }).trim());
    console.log(`\n✓ Pushed, not deployed. Test it with the real data at:\n  https://script.google.com/a/macros/inroprin.com/s/${HEAD_DEPLOYMENT}/dev`);
} catch (e) {
    console.error('✗', e instanceof Error ? e.message : e);
    process.exit(1);
}
