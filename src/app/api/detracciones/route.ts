// The SPOT proofs and the invoices with detraction without one (Detracciones).
import { getDetractions } from '../../../modules/detracciones/composition.ts';
import { answer } from '../../_lib/api.ts';

export const dynamic = 'force-dynamic';

export const GET = () => answer('/api/detracciones', () => getDetractions());
