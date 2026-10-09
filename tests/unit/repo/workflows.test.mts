// Guards on the GitHub Actions workflows: they only break when the cron runs,
// usually at night, so they are read here instead of waiting for that.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const WORKFLOWS = join(ROOT, '.github', 'workflows');
const files = readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml'));
const packageScripts = Object.keys(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts);

/** The workflow without its comments (they may mention anything). */
const code = (file: string) =>
    readFileSync(join(WORKFLOWS, file), 'utf8')
        .split(/\r?\n/)
        .filter((line) => !line.trimStart().startsWith('#'))
        .join('\n');

describe.each(files)('%s', (file) => {
    const text = code(file);

    it('sets pnpm up before Node and installs from the lockfile', () => {
        const pnpmSetup = text.indexOf('uses: pnpm/action-setup@');
        const nodeSetup = text.indexOf('uses: actions/setup-node@');
        expect(pnpmSetup).toBeGreaterThan(-1);
        expect(pnpmSetup).toBeLessThan(nodeSetup);
        expect(text).toContain('cache: pnpm');
        expect(text).toMatch(/^\s+- run: pnpm install --frozen-lockfile$/m);
    });

    it('calls no package manager but pnpm (catches npm, npx and typos like ppnpm)', () => {
        expect(text.match(/\b\w*np[mx]\b/g)?.filter((w) => w !== 'pnpm') ?? []).toEqual([]);
    });

    it('only runs scripts that exist', () => {
        const scripts = [...text.matchAll(/\b(scripts\/[\w/.-]+\.mts)\b/g)].map((m) => m[1]);
        expect(scripts.filter((s) => !existsSync(join(ROOT, s)))).toEqual([]);
        const pnpmRuns = [...text.matchAll(/\bpnpm (?!install\b|exec\b)([\w:-]+)/g)].map((m) => m[1]);
        expect(pnpmRuns.filter((s) => !packageScripts.includes(s))).toEqual([]);
    });
});
