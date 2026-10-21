// The basic pieces every page uses: card, KPI, chip and the segmented switch.
import type { ReactNode } from 'react';
import { Hueco } from './hueco.tsx';

/**
 * The one card of the app (his decision, 21/10/2026): the segmented switch's look — white, a single
 * thin control-grey border, no shadow, moderate corners. Every boxed surface takes it from here
 * (Card, Kpi, and any box written by hand: `className={CARD}`), so the look changes in one place.
 */
export const CARD = 'rounded-[12px] border border-control bg-surface';

export function Card({ title, note, children, className = '' }: { title?: ReactNode; note?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={`min-w-0 ${CARD} px-[22px] py-5 ${className}`}>
            {(title || note) && (
                <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-2.5">
                    {title && <h2 className="text-[15px] font-bold">{title}</h2>}
                    {note && <span className="text-xs text-ink-3">{note}</span>}
                </div>
            )}
            {children}
        </section>
    );
}

/**
 * `value` null = still travelling: the card, its label and its size are drawn, the number is a gap.
 * `risk`: something is wrong (to correct, missing, old). A red dot by the label says it; the card
 * and the number stay as every other (his pick among the sketches of /dev/colores, 21/10/2026:
 * the red border and the red-to-pink gradient were too loud). Not for a figure that only
 * subtracts, like credit notes: that is not an alert.
 */
export function Kpi({ label, value, children, risk = false }: { label: string; value: ReactNode | null; children?: ReactNode; risk?: boolean }) {
    return (
        <div className={`min-w-0 ${CARD} px-[18px] pt-4 pb-3.5`}>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-[.06em] text-ink-3 uppercase">
                {risk && <span aria-label="Hay algo que revisar" className="size-2 flex-none rounded-full bg-danger" />}
                {label}
            </div>
            <div className="truncate text-2xl leading-tight font-extrabold tracking-tight">{value === null ? <Hueco className="h-[26px] w-36" /> : value}</div>
            {value === null ? (
                <div className="mt-1.5">
                    <Hueco className="h-3.5 w-28" />
                </div>
            ) : (
                children
            )}
        </div>
    );
}

export const KpiNote = ({ children }: { children: ReactNode }) => <div className="mt-1.5 text-xs text-ink-2">{children}</div>;

const CHIP = {
    ok: 'bg-success-soft text-success-strong',
    warn: 'bg-warning-soft text-warning-strong',
    danger: 'bg-danger-soft text-danger-strong',
    info: 'bg-primary-soft text-primary-strong',
    muted: 'bg-surface-3 text-ink-2',
};
export function Chip({ tone, children, title }: { tone: keyof typeof CHIP; children: ReactNode; title?: string }) {
    return (
        <span title={title} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold whitespace-nowrap ${CHIP[tone]}`}>
            {children}
        </span>
    );
}

export function Segmented<T extends string>({
    options,
    value,
    onChange,
}: {
    options: { value: T; label: string; title?: string }[];
    value: T;
    onChange: (v: T) => void;
}) {
    return (
        <div className="inline-flex rounded-[9px] border border-control bg-surface p-[3px]">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    title={o.title}
                    onClick={() => onChange(o.value)}
                    className={`rounded-[7px] px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap ${o.value === value ? 'bg-ink text-on-fill' : 'text-ink-2 hover:bg-surface-2 hover:text-ink active:bg-surface-3'} focus-visible:outline-2 focus-visible:outline-primary`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}
