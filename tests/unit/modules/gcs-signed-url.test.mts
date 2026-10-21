// The V4 signed URLs of the private installers bucket (src/modules/apps/infrastructure/gcsSignedUrl.ts):
// the canonical request written by hand from Google's spec, and the signature checked with the
// public half of a throwaway key.
import { createHash, createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonical, encodePath, parseGsUrl, signedGcsUrl, stamps } from '../../../src/modules/apps/infrastructure/gcsSignedUrl.ts';

const NOW = new Date('2026-10-21T12:15:30.123Z');
const EMAIL = 'firmador@proyecto.iam.gserviceaccount.com';
const INPUT = { bucket: 'inroprin-apps', object: 'carga-concar/0.3.0/Carga CONCAR_0.3.0_x64-setup.exe', email: EMAIL, now: NOW, expiresSeconds: 900 };

const QUERY =
    'X-Goog-Algorithm=GOOG4-RSA-SHA256' +
    '&X-Goog-Credential=firmador%40proyecto.iam.gserviceaccount.com%2F20261021%2Fauto%2Fstorage%2Fgoog4_request' +
    '&X-Goog-Date=20261021T121530Z' +
    '&X-Goog-Expires=900' +
    '&X-Goog-SignedHeaders=host';

describe('gs:// and paths', () => {
    it('splits gs://bucket/object', () => {
        expect(parseGsUrl('gs://inroprin-apps/a/b c.exe')).toEqual({ bucket: 'inroprin-apps', object: 'a/b c.exe' });
        expect(parseGsUrl('https://x/y')).toBeNull();
        expect(parseGsUrl('gs://bucket-only')).toBeNull();
    });
    it('encodes each segment (RFC 3986) and keeps the slashes', () => {
        expect(encodePath("a b/c(1)!*'.exe")).toBe('a%20b/c%281%29%21%2A%27.exe');
    });
    it('stamps the UTC date without separators or milliseconds', () => {
        expect(stamps(NOW)).toEqual({ datetime: '20261021T121530Z', date: '20261021' });
    });
});

describe('canonical request', () => {
    it('follows GOOG4-RSA-SHA256 with only the host signed and an unsigned payload', () => {
        const c = canonical(INPUT);
        expect(c.path).toBe('/inroprin-apps/carga-concar/0.3.0/Carga%20CONCAR_0.3.0_x64-setup.exe');
        expect(c.query).toBe(QUERY);
        expect(c.request).toBe(['GET', c.path, QUERY, 'host:storage.googleapis.com', '', 'host', 'UNSIGNED-PAYLOAD'].join('\n'));
        const hash = createHash('sha256').update(c.request).digest('hex');
        expect(c.stringToSign).toBe(`GOOG4-RSA-SHA256\n20261021T121530Z\n20261021/auto/storage/goog4_request\n${hash}`);
    });
    it('caps the expiry at 7 days', () => {
        expect(canonical({ ...INPUT, expiresSeconds: 10 * 24 * 3600 }).query).toContain('X-Goog-Expires=604800');
    });
});

describe('signedGcsUrl', () => {
    it('appends a hex RSA-SHA256 signature of the string to sign', () => {
        const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
        const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
        const url = signedGcsUrl({ ...INPUT, privateKey: pem });
        const prefix = `https://storage.googleapis.com/inroprin-apps/carga-concar/0.3.0/Carga%20CONCAR_0.3.0_x64-setup.exe?${QUERY}&X-Goog-Signature=`;
        expect(url.startsWith(prefix)).toBe(true);
        const signature = url.slice(prefix.length);
        expect(signature).toMatch(/^[0-9a-f]{512}$/);
        const ok = createVerify('RSA-SHA256').update(canonical(INPUT).stringToSign).verify(publicKey, signature, 'hex');
        expect(ok).toBe(true);
    });
});
