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
        const email = this.env.GDRIVE_SA_EMAIL?.trim();
        const privateKey = this.env.GDRIVE_SA_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
        if (!email || !privateKey) {
            console.error('[apps] GDRIVE_SA_EMAIL / GDRIVE_SA_PRIVATE_KEY missing');
            return err({ kind: 'source-missing', message: 'Falta la cuenta de las descargas (GDRIVE_SA_EMAIL, GDRIVE_SA_PRIVATE_KEY).' });
        }
        this.tokens ??= new GoogleTokens({ email, privateKey }, this.fetchFn);
        try {
            const token = await this.tokens.get(DRIVE_FILE_SCOPE);
            return ok({ url: driveDownloadUrl(id), headers: { Authorization: `Bearer ${token.value}` } });
        } catch (e) {
            console.error('[apps] drive token failed', e instanceof Error ? e.message : e);
            return err({ kind: 'source-failed', message: 'No se pudo preparar la descarga desde Drive.' });
        }
    }
}
