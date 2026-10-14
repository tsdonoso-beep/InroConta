// The full Consulta RUC ficha of one RUC (padron_ruc), asked when it is opened.
import { getFicha } from '../../../../modules/ruc/composition.ts';
import { answer } from '../../../_lib/api.ts';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ ruc: string }> }) {
    const { ruc } = await params;
    return answer('/api/ruc/ficha', () => getFicha(ruc));
}
