// Composition root of the LEGAJO context: the OC folders, the invoices without OC and the robot's
// changes (Legajo por OC, Facturas sin OC, Cambios del robot), each read on its own, and one folder
// opened. The robot reads the folders twice a day, so ten minutes in memory loses nothing.
import 'server-only';
import { err, ok } from 'neverthrow';
import { memoByKey, memoResult } from '../../shared/cache/memo.ts';
import { COMPANY_RUC } from '../../shared/config/company.ts';
import { SupabaseLegajoAdapter } from './infrastructure/SupabaseLegajoAdapter.ts';

const TEN_MINUTES = 10 * 60 * 1000;
const port = new SupabaseLegajoAdapter();

export const getFolders = memoResult(() => port.readFolders(COMPANY_RUC), TEN_MINUTES);
export const getNoOc = memoResult(() => port.readNoOc(COMPANY_RUC), TEN_MINUTES);
export const getChanges = memoResult(() => port.readChanges(COMPANY_RUC), TEN_MINUTES);

export const getFolder = memoByKey(async (folderId: string) => {
    if (!/^[\w-]{10,}$/.test(folderId)) return err({ kind: 'not-found' as const, message: 'Carpeta inválida.' });
    const r = await port.readFolder(COMPANY_RUC, folderId);
    if (r.isErr()) return err(r.error);
    return r.value ? ok(r.value) : err({ kind: 'not-found' as const, message: 'La base no tiene esa carpeta.' });
}, TEN_MINUTES);
