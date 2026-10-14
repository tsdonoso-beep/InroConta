import { err, ok, type Result } from 'neverthrow';
import type { FilaDetalleCpe } from '../../../../shared/lib/export/items-sunat.ts';
import type { DocsSnapshot } from '../../domain/entities/Doc.ts';
import type { ComprobantesError } from '../../domain/errors.ts';
import { documentLines, indexLines, lineKey, type DocumentLines } from '../../domain/policies/document-lines.ts';
import { documentsFromLines } from '../../domain/policies/documents-from-lines.ts';
import { productsFromLines, type ProductList } from '../../domain/policies/products.ts';
import type { DetailLinesPort } from '../ports/DetailLinesPort.ts';

/** One read of the book: the documents, and the lines behind them for Precios and Buscar factura. */
interface Book {
    snapshot: DocsSnapshot;
    byDocument: Map<string, FilaDetalleCpe[]>;
    lines: FilaDetalleCpe[];
    products?: ProductList & { readAt: string };
}

/**
 * The documents, kept in this server instance's memory for `maxAgeMs` (the book changes a few
 * times a day, when the robots publish). Concurrent requests share one read; a failed read is
 * not kept, so the next request tries again. The products are computed from the same read, the
 * first time someone asks for them.
 */
export class GetDocuments {
    private cached: { at: number; book: Promise<Result<Book, ComprobantesError>> } | null = null;

    constructor(
        private readonly lines: DetailLinesPort,
        private readonly maxAgeMs: number,
    ) {}

    async execute(fresh = false): Promise<Result<DocsSnapshot, ComprobantesError>> {
        return (await this.book(fresh)).map((b) => b.snapshot);
    }

    async products(): Promise<Result<ProductList & { readAt: string }, ComprobantesError>> {
        return (await this.book()).map((b) => (b.products ??= { ...productsFromLines(b.lines), readAt: b.snapshot.readAt }));
    }

    async linesOf(ruc: string, series: string, number: string): Promise<Result<DocumentLines, ComprobantesError>> {
        const book = await this.book();
        if (book.isErr()) return err(book.error);
        const rows = book.value.byDocument.get(lineKey(ruc, series, number));
        return rows?.length ? ok(documentLines(rows)) : err({ kind: 'source-missing', message: 'No se encontró el comprobante en la hoja.' });
    }

    private book(fresh = false): Promise<Result<Book, ComprobantesError>> {
        if (!this.cached || fresh || Date.now() - this.cached.at > this.maxAgeMs) {
            const book = this.read().then((r) => {
                if (r.isErr()) this.cached = null;
                return r;
            });
            this.cached = { at: Date.now(), book };
        }
        return this.cached.book;
    }

    private async read(): Promise<Result<Book, ComprobantesError>> {
        const lines = await this.lines.readLines();
        if (lines.isErr()) return err(lines.error);
        return ok({
            snapshot: { docs: documentsFromLines(lines.value), lines: lines.value.length, readAt: new Date().toISOString() },
            byDocument: indexLines(lines.value),
            lines: lines.value,
        });
    }
}
