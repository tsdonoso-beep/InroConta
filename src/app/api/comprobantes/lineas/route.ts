// The lines of one document (Buscar factura), from the book already in the server's memory.
import type { NextRequest } from 'next/server';
import { getDocumentLines } from '../../../../modules/comprobantes/composition.ts';
import { answer } from '../../../_lib/api.ts';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
    const q = request.nextUrl.searchParams;
    return answer('/api/comprobantes/lineas', () => getDocumentLines(q.get('ruc') ?? '', q.get('serie') ?? '', q.get('numero') ?? ''));
}
