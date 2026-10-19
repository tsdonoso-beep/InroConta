import type { Result } from 'neverthrow';
import type { ComprobantesError } from '../../domain/errors.ts';
import type { SalesTaxMonth } from '../../domain/policies/sales-tax.ts';

/** One month of the sales and IGV check, as the PDT 621, in soles (domain/policies/sales-tax.ts). */
export type { SalesTaxMonth };

export interface SalesTaxPort {
    readMonths(companyRuc: string): Promise<Result<SalesTaxMonth[], ComprobantesError>>;
}
