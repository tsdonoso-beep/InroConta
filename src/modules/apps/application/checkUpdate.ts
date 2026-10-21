// «Is there an update?» for a desktop app: validates what the app sent, asks the port and turns the
// release into the updater's answer. The route maps the outcome to HTTP (200 / 204 / 400 / 404 / 502).
import type { SourceError } from '../../../shared/errors.ts';
import type { UpdaterManifest } from '../domain/entities/Release.ts';
import { deviceNameOf, deviceOf, isAppCode, isVersion, manifestOf, platformOf } from '../domain/policies.ts';
import type { DownloadLinker, ReleasePort } from './ports/ReleasePort.ts';

/** What the app sends: the path's code, the query string and two headers (X-Equipo, X-Nombre-Equipo). */
export interface UpdateRequest {
    app: string;
    version: string | null;
    target: string | null;
    arch: string | null;
    device: string | null;
    deviceName: string | null;
}

export type UpdateOutcome =
    | { kind: 'update'; manifest: UpdaterManifest }
    | { kind: 'none' }
    | { kind: 'bad-request'; message: string }
    | { kind: 'not-found'; message: string }
    | { kind: 'failed'; message: string };

const failed = (e: SourceError): UpdateOutcome => (e.kind === 'not-found' ? { kind: 'not-found', message: e.message } : { kind: 'failed', message: e.message });

export async function checkUpdate(port: ReleasePort, linker: DownloadLinker, req: UpdateRequest): Promise<UpdateOutcome> {
    const app = req.app.trim().toLowerCase();
    const version = (req.version ?? '').trim();
    if (!isAppCode(app)) return { kind: 'bad-request', message: 'Código de aplicación inválido.' };
    if (!isVersion(version)) return { kind: 'bad-request', message: 'Versión inválida (se espera x.y.z).' };
    const platform = platformOf(req.target, req.arch);
    if (!platform) return { kind: 'bad-request', message: `Plataforma no soportada: ${req.target ?? '?'}/${req.arch ?? '?'}.` };

    const found = await port.findUpdate({ app, platform, version, device: deviceOf(req.device), deviceName: deviceNameOf(req.deviceName) });
    if (found.isErr()) return failed(found.error);
    const release = found.value;
    if (!release) return { kind: 'none' };
    // Tauri refuses an installer without its signature: offering it would only show an error.
    if (!release.signature) {
        console.error(`[apps] ${app} ${release.version} (${platform}) has no signature: not offered`);
        return { kind: 'none' };
    }

    const link = await linker.link(release.url);
    if (link.isErr()) return failed(link.error);
    return { kind: 'update', manifest: manifestOf(release, link.value) };
}
