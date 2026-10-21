import type { Result } from 'neverthrow';
import type { SourceError } from '../../../../shared/errors.ts';
import type { Retentions } from '../../domain/entities/Retention.ts';

export interface RetentionsPort {
    read(companyRuc: string): Promise<Result<Retentions, SourceError>>;
}
