import type { Result } from 'neverthrow';
import type { SourceError } from '../../../../shared/errors.ts';
import type { Release, UpdateQuery } from '../../domain/entities/Release.ts';

export interface ReleasePort {
    /** buscar_actualizacion(): notes that the PC asked, and the newer release or null. */
    findUpdate(query: UpdateQuery): Promise<Result<Release | null, SourceError>>;
}

export interface DownloadSigner {
    /** A link the app can download from: gs:// becomes a short-lived signed https link; https:// stays. */
    downloadUrl(url: string): Result<string, SourceError>;
}
