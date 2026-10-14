// One product of the price finder: name and supplier, purchases, last price with its change,
// the price over time and the PDF of the last purchase. The row of pintarBuscador().
import type { PricedProduct } from '../../../modules/comprobantes/application/views.ts';
import { driveFile, money, monthLabel } from '../../../shared/ui/format.ts';
import { PriceLine } from './price-line.tsx';

/** Five columns on a wide screen; on a phone only name, last price and PDF (as the old view). */
export const ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3.5 gap-y-1.5 px-1.5 md:grid-cols-[minmax(0,2.2fr)_1fr_1.1fr_130px_92px]';
const HIDE_ON_PHONE = 'hidden md:block';

export function ProductRow({ p }: { p: PricedProduct }) {
    const s = p.prices,
        last = s[s.length - 1];
    return (
        <div className={`${ROW_GRID} items-center border-t border-line py-3 first:border-t-0 hover:bg-surface-2`}>
            <div className="col-span-full md:col-span-1">
                <div className="line-clamp-2 font-semibold" title={p.description}>
                    {p.description}
                </div>
                <div className="truncate text-xs text-ink-3">{(p.unit ? `${p.unit} · ` : '') + (p.supplier || p.ruc)}</div>
            </div>
            <div className={`${HIDE_ON_PHONE} text-[13px] tabular-nums`}>
                {p.times} {p.times === 1 ? 'vez' : 'veces'}
                <small className="block text-[11.5px] text-ink-3">
                    {s.length} {s.length === 1 ? 'mes' : 'meses'} · {money(p.spent, p.currency, true)}
                </small>
            </div>
            <div className="text-[13px] tabular-nums">
                {last && (
                    <>
                        <b>{money(last[1], p.currency)}</b>
                        <small className="block text-[11.5px] text-ink-3">{monthLabel(last[0])}</small>
                    </>
                )}
                {p.change !== null && (
                    <div className={`text-xs font-bold ${p.change > 0.5 ? 'text-danger' : p.change < -0.5 ? 'text-success-strong' : 'text-ink-3'}`}>
                        {p.change > 0 ? '+' : ''}
                        {p.change}% desde {monthLabel(s[0][0])}
                    </div>
                )}
            </div>
            <div className={HIDE_ON_PHONE}>
                <PriceLine prices={s} />
            </div>
            <div>
                {p.pdf && (
                    <a className="text-[12.5px] font-semibold whitespace-nowrap no-underline" href={driveFile(p.pdf)} target="_blank" rel="noopener">
                        Ver PDF ↗
                    </a>
                )}
            </div>
        </div>
    );
}
