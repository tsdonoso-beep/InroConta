import type { Result } from 'neverthrow';
import type { SourceError } from '../../../../shared/errors.ts';
import type { RucLists, SunatFicha } from '../../domain/entities/Taxpayer.ts';

export interface RucPort {
    readLists(): Promise<Result<RucLists, SourceError>>;
    /** null when the padrón robot never read that RUC. */
    readFicha(ruc: string): Promise<Result<SunatFicha | null, SourceError>>;
}
