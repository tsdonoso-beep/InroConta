import type { Result } from 'neverthrow';
import type { SourceError } from '../../../../shared/errors.ts';
import type { KardexRead } from '../../domain/entities/Kardex.ts';

export interface KardexPort {
    read(companyRuc: string, days: number): Promise<Result<KardexRead, SourceError>>;
}
