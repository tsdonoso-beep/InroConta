// What deploy:check and deploy:app share: the repo, git, running a Node tool
// without a shell, and the mark that says which commit passed the tests.
//
// Nothing here goes through a shell: on Windows a shell splits every argument
// with spaces ("v2.0.1 Momo de twice" arrived to clasp as four arguments), so
// each tool is started as `node <its entry file> args…`.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = join(import.meta.dirname, '..', '..');
export const APP_DIR = join(ROOT, 'apps-script', 'inroconta');
const TESTED_MARK = join(ROOT, 'scripts', 'out', 'deploy', 'tested.json');

export function git(...args: string[]): string {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

/** The full hash of HEAD. */
export const headCommit = () => git('rev-parse', 'HEAD');

/**
 * Throws if there is anything uncommitted that could change what is tested or deployed:
 * edits to tracked files, and new files inside the app (clasp would push them). Untracked
 * files elsewhere (data/, notes) never reach Apps Script, so they do not block.
 */
export function requireCleanTree(what: string): void {
    const dirty = [git('status', '--porcelain', '--untracked-files=no'), git('status', '--porcelain', '--', 'apps-script')].filter(Boolean);
    if (dirty.length) throw new Error(`Commit everything before ${what}; uncommitted:\n${[...new Set(dirty.join('\n').split('\n'))].join('\n')}`);
}

/** The version people see, from package.json (the owner sets it when releasing). */
export function appVersion(): string {
    return String(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version ?? '');
}

/**
 * Runs a Node tool by its entry file (e.g. node_modules/vitest/vitest.mjs).
 * With `capture`, returns its output; otherwise the output goes to the screen.
 * Fails on a non-zero exit, and also on an "error:" line, because clasp exits
 * with 0 when it rejects its arguments.
 */
export function runTool(entry: string, args: string[], options: { cwd?: string; capture?: boolean } = {}): string {
    const r = spawnSync(process.execPath, [join(ROOT, entry), ...args], {
        cwd: options.cwd ?? ROOT,
        encoding: 'utf8',
        stdio: options.capture ? 'pipe' : 'inherit',
    });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    if (r.status !== 0 || /^error:/im.test(out)) {
        throw new Error(`${entry} ${args[0] ?? ''} failed (exit ${r.status})${out ? `:\n${out}` : ''}`);
    }
    return out;
}

/** Records that this commit passed every test. */
export function markTested(commit: string): void {
    mkdirSync(join(TESTED_MARK, '..'), { recursive: true });
    writeFileSync(TESTED_MARK, JSON.stringify({ commit, at: new Date().toISOString() }, null, 2));
}

/** The commit that last passed `pnpm deploy:check`, or null. */
export function testedCommit(): string | null {
    if (!existsSync(TESTED_MARK)) return null;
    return (JSON.parse(readFileSync(TESTED_MARK, 'utf8')) as { commit?: string }).commit ?? null;
}
