import type { Result } from 'neverthrow';
import type { ComprobantesError } from '../../domain/errors.ts';
import type { SalesTaxMonth, SalesTaxPort } from '../ports/SalesTaxPort.ts';

/** The sales and IGV check by month, kept `maxAgeMs` in memory like the documents. */
export class GetSalesTax {
    private cached: { at: number; months: Promise<Result<SalesTaxMonth[], ComprobantesError>> } | null = null;

    constructor(
        private readonly port: SalesTaxPort,
        private readonly companyRuc: string,
        private readonly maxAgeMs: number,
    ) {}

    execute(): Promise<Result<SalesTaxMonth[], ComprobantesError>> {
        if (!this.cached || Date.now() - this.cached.at > this.maxAgeMs) {
            const months = this.port.readMonths(this.companyRuc).then((r) => {
                if (r.isErr()) this.cached = null;
                return r;
            });
            this.cached = { at: Date.now(), months };
        }
        return this.cached.months;
    }
}
