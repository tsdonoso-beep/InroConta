import { defineConfig, devices } from '@playwright/test';

// End-to-end tests of the Apps Script pages, served locally with a stubbed
// google.script.run (tests/e2e/view-page.ts): no Google session, no internet.
export default defineConfig({
    testDir: 'tests/e2e',
    outputDir: 'scripts/out/e2e',
    fullyParallel: true,
    reporter: [['list'], ['html', { outputFolder: 'scripts/out/e2e-report', open: 'never' }]],
    use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
});
