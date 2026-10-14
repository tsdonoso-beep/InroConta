import 'server-only';
import { err, ok, type Result } from 'neverthrow';
import type { FilaDetalleCpe } from '../../../shared/lib/export/items-sunat.ts';
import { readTabRaw } from '../../../shared/google/sheets.ts';
import type { DetailLinesPort } from '../application/ports/DetailLinesPort.ts';
import { sourceFailed, type ComprobantesError } from '../domain/errors.ts';
import { detailFromSheet } from './detail-sheet.ts';

/** The detail lines from the DETALLE tab of the INROCONTA book (what the robots publish). */
export class SheetDetailLinesAdapter implements DetailLinesPort {
    constructor(
        private readonly bookId: string,
        private readonly tab: string,
    ) {}

    async readLines(): Promise<Result<FilaDetalleCpe[], ComprobantesError>> {
        try {
            const values = await readTabRaw(this.bookId, this.tab);
            if (!values) return err({ kind: 'source-missing', message: `El libro INROCONTA no tiene la pestaña «${this.tab}».` });
            return ok(detailFromSheet(values));
        } catch (e) {
            console.error('[comprobantes] reading the detail tab failed', e);
            if (e instanceof Error && /no trae las columnas/.test(e.message)) return err({ kind: 'source-shape', message: e.message });
            return err(sourceFailed(e));
        }
    }
}
