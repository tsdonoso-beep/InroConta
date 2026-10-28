// The Almacén kardex per month and the changes the robot saw after each month closed (Kardex).
import { getKardex } from '../../../modules/kardex/composition.ts';
import { answer } from '../../_lib/api.ts';

export const dynamic = 'force-dynamic';

export const GET = () => answer('/api/kardex', () => getKardex());
