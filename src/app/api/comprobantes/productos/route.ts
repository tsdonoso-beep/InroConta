// Everything bought, with its price month by month (Precios), from the same read of the book as
// the documents: once per tab, the finder filters in the browser.
import { getProducts } from '../../../../modules/comprobantes/composition.ts';
import { answer } from '../../../_lib/api.ts';

export const dynamic = 'force-dynamic';

export const GET = () => answer('/api/comprobantes/productos', getProducts);
