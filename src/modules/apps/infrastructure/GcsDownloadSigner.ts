// The installers live in a PRIVATE Cloud Storage bucket: aplicacion_version.url says gs://bucket/path
// and each answer carries a link signed for 15 minutes. https:// links (a public host) pass as they are.
//
// Needs GCS_SIGNER_EMAIL and GCS_SIGNER_PRIVATE_KEY: the client_email and private_key of a service
// account with «Storage Object Viewer» on the bucket (the key's \n may come escaped from Vercel).
import 'server-only';
import { err, ok, type Result } from 'neverthrow';
import type { SourceError } from '../../../shared/errors.ts';
import type { DownloadSigner } from '../application/ports/ReleasePort.ts';
import { parseGsUrl, signedGcsUrl } from './gcsSignedUrl.ts';

const FIFTEEN_MINUTES_S = 15 * 60;

export class GcsDownloadSigner implements DownloadSigner {
    constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

    downloadUrl(url: string): Result<string, SourceError> {
        if (/^https:\/\//i.test(url)) return ok(url);
        const gs = parseGsUrl(url);
        if (!gs) {
            console.error('[apps] unsupported installer url', url);
            return err({ kind: 'source-shape', message: 'El enlace del instalador no es gs:// ni https://.' });
        }
        const email = this.env.GCS_SIGNER_EMAIL?.trim();
        const privateKey = this.env.GCS_SIGNER_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
        if (!email || !privateKey) {
            console.error('[apps] GCS_SIGNER_EMAIL / GCS_SIGNER_PRIVATE_KEY missing');
            return err({ kind: 'source-missing', message: 'Falta la cuenta que firma las descargas (GCS_SIGNER_EMAIL, GCS_SIGNER_PRIVATE_KEY).' });
        }
        try {
            return ok(signedGcsUrl({ ...gs, email, privateKey, now: new Date(), expiresSeconds: FIFTEEN_MINUTES_S }));
        } catch (e) {
            console.error('[apps] signing the download failed', e instanceof Error ? e.message : e);
            return err({ kind: 'source-failed', message: 'No se pudo firmar el enlace de descarga.' });
        }
    }
}
