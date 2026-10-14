// Composition root of the DETRACCIONES context: the SPOT proofs and the invoices without one.
import 'server-only';
import { memoResult } from '../../shared/cache/memo.ts';
import { COMPANY_RUC } from '../../shared/config/company.ts';
import { SupabaseDetractionsAdapter } from './infrastructure/SupabaseDetractionsAdapter.ts';

/** Since when the invoices without proof are looked for (p_desde of migration 067). */
export const DETRACTIONS_SINCE = '202601';
const TEN_MINUTES = 10 * 60 * 1000;
const port = new SupabaseDetractionsAdapter();

export const getDetractions = memoResult(() => port.read(COMPANY_RUC, DETRACTIONS_SINCE), TEN_MINUTES);
