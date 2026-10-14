// Composition root of the RUC context: the cards of every RUC we deal with, the SSCO list and the
// full ficha of one RUC (Consulta RUC, and the supplier card of Buscar factura).
import 'server-only';
import { err, ok } from 'neverthrow';
import { memoByKey, memoResult } from '../../shared/cache/memo.ts';
import { isRuc } from './domain/entities/Taxpayer.ts';
import { SupabaseRucAdapter } from './infrastructure/SupabaseRucAdapter.ts';

const THIRTY_MINUTES = 30 * 60 * 1000;
const port = new SupabaseRucAdapter();

export const getRucLists = memoResult(() => port.readLists(), THIRTY_MINUTES);

/** { ficha: null } when the padrón robot never read that RUC (not an error: the screen says so). */
export const getFicha = memoByKey(async (ruc: string) => {
    if (!isRuc(ruc)) return err({ kind: 'not-found' as const, message: `RUC inválido: ${ruc}` });
    const r = await port.readFicha(ruc);
    return r.isErr() ? err(r.error) : ok({ ficha: r.value });
}, THIRTY_MINUTES);
