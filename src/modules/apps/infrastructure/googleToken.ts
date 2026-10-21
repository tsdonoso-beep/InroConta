// An OAuth access token for a Google service account (JWT bearer grant), without googleapis (it costs
// seconds to load). Kept in memory until five minutes before it expires: one exchange per hour per
// server instance, not one per app that asks.
import 'server-only';

export interface ServiceAccount {
    email: string;
    privateKey: string;
}

export interface Token {
    value: string;
    expiresAt: number;
}

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const MARGIN_MS = 5 * 60_000;

/** The signed assertion Google exchanges for a token (exported for the tests). */
export async function assertion(sa: ServiceAccount, scope: string, nowS: number): Promise<string> {
    const { createSign } = await import('node:crypto');
    const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64(JSON.stringify({ iss: sa.email, scope, aud: 'https://oauth2.googleapis.com/token', iat: nowS, exp: nowS + 3600 }));
    const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.privateKey).toString('base64url');
    return `${head}.${claim}.${sig}`;
}

export class GoogleTokens {
    private cache = new Map<string, Token>();

    constructor(
        private readonly sa: ServiceAccount,
        private readonly fetchFn: typeof fetch = fetch,
        private readonly now: () => number = Date.now,
    ) {}

    async get(scope: string): Promise<Token> {
        const hit = this.cache.get(scope);
        if (hit && hit.expiresAt - MARGIN_MS > this.now()) return hit;
        const body = new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: await assertion(this.sa, scope, Math.floor(this.now() / 1000)),
        });
        const r = await this.fetchFn('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body,
        });
        const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
        if (!r.ok || !j.access_token) throw new Error(`token ${r.status}: ${j.error ?? ''} ${j.error_description ?? ''}`.trim());
        const token = { value: j.access_token, expiresAt: this.now() + (j.expires_in ?? 3600) * 1000 };
        this.cache.set(scope, token);
        return token;
    }
}
