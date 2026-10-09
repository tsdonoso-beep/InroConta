// The «DESPLIEGUES» tab of the INROCONTA book: where everyone finds the current
// link of the web app and what changed in each deployment.
//
//   A1 Enlace vigente          B1 the /exec link (it does not change: every deployment
//                                 updates the same Apps Script deployment)
//   A2 Versión                 B2 the app version (package.json), e.g. «2.1.0»
//   A3 Versión de Apps Script  B3 the number Apps Script gave the deployed code
//   A4 Desplegado el           B4 date and time (Lima)
//   row 6                      the history header; row 7 onwards, newest first
//
// It is written with the service account, which is already an editor of the book.
import { google } from 'googleapis';
import { correoDeServicio, normalizarClavePrivada } from '../../src/shared/lib/drive/servidor.ts';

export const DEPLOYMENTS_TAB = 'DESPLIEGUES';
const HISTORY_HEADER = ['Fecha y hora', 'Versión', 'Versión de Apps Script', 'Commit', 'Cambios incluidos', 'Descripción', 'Desplegó'];
const HEADER_ROW = 6; // 1-based
const HISTORY_FIRST_ROW = HEADER_ROW + 1;
const COMMIT_COLUMN = 3; // 0-based, inside a history row
const LAST_COLUMN = 'G';

export interface Deployment {
    when: Date;
    appVersion: string; // package.json
    scriptVersion: number; // given by Apps Script
    commit: string; // short hash
    changes: string[]; // one "hash subject" per commit since the previous deployment
    description: string;
    deployedBy: string;
    url: string;
}

type Sheets = ReturnType<typeof google.sheets>;

export function connectSheets(): Sheets {
    const email = correoDeServicio(process.env.GOOGLE_SA_EMAIL, process.env.GOOGLE_SA_PRIVATE_KEY);
    const key = normalizarClavePrivada(process.env.GOOGLE_SA_PRIVATE_KEY);
    if (!email || !key) throw new Error('Missing GOOGLE_SA_EMAIL and GOOGLE_SA_PRIVATE_KEY (or GOOGLE_SA_KEY_FILE) in .env.local.');
    const auth = new google.auth.GoogleAuth({
        credentials: { client_email: email, private_key: key },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return google.sheets({ version: 'v4', auth });
}

/** «09/10/2026 14:05», in Lima time whatever the machine's zone. */
export function limaDateTime(d: Date): string {
    const p = Object.fromEntries(
        new Intl.DateTimeFormat('en-GB', {
            timeZone: 'America/Lima',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        })
            .formatToParts(d)
            .map((x) => [x.type, x.value]),
    );
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** The history row of a deployment, in the order of HISTORY_HEADER. */
export function historyRow(d: Deployment): string[] {
    return [limaDateTime(d.when), d.appVersion, String(d.scriptVersion), d.commit, d.changes.join('\n') || '—', d.description, d.deployedBy];
}

/** The block on top of the tab: the current link and what is live. */
export function summaryRows(d: Deployment): string[][] {
    return [
        ['Enlace vigente', d.url],
        ['Versión', d.appVersion],
        ['Versión de Apps Script', String(d.scriptVersion)],
        ['Desplegado el', limaDateTime(d.when)],
    ];
}

async function tabId(sheets: Sheets, bookId: string): Promise<number | null> {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: bookId, fields: 'sheets(properties(sheetId,title))' });
    const tab = meta.data.sheets?.find((s) => s.properties?.title === DEPLOYMENTS_TAB);
    return tab?.properties?.sheetId ?? null;
}

const historyRange = (row: number) => `'${DEPLOYMENTS_TAB}'!A${row}:${LAST_COLUMN}${row}`;

/** The commit and app version of the last recorded deployment, or null if there is none yet. */
export async function lastDeployment(sheets: Sheets, bookId: string): Promise<{ commit: string; appVersion: string } | null> {
    if ((await tabId(sheets, bookId)) === null) return null;
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: bookId, range: historyRange(HISTORY_FIRST_ROW) });
    const row = r.data.values?.[0];
    const commit = row?.[COMMIT_COLUMN]?.trim();
    return commit ? { commit, appVersion: row?.[1]?.trim() ?? '' } : null;
}

/** Creates the tab if needed, writes what is live on top and the deployment as the first history row. */
export async function recordDeployment(sheets: Sheets, bookId: string, d: Deployment): Promise<void> {
    let id = await tabId(sheets, bookId);
    if (id === null) {
        const r = await sheets.spreadsheets.batchUpdate({
            spreadsheetId: bookId,
            requestBody: { requests: [{ addSheet: { properties: { title: DEPLOYMENTS_TAB, gridProperties: { frozenRowCount: HEADER_ROW } } } }] },
        });
        id = r.data.replies?.[0]?.addSheet?.properties?.sheetId ?? null;
        if (id === null) throw new Error(`Could not create the ${DEPLOYMENTS_TAB} tab.`);
    }

    // A new empty row on top of the history, so the newest deployment is always the first one.
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: bookId,
        requestBody: {
            requests: [
                {
                    insertDimension: {
                        range: { sheetId: id, dimension: 'ROWS', startIndex: HISTORY_FIRST_ROW - 1, endIndex: HISTORY_FIRST_ROW },
                        inheritFromBefore: false,
                    },
                },
            ],
        },
    });

    await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: bookId,
        requestBody: {
            // RAW: nothing typed by a person (a description starting with "=") becomes a formula,
            // and a bare URL is still clickable in Sheets.
            valueInputOption: 'RAW',
            data: [
                { range: `'${DEPLOYMENTS_TAB}'!A1:B4`, values: summaryRows(d) },
                { range: historyRange(HEADER_ROW), values: [HISTORY_HEADER] },
                { range: historyRange(HISTORY_FIRST_ROW), values: [historyRow(d)] },
            ],
        },
    });
}
