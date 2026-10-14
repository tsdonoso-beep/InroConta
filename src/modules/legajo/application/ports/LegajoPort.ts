import type { Result } from 'neverthrow';
import type { SourceError } from '../../../../shared/errors.ts';
import type { ChangesRead, FoldersRead, NoOcRead } from '../../domain/entities/Folder.ts';
import type { FolderDetail } from '../../domain/entities/FolderDetail.ts';

/** Where the folders come from: the base (SupabaseLegajoAdapter). */
export interface LegajoPort {
    readFolders(companyRuc: string): Promise<Result<FoldersRead, SourceError>>;
    readNoOc(companyRuc: string): Promise<Result<NoOcRead, SourceError>>;
    readChanges(companyRuc: string): Promise<Result<ChangesRead, SourceError>>;
    /** null when the base has no folder with that Drive id. */
    readFolder(companyRuc: string, folderId: string): Promise<Result<FolderDetail | null, SourceError>>;
}
