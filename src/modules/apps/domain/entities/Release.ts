// A published version of one of the company's desktop apps (aplicacion_version, 008_aplicaciones.sql)
// as buscar_actualizacion() answers it, and what the app's updater gets back.

/** aplicacion_version.plataforma. */
export type Platform = 'windows-x64' | 'windows-arm64' | 'macos-x64' | 'macos-arm64' | 'linux-x64';

/** «Is there something newer than `version` for this PC?» */
export interface UpdateQuery {
    app: string;
    platform: Platform;
    version: string;
    /** Random id the app generated once; null when it did not send a valid one. */
    device: string | null;
    deviceName: string | null;
}

/** The newest version the PC may install (buscar_actualizacion with hay = true). */
export interface Release {
    version: string;
    /** gdrive://<file id> (private folder of the company's Drive) or https://… (passed through). */
    url: string;
    sha256: string;
    sizeBytes: number | null;
    /** The updater's signature of the installer (the .sig file); null = not installable by Tauri. */
    signature: string | null;
    notes: string | null;
    publishedAt: string;
    mandatory: boolean;
}

/**
 * Tauri's «dynamic server» answer (v2 updater). The updater reads version, notes, pub_date, url and
 * signature; the rest travels in update.rawJson for the app's own screen.
 */
export interface UpdaterManifest {
    version: string;
    notes: string;
    pub_date: string;
    url: string;
    signature: string;
    sha256: string;
    tamano_bytes: number | null;
    obligatoria: boolean;
    /** Headers the app sends with the download (the Drive token); empty for a public link. */
    descarga_headers: Record<string, string>;
}

/** Where and how the app downloads one installer. */
export interface DownloadLink {
    url: string;
    headers: Record<string, string>;
}
