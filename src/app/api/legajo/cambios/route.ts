// The last 500 changes the robot saw in the folders (Cambios del robot).
import { getChanges } from '../../../../modules/legajo/composition.ts';
import { answer } from '../../../_lib/api.ts';

export const dynamic = 'force-dynamic';

export const GET = () => answer('/api/legajo/cambios', () => getChanges());
