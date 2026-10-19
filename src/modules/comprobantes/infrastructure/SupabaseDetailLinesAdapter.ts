// The detail lines from the v2 base (supabase-primero): every document, with XML or not. Before,
// the app read the DETALLE tab of the book, which only had the documents with XML
// (tests/data/facturas.test.mts still checks that tab against the base).
import 'server-only';
import { err, ok, type Result } from 'neverthrow';
import { detailLinesFromV2 } from '../../../shared/lib/export/detail-v2.ts';
import { readDetailSource } from '../../../shared/lib/export/detail-v2-read.ts';
import type { FilaDetalleCpe } from '../../../shared/lib/export/items-sunat.ts';
import { serviceClient } from '../../../shared/supabase/service.ts';
import type { DetailLinesPort } from '../application/ports/DetailLinesPort.ts';
import { sourceFailed, type ComprobantesError } from '../domain/errors.ts';

export class SupabaseDetailLinesAdapter implements DetailLinesPort {
    private readonly companyRuc: string;
    constructor(companyRuc: string) {
        this.companyRuc = companyRuc;
    }

    async readLines(): Promise<Result<FilaDetalleCpe[], ComprobantesError>> {
        try {
            return ok(detailLinesFromV2(await readDetailSource(serviceClient(), this.companyRuc)));
        } catch (e) {
            const p = e as { code?: string; message?: string };
            console.error('[comprobantes] reading the detail from v2 failed', { code: p.code, message: p.message });
            return err(sourceFailed(e));
        }
    }
}
