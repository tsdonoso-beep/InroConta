// Sign out in one step: the session cookies are deleted here and the browser goes to /login.
// next-auth's own signOut() can fall back to its «Are you sure you want to sign out?» page (when
// its fetch cannot finish, e.g. NEXTAUTH_URL pointing elsewhere); he did not want that step
// (21/10/2026). The session is a signed cookie (JWT strategy, session.ts): without it there is none.
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// The names next-auth v4 uses, with and without the __Secure-/__Host- prefix of HTTPS.
const SESSION_COOKIES = [
    'next-auth.session-token',
    '__Secure-next-auth.session-token',
    'next-auth.csrf-token',
    '__Host-next-auth.csrf-token',
    'next-auth.callback-url',
    '__Secure-next-auth.callback-url',
];

export async function POST(request: Request) {
    const jar = await cookies();
    // next-auth splits a large session token into .0, .1…: those go too.
    const chunks = jar
        .getAll()
        .map((c) => c.name)
        .filter((n) => /next-auth\.session-token\.\d+$/.test(n));
    // Overwritten expired, with the attributes they were set with: a __Secure-/__Host- cookie is
    // only replaced by one that is also Secure (a plain delete would leave it alive on HTTPS).
    for (const name of [...SESSION_COOKIES, ...chunks])
        jar.set(name, '', { maxAge: 0, path: '/', httpOnly: true, sameSite: 'lax', secure: name.startsWith('__') });
    // 303: the browser follows a form POST with a GET to /login.
    return NextResponse.redirect(new URL('/login', request.url), 303);
}
