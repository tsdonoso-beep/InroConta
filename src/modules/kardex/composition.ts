// Composition root of the KARDEX context: the Almacén kardex per month and its changes after closing.
import 'server-only';
import { memoResult } from '../../shared/cache/memo.ts';
import { COMPANY_RUC } from '../../shared/config/company.ts';
import { KARDEX_DAYS } from './domain/entities/Kardex.ts';
import { SupabaseKardexAdapter } from './infrastructure/SupabaseKardexAdapter.ts';

const TEN_MINUTES = 10 * 60 * 1000;
const port = new SupabaseKardexAdapter();

export const getKardex = memoResult(() => port.read(COMPANY_RUC, KARDEX_DAYS), TEN_MINUTES);
