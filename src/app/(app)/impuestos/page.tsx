import { getSalesTax } from '../../../modules/comprobantes/composition.ts';
import { measure } from '../../_lib/perf.ts';
import { ImpuestosView, type SalesTaxResult } from './impuestos-view.tsx';

// The sales check is the only thing this page asks the server for, and it travels BEHIND: the
// promise goes to the client unawaited, so the screen paints at once and the check lands in the
// same response (GRAMA's «promise without waiting»). It never rejects: a failure is a value.
export default function ImpuestosPage() {
    const salesTax: Promise<SalesTaxResult> = measure('/impuestos', 'cuadre de ventas', getSalesTax()).then(
        (r) => (r.isOk() ? { months: r.value } : { error: r.error.message }),
        (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }),
    );
    return <ImpuestosView salesTax={salesTax} />;
}
