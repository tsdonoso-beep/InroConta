import type { Result } from 'neverthrow';
import type { FilaDetalleCpe } from '../../../../shared/lib/export/items-sunat.ts';
import type { ComprobantesError } from '../../domain/errors.ts';

/**
 * Where the detail lines (one per item) come from. Today the DETALLE tab of the book
 * (SheetDetailLinesAdapter): the robots publish it from the base, already computed, and it
 * reads in ~7 s against ~93 s from the base by pages (measured 13/10/2026).
 */
export interface DetailLinesPort {
    readLines(): Promise<Result<FilaDetalleCpe[], ComprobantesError>>;
}
