// runTool (scripts/deploy/shared.mts): how clasp and the test runners are started.
import { describe, expect, it } from 'vitest';
import { runTool } from '../../../scripts/deploy/shared.mts';

const PRINT = 'tests/fixtures/print-args.mjs';
const argsSeenBy = (...args: string[]) => JSON.parse(runTool(PRINT, args, { capture: true }));

describe('runTool', () => {
    it('passes an argument with spaces as one argument (on Windows a shell split it)', () => {
        expect(argsSeenBy('create-version', '2.0.1 · bc920ef · Momo de twice')).toEqual(['create-version', '2.0.1 · bc920ef · Momo de twice']);
    });

    it('passes quotes and shell symbols through untouched', () => {
        expect(argsSeenBy('-d', 'a "quoted" & piped | text > file')).toEqual(['-d', 'a "quoted" & piped | text > file']);
    });

    it('fails on a non-zero exit', () => {
        expect(() => runTool(PRINT, ['--exit-1'], { capture: true })).toThrow(/exit 1/);
    });

    it('fails on an "error:" line even when the exit code is 0, as clasp does', () => {
        expect(() => runTool(PRINT, ['--error-line'], { capture: true })).toThrow(/too many arguments/);
    });
});
