// The charts of Detracciones: deposits by month of payment (purchases teal, sales primary,
// stacked), by case, by delay, by counterpart and by goods code. Ports of pintarDetrMeses(),
// pintarDetrCasos(), pintarDetrPlazo(), pintarDetrTop() and pintarDetrCodigos().
import {
    byCase,
    byGoods,
    caseOf,
    paymentDelay,
    topCounterparts,
    type DetractionFilters,
    type PaymentMonth,
    type Proof,
} from '../../../modules/detracciones/application/views.ts';
import { BarRow, Empty } from '../../../shared/ui/bits.tsx';
import { monthLabel, thousands } from '../../../shared/ui/format.ts';
import { Hueco } from '../../../shared/ui/hueco.tsx';
import { shortSoles, soles } from './labels.tsx';

const NONE = <Empty>Sin constancias con este filtro.</Empty>;

/** `month`: the chosen month of payment ('' none); a click picks it, a second one lets it go. */
export function PaymentBars({ months, month, onPick }: { months: PaymentMonth[]; month: string; onPick: (m: string) => void }) {
    if (!months.length) return NONE;
    const max = Math.max(...months.map((m) => m.purchases + m.sales), 1);
    return (
        <div className="flex h-[210px] items-end gap-2.5 overflow-x-auto pt-1.5">
            {months.map((m) => {
                const t = m.purchases + m.sales;
                const title =
                    `${monthLabel(m.month)}: ${soles(t)} · ${m.count} constancias` +
                    (m.purchases && m.sales ? ` (compras ${soles(m.purchases)}, ventas ${soles(m.sales)})` : '') +
                    (m.atypical ? ` · ${m.atypical} atípicas` : '');
                return (
                    <button
                        key={m.month}
                        type="button"
                        onClick={() => onPick(month === m.month ? '' : m.month)}
                        title={title}
                        className={`group flex h-full flex-[1_0_46px] flex-col items-center justify-end gap-1.5 ${month && month !== m.month ? 'opacity-30' : ''}`}
                    >
                        <span className="text-[11.5px] font-bold whitespace-nowrap text-ink-2">{shortSoles(t)}</span>
                        <span
                            className="flex w-[70%] max-w-[46px] flex-col overflow-hidden rounded-t-[7px] rounded-b-[3px] group-hover:opacity-80"
                            style={{ height: Math.max(3, (t / max) * 150) }}
                        >
                            {m.purchases > 0 && <span className="block bg-teal" style={{ flex: m.purchases }} />}
                            {m.sales > 0 && <span className="block bg-primary" style={{ flex: m.sales }} />}
                        </span>
                        <span className={`text-xs whitespace-nowrap ${month === m.month ? 'font-bold text-ink' : 'text-ink-2'}`}>{monthLabel(m.month)}</span>
                    </button>
                );
            })}
        </div>
    );
}

const Swatch = ({ className }: { className: string }) => <i className={`mr-1.5 inline-block size-2.5 rounded-[3px] align-[-1px] ${className}`} />;

export function PaymentLegend({ direction }: { direction: DetractionFilters['direction'] }) {
    return (
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-2">
            {direction === '' ? (
                <>
                    <span>
                        <Swatch className="bg-teal" />
                        Compras (pagamos al proveedor)
                    </span>
                    <span>
                        <Swatch className="bg-primary" />
                        Ventas (nos depositó el cliente)
                    </span>
                </>
            ) : (
                <span>
                    <Swatch className={direction === 'venta' ? 'bg-primary' : 'bg-teal'} />
                    {direction === 'venta'
                        ? 'Ventas: lo que depositaron los clientes en nuestra cuenta'
                        : 'Compras: lo que depositamos en la cuenta del proveedor'}
                </span>
            )}
        </div>
    );
}

export function CaseBars({ proofs, chosen, onPick }: { proofs: Proof[]; chosen: string; onPick: (c: string) => void }) {
    const cases = byCase(proofs);
    if (!cases.length) return NONE;
    const max = Math.max(...cases.map((c) => c.count), 1);
    return cases.map((c) => {
        const info = caseOf(c.name);
        return (
            <BarRow
                key={c.name}
                label={c.name}
                figures={
                    <>
                        <b>{thousands(c.count)}</b> · {soles(c.amount)}
                    </>
                }
                pct={(100 * c.count) / max}
                color={info.color}
                note={info.description || undefined}
                title={info.description}
                chosen={chosen === c.name}
                onClick={() => onPick(chosen === c.name ? '' : c.name)}
            />
        );
    });
}

export function DelayBars({ proofs }: { proofs: Proof[] }) {
    const buckets = paymentDelay(proofs);
    if (!buckets.length) return NONE;
    return (
        <>
            {buckets.map((b) => (
                <BarRow
                    key={b.label}
                    label={b.label}
                    figures={
                        <>
                            <b>{thousands(b.count)}</b> · {b.pct}%
                        </>
                    }
                    pct={b.pct}
                    color={b.color}
                />
            ))}
            <p className="mt-1 text-xs text-ink-3">
                El depósito vence hasta el 5.° día hábil del mes siguiente a la anotación de la factura en el Registro de Compras.
            </p>
        </>
    );
}

export function TopBars({ proofs }: { proofs: Proof[] }) {
    const top = topCounterparts(proofs);
    if (!top.length) return NONE;
    const max = top[0].amount || 1;
    return top.map((t) => (
        <BarRow
            key={t.id}
            label={t.name}
            figures={
                <>
                    <b>{shortSoles(t.amount)}</b> · {t.pct}%
                </>
            }
            pct={(100 * t.amount) / max}
            color="teal"
            title={`${t.id} · ${t.count} constancias`}
        />
    ));
}

export function GoodsBars({ proofs }: { proofs: Proof[] }) {
    const goods = byGoods(proofs);
    if (!goods.length) return NONE;
    const max = goods[0].amount || 1;
    return goods.map((g) => (
        <BarRow
            key={g.label}
            label={g.label}
            figures={
                <>
                    <b>{shortSoles(g.amount)}</b> · {thousands(g.count)}
                </>
            }
            pct={(100 * g.amount) / max}
            color="primary"
            title={g.label}
        />
    ));
}

/** A bar list while the proofs travel: `rows` labelled bars as gaps. */
export function BarsGap({ rows = 4 }: { rows?: number }) {
    return Array.from({ length: rows }, (_, i) => (
        <div key={i} className="mb-[11px] py-1">
            <div className="mb-[5px] flex justify-between gap-2.5">
                <Hueco className="h-4 w-36" />
                <Hueco className="h-4 w-20" />
            </div>
            <Hueco className="h-2 w-full" />
        </div>
    ));
}
