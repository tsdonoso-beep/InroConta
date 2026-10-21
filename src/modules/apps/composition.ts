// Composition root of the desktop apps context: «is there an update?» for Carga CONCAR and the
// other desktop apps (docs/database/v2/008_aplicaciones.sql). Public: the apps have no session.
import 'server-only';
import { checkUpdate, type UpdateOutcome, type UpdateRequest } from './application/checkUpdate.ts';
import { GcsDownloadSigner } from './infrastructure/GcsDownloadSigner.ts';
import { SupabaseReleaseAdapter } from './infrastructure/SupabaseReleaseAdapter.ts';

const port = new SupabaseReleaseAdapter();
const signer = new GcsDownloadSigner();

export type { UpdateOutcome, UpdateRequest };

export const findUpdate = (req: UpdateRequest): Promise<UpdateOutcome> => checkUpdate(port, signer, req);
