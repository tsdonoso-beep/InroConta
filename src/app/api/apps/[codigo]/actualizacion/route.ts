// «Is there an update?» for a desktop app (Carga CONCAR…), in the format of Tauri's updater:
//   GET /api/apps/<codigo>/actualizacion?version=0.2.0&target=windows&arch=x86_64
//   headers X-Equipo (random id of the PC) and, optionally, X-Nombre-Equipo
// → 200 {version, notes, pub_date, url, signature, sha256, tamano_bytes, obligatoria, descarga_headers}
//   or 204 (nothing new).
// PUBLIC on purpose: the apps have no session (this route does not go through answer()). It only
// reveals the newest version and a Drive token that lasts one hour and, by its drive.file scope,
// opens only the files the uploading service account created (the installers).
import { NextResponse } from 'next/server';
import { findUpdate } from '../../../../../modules/apps/composition.ts';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(req: Request, { params }: { params: Promise<{ codigo: string }> }) {
    const { codigo } = await params;
    const q = new URL(req.url).searchParams;
    const outcome = await findUpdate({
        app: codigo,
        version: q.get('version'),
        target: q.get('target'),
        arch: q.get('arch'),
        device: req.headers.get('x-equipo'),
        deviceName: req.headers.get('x-nombre-equipo'),
    });
    switch (outcome.kind) {
        case 'update':
            return NextResponse.json(outcome.manifest, { headers: NO_STORE });
        case 'none':
            return new NextResponse(null, { status: 204, headers: NO_STORE });
        case 'bad-request':
            return NextResponse.json({ error: outcome.message }, { status: 400, headers: NO_STORE });
        case 'not-found':
            return NextResponse.json({ error: outcome.message }, { status: 404, headers: NO_STORE });
        default:
            return NextResponse.json({ error: outcome.message }, { status: 502, headers: NO_STORE });
    }
}
