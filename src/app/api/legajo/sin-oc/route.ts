// The SUNAT invoices that look like they lack an OC (Facturas sin OC).
import { getNoOc } from '../../../../modules/legajo/composition.ts';
import { answer } from '../../../_lib/api.ts';

export const dynamic = 'force-dynamic';

export const GET = () => answer('/api/legajo/sin-oc', () => getNoOc());
