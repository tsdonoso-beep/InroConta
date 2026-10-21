// Google Cloud Storage V4 signed URLs (GOOG4-RSA-SHA256), signed here with a service account's key
// and node:crypto — no SDK. https://cloud.google.com/storage/docs/access-control/signing-urls-manually
// Pure (no env, no server-only) so tests/unit can check it: the key and the clock come in.
import { createHash, createSign } from 'node:crypto';

export const GCS_HOST = 'storage.googleapis.com';
const ALGORITHM = 'GOOG4-RSA-SHA256';
/** GCS allows up to 7 days. */
const MAX_EXPIRES_S = 7 * 24 * 60 * 60;

export interface SignInput {
    bucket: string;
    object: string;
    /** client_email of the service account. */
    email: string;
    /** Its private_key (PEM). */
    privateKey: string;
    now: Date;
    expiresSeconds: number;
}

/** gs://bucket/path/to/object → { bucket, object }; null for anything else. */
export function parseGsUrl(url: string): { bucket: string; object: string } | null {
    const m = /^gs:\/\/([a-z0-9][a-z0-9._-]{1,220}[a-z0-9])\/(.+)$/.exec(url.trim());
    return m ? { bucket: m[1], object: m[2] } : null;
}

/** RFC 3986 percent-encoding (encodeURIComponent leaves !'()* alone; GCS wants them encoded). */
export const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Every segment encoded, the slashes kept. */
export const encodePath = (object: string) => object.split('/').map(rfc3986).join('/');

/** 20261021T121500Z and 20261021. */
export function stamps(now: Date): { datetime: string; date: string } {
    const datetime = now
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
    return { datetime, date: datetime.slice(0, 8) };
}

/** The pieces of the signature, exposed for the tests. */
export function canonical(input: Omit<SignInput, 'privateKey'>) {
    const { datetime, date } = stamps(input.now);
    const scope = `${date}/auto/storage/goog4_request`;
    const path = `/${input.bucket}/${encodePath(input.object)}`;
    const params: [string, string][] = [
        ['X-Goog-Algorithm', ALGORITHM],
        ['X-Goog-Credential', `${input.email}/${scope}`],
        ['X-Goog-Date', datetime],
        ['X-Goog-Expires', String(Math.max(1, Math.min(MAX_EXPIRES_S, Math.floor(input.expiresSeconds))))],
        ['X-Goog-SignedHeaders', 'host'],
    ];
    const query = params
        .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
    const request = ['GET', path, query, `host:${GCS_HOST}`, '', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
    const stringToSign = [ALGORITHM, datetime, scope, createHash('sha256').update(request).digest('hex')].join('\n');
    return { path, query, request, stringToSign };
}

/** https://storage.googleapis.com/<bucket>/<object>?X-Goog-…&X-Goog-Signature=<hex> */
export function signedGcsUrl(input: SignInput): string {
    const { path, query, stringToSign } = canonical(input);
    const signature = createSign('RSA-SHA256').update(stringToSign).sign(input.privateKey, 'hex');
    return `https://${GCS_HOST}${path}?${query}&X-Goog-Signature=${signature}`;
}
