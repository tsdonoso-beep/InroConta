// Sign-in with Google (next-auth v4). Only @inroprin.com accounts allowed by access.ts get a
// session; everybody else is sent back to /login with the reason.
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
    session: { strategy: 'jwt', maxAge: 12 * 60 * 60 },
    pages: { signIn: '/login', error: '/login' },
    callbacks: {
        async signIn({ profile }) {
            const p = profile as { email?: string; email_verified?: boolean } | undefined;
            if (!p?.email_verified) return '/login?error=unverified';
            return (await allowedUser(p.email)) ? true : '/login?error=denied';
        },
    },
};

// Only on a laptop (`next dev` or `next start`): Vercel always sets VERCEL, so there it never applies.
const devUser = (): AppUser | null => (!process.env.VERCEL && process.env.DEV_USER_EMAIL ? { email: process.env.DEV_USER_EMAIL, role: 'admin' } : null);

/**
 * The signed-in user, checked again against USUARIOS on every page (a row removed from the
 * tab closes the door within minutes, not when the 12 h session ends). null if none. Memoized
 * per request (React cache): the layout and the page ask once between them.
 */
export const currentUser = cache(async (): Promise<AppUser | null> => {
    const dev = devUser();
    if (dev) return dev;
    const session = await getServerSession(authOptions);
    return allowedUser(session?.user?.email);
});

/** For pages and server actions: the user, or straight to /login. */
export async function requireUser(): Promise<AppUser> {
    const user = await currentUser();
    if (!user) redirect('/login');
    return user;
}
