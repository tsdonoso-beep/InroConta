import type { Result } from 'neverthrow';
import type { FilaDetalleCpe } from '../../../../shared/lib/export/items-sunat.ts';
import type { ComprobantesError } from '../../domain/errors.ts';

/**
 * Where the detail lines (one per item) come from: the v2 base (SupabaseDetailLinesAdapter).
 * Until 19/10/2026 it was the DETALLE tab of the book, which lacked the documents without XML.
 */
export interface DetailLinesPort {
    readLines(): Promise<Result<FilaDetalleCpe[], ComprobantesError>>;
}
