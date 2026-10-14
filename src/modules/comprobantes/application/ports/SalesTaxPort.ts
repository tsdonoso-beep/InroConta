import type { Result } from 'neverthrow';
import type { ComprobantesError } from '../../domain/errors.ts';

/** One month of the sales and IGV check, as the PDT 621 (migration 063), in soles. */
export interface SalesTaxMonth {
    periodo: string;
    n_ventas: number;
    base_ventas: number;
    igv_ventas: number;
    n_notas: number;
    base_notas: number;
    igv_notas: number;
    base_neta: number;
    igv_neto: number;
    no_gravado: number;
    n_anticipos: number;
    anticipos: number;
    cubiertas_por_anticipo: number;
    total_neto: number;
}

export interface SalesTaxPort {
    readMonths(companyRuc: string): Promise<Result<SalesTaxMonth[], ComprobantesError>>;
}
