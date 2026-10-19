// pnpm test:datos — the tests against the REAL data (the INROCONTA book and the v2 base), apart
// from `pnpm test`: they need .env.local, read for minutes, and their answer depends on the day.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

export default defineConfig({
    resolve: { alias: { 'server-only': fileURLToPath(new URL('./tests/helpers/server-only.mts', import.meta.url)) } },
    test: {
        include: ['tests/data/**/*.test.mts'],
        environment: 'node',
        testTimeout: 60_000,
        hookTimeout: 400_000,
    },
});
