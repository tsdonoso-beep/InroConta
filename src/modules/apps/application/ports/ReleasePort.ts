import type { Result } from 'neverthrow';
import type { SourceError } from '../../../../shared/errors.ts';
import type { DownloadLink, Release, UpdateQuery } from '../../domain/entities/Release.ts';

export interface ReleasePort {
    /** buscar_actualizacion(): notes that the PC asked, and the newer release or null. */
    findUpdate(query: UpdateQuery): Promise<Result<Release | null, SourceError>>;
}

export interface DownloadLinker {
    /** How the app downloads the installer: gdrive://<id> becomes the Drive link plus a short-lived token. */
    link(url: string): Promise<Result<DownloadLink, SourceError>>;
}
