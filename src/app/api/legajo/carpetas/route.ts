// The OC folders and when Compras, COMEX and Almacén were read (Legajo por OC).
import { getFolders } from '../../../../modules/legajo/composition.ts';
import { answer } from '../../../_lib/api.ts';

export const dynamic = 'force-dynamic';

export const GET = () => answer('/api/legajo/carpetas', () => getFolders());
