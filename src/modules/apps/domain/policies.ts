// The pure rules of «is there an update?»: which platform a Tauri target/arch is, which inputs are
// valid, and how a release becomes the updater's answer.
import type { DownloadLink, Platform, Release, UpdaterManifest } from './entities/Release.ts';

const OS: Record<string, string> = { windows: 'windows', darwin: 'macos', macos: 'macos', linux: 'linux' };
const ARCH: Record<string, string> = { x86_64: 'x64', x64: 'x64', amd64: 'x64', aarch64: 'arm64', arm64: 'arm64' };
const PLATFORMS: readonly Platform[] = ['windows-x64', 'windows-arm64', 'macos-x64', 'macos-arm64', 'linux-x64'];

/** Tauri's {{target}} + {{arch}} (windows + x86_64, darwin + aarch64…) → aplicacion_version.plataforma; null if unsupported. */
export function platformOf(target: string | null, arch: string | null): Platform | null {
    const os = OS[(target ?? '').trim().toLowerCase()];
    const a = ARCH[(arch ?? '').trim().toLowerCase()];
    if (!os || !a) return null;
    const p = `${os}-${a}` as Platform;
    return PLATFORMS.includes(p) ? p : null;
}

export const isAppCode = (code: string) => /^[a-z0-9-]{1,60}$/.test(code);

/** x.y.z only, like the table (a Tauri pre-release «1.2.3-beta.1» is not one). */
export const isVersion = (v: string) => /^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(v);

/** aplicacion_equipo.equipo is 8–100 characters; anything else is ignored (not an error). */
export function deviceOf(raw: string | null): string | null {
    const v = (raw ?? '').trim();
    return /^[A-Za-z0-9._:-]{8,100}$/.test(v) ? v : null;
}

/** The PC's name, if the app sent one: printable, at most 100 characters. */
export function deviceNameOf(raw: string | null): string | null {
    const v = (raw ?? '')
        .replace(/[^\P{C}]/gu, '')
        .trim()
        .slice(0, 100);
    return v || null;
}

/** The answer for the updater, with the download link already usable (and its token when private). */
export function manifestOf(release: Release, link: DownloadLink): UpdaterManifest {
    return {
        version: release.version,
        notes: release.notes ?? '',
        pub_date: new Date(release.publishedAt).toISOString(),
        url: link.url,
        descarga_headers: link.headers,
        signature: release.signature ?? '',
        sha256: release.sha256,
        tamano_bytes: release.sizeBytes,
        obligatoria: release.mandatory,
    };
}
