// The SUNAT card of every RUC we deal with and the SSCO list (Consulta RUC, Buscar factura,
// Proveedores and the SSCO warning of Resumen).
import { getRucLists } from '../../../modules/ruc/composition.ts';
import { answer } from '../../_lib/api.ts';

export const dynamic = 'force-dynamic';

export const GET = () => answer('/api/ruc', () => getRucLists());
