// Composition root of the RETENCIONES context: the CRE INROPRIN issued and the invoices they cover.
import 'server-only';
import { memoResult } from '../../shared/cache/memo.ts';
import { COMPANY_RUC } from '../../shared/config/company.ts';
import { SupabaseRetentionsAdapter } from './infrastructure/SupabaseRetentionsAdapter.ts';

const TEN_MINUTES = 10 * 60 * 1000;
const port = new SupabaseRetentionsAdapter();

export const getRetentions = memoResult(() => port.read(COMPANY_RUC), TEN_MINUTES);
