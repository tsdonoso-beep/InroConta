// The Drive download of the desktop apps' installers (src/modules/apps/infrastructure): gdrive:// ids,
// the drive.file token (never a wider scope: the route is public), its cache, and the errors.
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { DRIVE_FILE_SCOPE, DriveDownloadLinker, driveFileId, privateKeyOf } from '../../../src/modules/apps/infrastructure/DriveDownloadLinker.ts';
import { GoogleTokens, assertion } from '../../../src/modules/apps/infrastructure/googleToken.ts';

vi.mock('server-only', () => ({}));

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const ENV = { GDRIVE_SA_EMAIL: 'descargas-apps@inroprin-apps.iam.gserviceaccount.com', GDRIVE_SA_PRIVATE_KEY: PEM.replace(/\n/g, '\\n') };

function tokenServer() {
    const bodies: URLSearchParams[] = [];
    const fn = vi.fn(async (_url: unknown, init?: RequestInit) => {
        bodies.push(init?.body as URLSearchParams);
        return new Response(JSON.stringify({ access_token: `tok${bodies.length}`, expires_in: 3600 }), { status: 200 });
    });
    return { fn: fn as unknown as typeof fetch, bodies, calls: fn };
}

describe('driveFileId', () => {
    it('reads only gdrive://<id>', () => {
        expect(driveFileId('gdrive://1AbCdEfGhIjKlMnOp')).toBe('1AbCdEfGhIjKlMnOp');
        expect(driveFileId('gdrive://corto')).toBeNull();
        expect(driveFileId('gs://bucket/x.exe')).toBeNull();
    });
});

describe('privateKeyOf', () => {
    it('reads the key however it was pasted in Vercel', () => {
        const clean = PEM.trim();
        const escaped = PEM.replace(/\n/g, '\\n');
        expect(privateKeyOf(PEM)).toBe(clean);
        expect(privateKeyOf(escaped)).toBe(clean);
        expect(privateKeyOf(`"${escaped}"`)).toBe(clean);
        expect(privateKeyOf(PEM.replace(/\n/g, '\\\\n'))).toBe(clean);
        expect(privateKeyOf(PEM.replace(/\n/g, '\r\n'))).toBe(clean);
        expect(privateKeyOf(JSON.stringify({ type: 'service_account', private_key: PEM }))).toBe(clean);
        expect(privateKeyOf(undefined)).toBe('');
    });
});

describe('assertion', () => {
    it('is a JWT signed with the account key, asking for drive.file only', async () => {
        const jwt = await assertion({ email: ENV.GDRIVE_SA_EMAIL, privateKey: PEM }, DRIVE_FILE_SCOPE, 1_000);
        const [h, c, s] = jwt.split('.');
        const claim = JSON.parse(Buffer.from(c, 'base64url').toString());
        expect(claim).toMatchObject({ iss: ENV.GDRIVE_SA_EMAIL, scope: DRIVE_FILE_SCOPE, iat: 1_000, exp: 4_600 });
        expect(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s, 'base64url'))).toBe(true);
    });
});

describe('DriveDownloadLinker', () => {
    it('gives the Drive API link with a Bearer token', async () => {
        const t = tokenServer();
        const out = await new DriveDownloadLinker(ENV, t.fn).link('gdrive://1AbCdEfGhIjKlMnOp');
        expect(out._unsafeUnwrap()).toEqual({
            url: 'https://www.googleapis.com/drive/v3/files/1AbCdEfGhIjKlMnOp?alt=media&supportsAllDrives=true',
            headers: { Authorization: 'Bearer tok1' },
        });
        expect(t.bodies[0].get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    });

    it('reuses the token while it is valid (one exchange, not one per app)', async () => {
        const t = tokenServer();
        const l = new DriveDownloadLinker(ENV, t.fn);
        await l.link('gdrive://1AbCdEfGhIjKlMnOp');
        await l.link('gdrive://1ZyXwVuTsRqPoNmLk');
        expect(t.calls).toHaveBeenCalledTimes(1);
    });

    it('asks again five minutes before it expires', async () => {
        const t = tokenServer();
        let now = 0;
        const tokens = new GoogleTokens({ email: ENV.GDRIVE_SA_EMAIL, privateKey: PEM }, t.fn, () => now);
        await tokens.get(DRIVE_FILE_SCOPE);
        now = 56 * 60_000;
        expect((await tokens.get(DRIVE_FILE_SCOPE)).value).toBe('tok2');
    });

    it('passes https links through and refuses anything else', async () => {
        const t = tokenServer();
        const l = new DriveDownloadLinker(ENV, t.fn);
        expect((await l.link('https://example.com/x.exe'))._unsafeUnwrap()).toEqual({ url: 'https://example.com/x.exe', headers: {} });
        expect((await l.link('gs://bucket/x.exe'))._unsafeUnwrapErr().kind).toBe('source-shape');
        expect(t.calls).not.toHaveBeenCalled();
    });

    it('says what is missing or failed', async () => {
        expect((await new DriveDownloadLinker({}, tokenServer().fn).link('gdrive://1AbCdEfGhIjKlMnOp'))._unsafeUnwrapErr().kind).toBe('source-missing');
        const down = vi.fn(async () => new Response('{"error":"invalid_grant"}', { status: 400 })) as unknown as typeof fetch;
        expect((await new DriveDownloadLinker(ENV, down).link('gdrive://1AbCdEfGhIjKlMnOp'))._unsafeUnwrapErr().kind).toBe('source-failed');
    });
});
