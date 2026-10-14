// One OC folder opened in Legajo por OC (detalle_de_carpeta), by its Drive id.
import { getFolder } from '../../../../../modules/legajo/composition.ts';
import { answer } from '../../../../_lib/api.ts';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return answer('/api/legajo/carpeta', () => getFolder(id));
}
