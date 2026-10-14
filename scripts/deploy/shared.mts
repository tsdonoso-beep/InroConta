// What apps-script:push (scripts/dev/push.mts) needs: the repo, git and running a Node tool
// without a shell.
//
// Nothing here goes through a shell: on Windows a shell splits every argument
// with spaces ("v2.0.1 Momo de twice" arrived to clasp as four arguments), so
// each tool is started as `node <its entry file> args…`.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = join(import.meta.dirname, '..', '..');
export const APP_DIR = join(ROOT, 'apps-script', 'inroconta');

export function git(...args: string[]): string {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

/** The full hash of HEAD. */
export const headCommit = () => git('rev-parse', 'HEAD');

/**
 * Uncommitted changes inside the app (edits and new files): clasp pushes the files on disk,
 * so a deployment with these carries code that no commit has. Since 13/10/2026 that is allowed
 * (the owner's call); it is only reported, and marked with «+» after the commit.
 */
export function uncommittedAppChanges(): string[] {
    return git('status', '--porcelain', '--', 'apps-script')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
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
