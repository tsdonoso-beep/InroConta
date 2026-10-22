// The installers live in a private folder of the company's Drive («Apps INROPRIN», a shared drive):
// aplicacion_version.url says gdrive://<file id>. The app downloads it from the Drive API with a token
// of the service account that uploaded it. The scope is drive.file: the token opens ONLY the files that
// account created (the installers), not the rest of what it can see, because this route is public.
// https:// links (a public host) pass as they are, without headers.
//
// Needs GDRIVE_SA_EMAIL and GDRIVE_SA_PRIVATE_KEY: client_email and private_key of the descargas-apps
// service account (the key's \n may come escaped from Vercel).
import 'server-only';
import { err, ok, type Result } from 'neverthrow';
import type { SourceError } from '../../../shared/errors.ts';
import type { DownloadLinker } from '../application/ports/ReleasePort.ts';
import type { DownloadLink } from '../domain/entities/Release.ts';
import { GoogleTokens } from './googleToken.ts';

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const RX_GDRIVE = /^gdrive:\/\/([A-Za-z0-9_-]{10,})$/;

export function driveFileId(url: string): string | null {
    return RX_GDRIVE.exec(url.trim())?.[1] ?? null;
}

/**
 * The PEM key however it was pasted in Vercel: as is, with the JSON's quotes, with \n escaped once or
 * twice, or the whole service-account JSON. A key pasted «the wrong way» failed every download with no
 * hint (502 on 22/10/2026), so the shapes a person actually pastes are accepted here.
 */
export function privateKeyOf(raw: string | undefined): string {
    let v = (raw ?? '').trim();
    if (v.startsWith('{')) {
        try {
            v = String((JSON.parse(v) as { private_key?: string }).private_key ?? '');
        } catch {
            /* not JSON after all: treated as the key itself */
        }
    }
    v = v.replace(/^"|"$/g, '').replace(/\\\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r/g, '');
    // Rebuilt from its base64 body: a paste that turned the line breaks into spaces (Vercel's single-line
    // field) still decodes. Only a cut key cannot be saved.
    const m = /-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/.exec(v);
    if (!m) return v.trim();
    const body = m[2].replace(/[^A-Za-z0-9+/=]/g, '');
    return `-----BEGIN ${m[1]}-----\n${body.replace(/.{1,64}/g, '$&\n')}-----END ${m[1]}-----\n`;
}

/** What the key looks like, never its content: for the log when it does not decode. */
export function keyShape(key: string): string {
    const body = /-----BEGIN [A-Z ]+-----([\s\S]*?)-----END/.exec(key)?.[1].replace(/\s/g, '') ?? '';
    return `largo ${key.length}, BEGIN ${key.includes('-----BEGIN')}, END ${key.includes('-----END')}, base64 ${body.length} car.`;
}

export const driveDownloadUrl = (id: string) => `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`;

export class DriveDownloadLinker implements DownloadLinker {
    private tokens: GoogleTokens | null = null;

    constructor(
        private readonly env: Readonly<Record<string, string | undefined>> = process.env,
        private readonly fetchFn: typeof fetch = fetch,
    ) {}

    async link(url: string): Promise<Result<DownloadLink, SourceError>> {
        if (/^https:\/\//i.test(url)) return ok({ url, headers: {} });
        const id = driveFileId(url);
        if (!id) {
            console.error('[apps] unsupported installer url', url);
            return err({ kind: 'source-shape', message: 'El enlace del instalador no es gdrive:// ni https://.' });
        }
        const email = this.env.GDRIVE_SA_EMAIL?.trim().replace(/^"|"$/g, '');
        const privateKey = privateKeyOf(this.env.GDRIVE_SA_PRIVATE_KEY);
        if (!email || !privateKey) {
            console.error('[apps] GDRIVE_SA_EMAIL / GDRIVE_SA_PRIVATE_KEY missing');
            return err({ kind: 'source-missing', message: 'Falta la cuenta de las descargas (GDRIVE_SA_EMAIL, GDRIVE_SA_PRIVATE_KEY).' });
        }
        this.tokens ??= new GoogleTokens({ email, privateKey }, this.fetchFn);
        try {
            const token = await this.tokens.get(DRIVE_FILE_SCOPE);
            return ok({ url: driveDownloadUrl(id), headers: { Authorization: `Bearer ${token.value}` } });
        } catch (e) {
            // a healthy service-account key has ~1620 base64 characters; much less means the paste was cut
            console.error('[apps] drive token failed', e instanceof Error ? e.message : e, '| llave:', keyShape(privateKey));
            return err({ kind: 'source-failed', message: 'No se pudo preparar la descarga desde Drive.' });
        }
    }
}
