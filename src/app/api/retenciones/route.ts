// The CRE INROPRIN issued with the invoices they cover (Retenciones).
import { getRetentions } from '../../../modules/retenciones/composition.ts';
import { answer } from '../../_lib/api.ts';

export const dynamic = 'force-dynamic';

export const GET = () => answer('/api/retenciones', () => getRetentions());
