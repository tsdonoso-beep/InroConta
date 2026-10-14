// The /api routes' common door: a session first (401 without one), then the read as JSON. A
// failed read is 502 with the message in words (the raw error went to the log where it happened).
import { NextResponse } from 'next/server';
import type { Result } from 'neverthrow';
import { currentUser } from '../../shared/auth/session.ts';
import type { SourceError } from '../../shared/errors.ts';
import { measure } from './perf.ts';

export async function answer<T>(route: string, read: () => Promise<Result<T, SourceError>>): Promise<NextResponse> {
    if (!(await currentUser())) return NextResponse.json({ error: 'Sin sesión.' }, { status: 401 });
    const result = await measure(route, 'lectura', read());
    if (result.isErr()) return NextResponse.json({ error: result.error.message }, { status: result.error.kind === 'not-found' ? 404 : 502 });
    return NextResponse.json(result.value, { headers: { 'Cache-Control': 'private, no-cache' } });
}
