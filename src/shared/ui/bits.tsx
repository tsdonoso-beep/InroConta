'use client';

// The pieces the sections share besides card and KPI: the labelled bar, the ring, the finder,
// «Ver más», the table classes, an empty line and a notice. Ports of filaBarra(), anillo(), the
// .tabla / .barra-filtros / .vacio styles of the Apps Script view.
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** The classes of a data table: header cell, cell, number cell, sub-line. */
export const T = {
    table: 'w-full text-[13.5px]',
    headRow: 'border-b border-control text-left',
    th: 'pb-2.5 pr-2.5 text-[11px] font-semibold tracking-[.05em] text-ink-3 uppercase',
    thNum: 'pb-2.5 pr-2.5 text-right text-[11px] font-semibold tracking-[.05em] text-ink-3 uppercase',
    row: 'border-b border-line',
    td: 'py-2.5 pr-2.5 align-top',
    tdNum: 'py-2.5 pr-2.5 text-right align-top whitespace-nowrap tabular-nums',
    sub: 'mt-0.5 text-[11.5px] text-ink-3',
};

/** The colours a bar can take: a role, never a loose hex. */
export const BAR = {
    primary: 'bg-primary',
    teal: 'bg-teal',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    muted: 'bg-ink-3',
} as const;
export type BarColor = keyof typeof BAR;

export function BarRow({
    label,
    figures,
    pct,
    color = 'primary',
    note,
    title,
    chosen = false,
    onClick,
}: {
    label: ReactNode;
    figures: ReactNode;
    pct: number;
    color?: BarColor;
    note?: string;
    title?: string;
    chosen?: boolean;
    onClick?: () => void;
}) {
    const body = (
        <>
            <div className="mb-[5px] flex items-baseline justify-between gap-2.5">
                <span className="truncate text-[13.5px] font-semibold">{label}</span>
                <span className="text-[12.5px] whitespace-nowrap text-ink-2">{figures}</span>
            </div>
            {note && <div className="-mt-0.5 mb-[5px] text-[11.5px] text-ink-3">{note}</div>}
            <div className="h-2 overflow-hidden rounded-md bg-surface-3">
                <span className={`block h-full rounded-md ${BAR[color]}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
            </div>
        </>
    );
    const cls = `-mx-1.5 mb-[11px] block w-[calc(100%+12px)] rounded-lg px-1.5 py-1 text-left ${chosen ? 'bg-primary-soft' : 'hover:bg-surface-2'}`;
    return onClick ? (
        <button type="button" title={title} onClick={onClick} className={cls}>
            {body}
        </button>
    ) : (
        <div title={title} className={cls}>
            {body}
        </div>
    );
}

const RING = { primary: 'stroke-primary', teal: 'stroke-teal', success: 'stroke-success', warning: 'stroke-warning', danger: 'stroke-danger' } as const;

/** A percentage as a ring, with the figure inside; `children` go to its right. */
export function Ring({ pct, color = 'primary', children }: { pct: number; color?: keyof typeof RING; children?: ReactNode }) {
    const r = 24,
        c = 2 * Math.PI * r;
    return (
        <div className="flex items-center gap-3.5">
            <svg width="62" height="62" viewBox="0 0 62 62" className="flex-none">
                <circle cx="31" cy="31" r={r} fill="none" className="stroke-surface-3" strokeWidth="8" />
                <circle
                    cx="31"
                    cy="31"
                    r={r}
                    fill="none"
                    className={RING[color]}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${(c * pct) / 100} ${c}`}
                    transform="rotate(-90 31 31)"
                />
                <text x="31" y="35.5" textAnchor="middle" fontSize="13" fontWeight="800" className="fill-ink">
                    {pct}%
                </text>
            </svg>
            {children && <div className="min-w-0 text-xs text-ink-2">{children}</div>}
        </div>
    );
}

/** The look of every form control: search box, select, period picker. */
export const CONTROL =
    'rounded-[9px] border border-control bg-surface px-2.5 py-2 text-[13.5px] outline-none focus:border-primary disabled:bg-disabled disabled:text-disabled-ink';

/** A search box that tells its value `delay` ms after the last key (the old view's 150 ms). */
export function SearchBox({
    value,
    onChange,
    placeholder,
    delay = 150,
    className = '',
    inputMode,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    delay?: number;
    className?: string;
    inputMode?: 'numeric' | 'text';
}) {
    const [text, setText] = useState(value);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => setText(value), [value]);
    useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
    return (
        <input
            type="search"
            value={text}
            inputMode={inputMode}
            placeholder={placeholder}
            onChange={(e) => {
                const v = e.target.value;
                setText(v);
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => onChange(v), delay);
            }}
            className={`${CONTROL} min-w-[220px] flex-1 ${className}`}
        />
    );
}

/** A select with the filter bar's look. */
export function Select({
    value,
    onChange,
    children,
    label,
    title,
}: {
    value: string;
    onChange: (v: string) => void;
    children: ReactNode;
    label: string;
    title?: string;
}) {
    return (
        <select aria-label={label} title={title} value={value} onChange={(e) => onChange(e.target.value)} className={CONTROL}>
            {children}
        </select>
    );
}

export const FilterRow = ({ children }: { children: ReactNode }) => <div className="mb-3.5 flex flex-wrap items-center gap-2.5">{children}</div>;

export function TextButton({ children, onClick, className = '' }: { children: ReactNode; onClick: () => void; className?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded px-1 py-1.5 text-[12.5px] font-semibold text-primary hover:text-primary-strong active:text-primary-active focus-visible:outline-2 focus-visible:outline-primary ${className}`}
        >
            {children}
        </button>
    );
}

/** «Ver más» under a list cut at `shown` of `total`. */
export function MoreButton({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
    if (total <= shown) return null;
    return (
        <TextButton onClick={onMore} className="mt-2.5">
            Ver más ({total - shown} más)
        </TextButton>
    );
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="py-2 text-[13px] text-ink-3">{children}</p>;

const NOTICE = {
    danger: 'bg-danger-soft text-danger-strong',
    warning: 'bg-warning-soft text-warning-strong',
    info: 'bg-primary-soft text-primary-strong',
};
export function Notice({ tone = 'danger', children }: { tone?: keyof typeof NOTICE; children: ReactNode }) {
    return <div className={`mb-4 rounded-xl px-4 py-3 text-[13px] ${NOTICE[tone]}`}>{children}</div>;
}

/** The title of a section that does not use the SUNAT filters. */
export function SectionTitle({ title }: { title: string }) {
    // pr-12: the top right corner belongs to the user's photo (UserMenu, in the layout).
    return <h1 className="mb-4 pr-12 text-[21px] font-extrabold">{title}</h1>;
}
