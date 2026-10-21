// The documents for the browser, compact (application/wire.ts), once per tab: the SUNAT screens
// share them from memory (_comprobantes/docs-store.ts) instead of each page carrying 7 MB.
// The ETag is the instant the server read the book, so a browser that already has that read
// gets a 304 and nothing travels.
import { NextResponse } from 'next/server';
import { getDocuments } from '../../../modules/comprobantes/composition.ts';
import { encodeDocs } from '../../../modules/comprobantes/application/views.ts';
import { currentUser } from '../../../shared/auth/session.ts';
import { measure } from '../../_lib/perf.ts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    if (!(await currentUser())) return NextResponse.json({ error: 'Sin sesión.' }, { status: 401 });
    const result = await measure('/api/comprobantes', 'documentos de la base', getDocuments());
    if (result.isErr()) return NextResponse.json({ error: result.error.message }, { status: 502 });

    const etag = `"${result.value.readAt}"`;
    const headers = { ETag: etag, 'Cache-Control': 'private, no-cache' };
    if (request.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers });
    return NextResponse.json(encodeDocs(result.value), { headers });
}
