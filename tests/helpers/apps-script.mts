// Runs Apps Script files (.gs) inside Node so their functions can be tested.
//
// A .gs file is not a module: Apps Script concatenates every file of a project
// into one global scope. Here each file is evaluated in the same vm context, and
// the Google services the code touches (SpreadsheetApp, Utilities, Session,
// CacheService…) are small in-memory fakes. Only what the tested code calls is
// faked: a missing service fails loudly with "X is not defined".
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';

const ROOT = join(import.meta.dirname, '..', '..');
const TIME_ZONE = 'America/Lima';

export type Cell = string | number | boolean | Date | null;
export type SheetData = Record<string, Cell[][]>;

/** A spreadsheet with named tabs; each tab is a grid whose first row is the header. */
export function fakeSpreadsheetApp(tabs: SheetData) {
    const sheet = (name: string) => {
        const grid = tabs[name];
        if (!grid) return null;
        return {
            getName: () => name,
            getLastRow: () => grid.length,
            getLastColumn: () => grid[0]?.length ?? 0,
            getDataRange: () => ({ getValues: () => grid.map((row) => [...row]) }),
            getRange: (row: number, col: number, rows: number, cols: number) => ({
                getValues: () => grid.slice(row - 1, row - 1 + rows).map((r) => r.slice(col - 1, col - 1 + cols)),
            }),
        };
    };
    const book = {
        getSheetByName: sheet,
        getSheets: () => Object.keys(tabs).map(sheet),
    };
    return { openById: () => book };
}

/** Utilities.formatDate for the few patterns the code uses (yyyy, MM, M, dd, d, HH, mm). */
function formatDate(date: Date, timeZone: string, pattern: string): string {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-GB', {
            timeZone,
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        })
            .formatToParts(date)
            .map((p) => [p.type, p.value]),
    );
    const pad = (s: string) => s.padStart(2, '0');
    return pattern.replace(/yyyy|MM|M|dd|d|HH|mm/g, (token) => {
        switch (token) {
            case 'yyyy':
                return parts.year;
            case 'MM':
                return pad(parts.month);
            case 'M':
                return String(Number(parts.month));
            case 'dd':
                return pad(parts.day);
            case 'd':
                return String(Number(parts.day));
            case 'HH':
                return pad(parts.hour);
            default:
                return pad(parts.minute);
        }
    });
}

/** A script cache that starts empty and lives as long as the context. */
function fakeCacheService() {
    const store = new Map<string, string>();
    const cache = {
        get: (k: string) => store.get(k) ?? null,
        getAll: (keys: string[]) => Object.fromEntries(keys.filter((k) => store.has(k)).map((k) => [k, store.get(k)])),
        put: (k: string, v: string) => void store.set(k, v),
        putAll: (values: Record<string, string>) => Object.entries(values).forEach(([k, v]) => store.set(k, v)),
    };
    return { getScriptCache: () => cache };
}

export interface LoadOptions {
    /** Tabs of the spreadsheet that SpreadsheetApp.openById returns. */
    sheets?: SheetData;
    /** Extra globals, or overrides of the default fakes. */
    globals?: Record<string, unknown>;
}

/**
 * Evaluates the given .gs files (paths relative to the repo root) in one shared
 * scope and returns that scope: every top-level function is a property of it.
 */
/** The shared scope of a project: its top-level functions, by name. */
export type AppsScriptScope = Record<string, (...args: unknown[]) => unknown>;

export function loadAppsScript(files: string[], options: LoadOptions = {}): AppsScriptScope {
    const context = createContext({
        console,
        // The host Date, so `x instanceof Date` holds for the dates of the fake sheet.
        Date,
        SpreadsheetApp: fakeSpreadsheetApp(options.sheets ?? {}),
        Session: { getScriptTimeZone: () => TIME_ZONE },
        Utilities: { formatDate },
        CacheService: fakeCacheService(),
        ...options.globals,
    });
    for (const file of files) {
        runInContext(readFileSync(join(ROOT, file), 'utf8'), context, { filename: file });
    }
    return context as AppsScriptScope;
}

/**
 * Calls a server function the way the page receives it through google.script.run:
 * the result travels as JSON, so it comes back as plain host objects.
 */
export function callFromPage<T>(scope: AppsScriptScope, name: string, ...args: unknown[]): T {
    return JSON.parse(JSON.stringify(scope[name](...args))) as T;
}
