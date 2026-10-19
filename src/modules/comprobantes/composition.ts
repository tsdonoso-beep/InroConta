// Composition root of the COMPROBANTES context: the SUNAT documents of the book (Resumen,
// Impuestos, and the sections still to come) and the sales check by month. The only file that
// knows which adapter serves each port; the app (src/app) calls the functions below on the
// server, and uses application/views.ts for everything that also runs in the browser.
import 'server-only';
import { COMPANY_RUC } from '../../shared/config/company.ts';
import { GetDocuments } from './application/use-cases/GetDocuments.ts';
import { GetSalesTax } from './application/use-cases/GetSalesTax.ts';
import { SupabaseDetailLinesAdapter } from './infrastructure/SupabaseDetailLinesAdapter.ts';
import { SupabaseSalesTaxAdapter } from './infrastructure/SupabaseSalesTaxAdapter.ts';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// From the base, not from the tab: the tab is a copy for Contabilidad and lacks the documents without XML.
const documents = new GetDocuments(new SupabaseDetailLinesAdapter(COMPANY_RUC), FIFTEEN_MINUTES);
const salesTax = new GetSalesTax(new SupabaseSalesTaxAdapter(), COMPANY_RUC, FIFTEEN_MINUTES);

export const getDocuments = (fresh = false) => documents.execute(fresh);
/** Everything bought, with its price month by month (Precios). */
export const getProducts = () => documents.products();
/** The lines of one document (Buscar factura). */
export const getDocumentLines = (ruc: string, series: string, number: string) => documents.linesOf(ruc, series, number);
export const getSalesTax = () => salesTax.execute();
