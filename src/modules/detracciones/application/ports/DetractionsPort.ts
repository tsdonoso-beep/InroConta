import type { Result } from 'neverthrow';
import type { SourceError } from '../../../../shared/errors.ts';
import type { Detractions } from '../../domain/entities/Proof.ts';

export interface DetractionsPort {
    read(companyRuc: string, since: string): Promise<Result<Detractions, SourceError>>;
}
