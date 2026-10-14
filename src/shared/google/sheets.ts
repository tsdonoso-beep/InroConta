// Google Sheets from the web app's server, with the robots' service account.
// On Vercel the key comes in GOOGLE_SA_PRIVATE_KEY (the .json pasted whole is fine); on a
// laptop, GOOGLE_SA_KEY_FILE pointing to the .json also works, as for the scripts.
//
// googleapis is imported only when a sheet is read: loading it costs ~2.7 s on a cold server
// (measured 13/10/2026), and most requests (a page, a filter) never read a sheet.
import 'server-only';
import { readFileSync } from 'node:fs';
import type { sheets_v4 } from 'googleapis';

let sheets: Promise<sheets_v4.Sheets> | null = null;

function rawKey(): string | undefined {
    const inline = process.env.GOOGLE_SA_PRIVATE_KEY?.trim();
    if (inline) return inline;
    const file = process.env.GOOGLE_SA_KEY_FILE?.trim();
    if (!file) return undefined;
    // The same shapes claveDesdeTexto (scripts/local/comun/config.mts) accepts: Google's .json,
    // or that .json wrapped in { "GOOGLE_SA_PRIVATE_KEY": … }.
    const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    try {
        const j = JSON.parse(text) as Record<string, unknown>;
        const inner = j.private_key ? j : (j.GOOGLE_SA_PRIVATE_KEY ?? j);
        return typeof inner === 'string' ? inner : JSON.stringify(inner);
    } catch {
        return text;
    }
}

export function sheetsClient(): Promise<sheets_v4.Sheets> {
    sheets ??= connect().catch((e) => {
        sheets = null; // the next read tries again
        throw e;
    });
    return sheets;
}

async function connect(): Promise<sheets_v4.Sheets> {
    const [{ google }, { correoDeServicio, normalizarClavePrivada }] = await Promise.all([import('googleapis'), import('../lib/drive/servidor.ts')]);
    const raw = rawKey();
    const email = correoDeServicio(process.env.GOOGLE_SA_EMAIL, raw);
    const key = normalizarClavePrivada(raw);
    if (!email || !key) throw new Error('Falta la cuenta de servicio de Google (GOOGLE_SA_PRIVATE_KEY y GOOGLE_SA_EMAIL).');
    const auth = new google.auth.GoogleAuth({
        credentials: { client_email: email, private_key: key },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    return google.sheets({ version: 'v4', auth });
}

/** A tab's values as text rows (the header first), or null when the tab does not exist. */
export async function readTab(spreadsheetId: string, tab: string): Promise<string[][] | null> {
    const rows = await readTabRaw(spreadsheetId, tab, false);
    return rows && rows.map((row) => row.map((c) => String(c ?? '').trim()));
}

/**
 * A tab's values as Google keeps them: with `unformatted`, numbers come as numbers (no
 * thousands separators to undo) and dates as the text the sheet shows (dd/mm/yyyy).
 */
export async function readTabRaw(spreadsheetId: string, tab: string, unformatted = true): Promise<unknown[][] | null> {
    try {
        const r = await (
            await sheetsClient()
        ).spreadsheets.values.get({
            spreadsheetId,
            range: `'${tab}'`,
            valueRenderOption: unformatted ? 'UNFORMATTED_VALUE' : 'FORMATTED_VALUE',
            dateTimeRenderOption: 'FORMATTED_STRING',
        });
        return r.data.values ?? [];
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/Unable to parse range/i.test(msg)) return null;
        console.error('[sheets] read failed', { spreadsheetId, tab, error: msg });
        throw e;
    }
}
