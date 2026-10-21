// Sign-in with Google (next-auth v4). Only accounts of the inroprin.com Workspace allowed by
// access.ts get a session; everybody else is sent back to /login with the reason. Google only says
// who the person is: the app never calls Google on their behalf (Drive and Sheets go with the
// service account), so there is no Google token to keep or renew, only our signed cookie.
//
// Needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (an OAuth client of type «Web application» with
// <url>/api/auth/callback/google as redirect URI) and NEXTAUTH_SECRET. On a laptop without that
// client, DEV_USER_EMAIL signs everybody in as that user — only under `next dev`.
import 'server-only';
import { getServerSession, type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { ALLOWED_DOMAIN, allowedUser, type AppUser } from './access.ts';

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID ?? '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
            // hd only preselects the domain in Google's screen; the real check is in signIn.
            authorization: { params: { hd: ALLOWED_DOMAIN, prompt: 'select_account' } },
        }),
    ],
    // 30 days from the last renewal: SessionKeepAlive renews it once a day while the app is used, so
    // a person signs in again only after a month away. Revoking does not wait for it (currentUser).
    session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
    pages: { signIn: '/login', error: '/login' },
    callbacks: {
        async signIn({ profile }) {
            const p = profile as { email?: string; email_verified?: boolean; hd?: string } | undefined;
            if (!p?.email_verified) return '/login?error=unverified';
            // hd is the Workspace the account belongs to: Google's own word, not the email's ending.
            if (p.hd !== ALLOWED_DOMAIN) return '/login?error=denied';
            return (await allowedUser(p.email)) ? true : '/login?error=denied';
        },
    },
};

// Only on a laptop (`next dev` or `next start`): Vercel always sets VERCEL, so there it never applies.
const devUser = (): AppUser | null => (!process.env.VERCEL && process.env.DEV_USER_EMAIL ? { email: process.env.DEV_USER_EMAIL, role: 'admin' } : null);

/**
 * The signed-in user, checked again against usuario_inroconta on every page (a row switched
 * off closes the door within a minute, not when the 30-day session ends). null if none. Memoized
 * per request (React cache): the layout and the page ask once between them.
 */
export const currentUser = cache(async (): Promise<AppUser | null> => {
    const dev = devUser();
    if (dev) return dev;
    const session = await sessionOf();
    return allowedUser(session?.user?.email);
});

/** The Google session, read once per request (currentUser and currentProfile share it). */
const sessionOf = cache(() => getServerSession(authOptions));

/** What Google says of the person, for the menu: name and profile photo (null on a laptop with DEV_USER_EMAIL). */
export const currentProfile = cache(async (): Promise<{ name: string | null; image: string | null }> => {
    if (devUser()) return { name: null, image: null };
    const session = await sessionOf();
    return { name: session?.user?.name ?? null, image: session?.user?.image ?? null };
});

/** For pages and server actions: the user, or straight to /login. */
export async function requireUser(): Promise<AppUser> {
    const user = await currentUser();
    if (!user) redirect('/login');
    return user;
}

/** For the admin screens and their actions: the user if admin; anybody else goes home. */
export async function requireAdmin(): Promise<AppUser> {
    const user = await requireUser();
    if (user.role !== 'admin') redirect('/');
    return user;
}
