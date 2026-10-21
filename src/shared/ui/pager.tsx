'use client';

// Pages of a list that is already in the browser: every screen's long list is cut the same way, so
// only one page of rows is ever drawn (drawing rows is what costs, not filtering them). `usePaged`
// keeps the page and goes back to the first one when `reset` changes (a new filter or order).
import { useState } from 'react';
import { CONTROL } from './bits.tsx';
import { thousands } from './format.ts';

export const PAGE_SIZE = 30;

export interface Paged<T> {
    rows: T[];
    page: number;
    pages: number;
    total: number;
    size: number;
    setPage: (p: number) => void;
}

export function usePaged<T>(list: T[], reset: unknown, size = PAGE_SIZE): Paged<T> {
    const [state, setState] = useState({ page: 1, reset });
    // Changing what is listed starts again on page 1 (set while rendering: no extra paint).
    if (state.reset !== reset) setState({ page: 1, reset });
    const pages = Math.max(1, Math.ceil(list.length / size));
    const page = Math.min(Math.max(1, state.reset === reset ? state.page : 1), pages);
    return {
        rows: list.slice((page - 1) * size, page * size),
        page,
        pages,
        total: list.length,
        size,
        setPage: (p) => setState({ page: p, reset }),
    };
}

// The five states of every button (normal, hover, pressed, keyboard focus, disabled grey) and the hand.
const BTN =
    'cursor-pointer rounded-lg border border-control bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors duration-100 hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled disabled:text-disabled-ink';

/** «1–30 de 128 · « ‹ Anterior · Página 1 de 5 · Siguiente › »»; nothing when it all fits in one page. */
export function Pager<T>({ paged, className = 'mt-3' }: { paged: Paged<T>; className?: string }) {
    const { page, pages, total, size, setPage } = paged;
    if (pages <= 1) return null;
    return (
        <div className={`flex flex-wrap items-center justify-between gap-2.5 text-[12.5px] text-ink-2 ${className}`}>
            <span className="tabular-nums">
                {thousands((page - 1) * size + 1)}–{thousands(Math.min(page * size, total))} de {thousands(total)}
            </span>
            <div className="flex items-center gap-1.5">
                <button type="button" className={BTN} disabled={page === 1} onClick={() => setPage(1)} aria-label="Primera página" title="Primera página">
                    «
                </button>
                <button type="button" className={BTN} disabled={page === 1} onClick={() => setPage(page - 1)}>
                    ‹ Anterior
                </button>
                <span className="px-1.5 tabular-nums">
                    Página {page} de {pages}
                </span>
                <button type="button" className={BTN} disabled={page === pages} onClick={() => setPage(page + 1)}>
                    Siguiente ›
                </button>
                <button type="button" className={BTN} disabled={page === pages} onClick={() => setPage(pages)} aria-label="Última página" title="Última página">
                    »
                </button>
            </div>
        </div>
    );
}

/** The «Ordenar por» select every list uses. */
export function SortSelect<S extends string>({ value, onChange, options }: { value: S; onChange: (v: S) => void; options: { value: S; label: string }[] }) {
    return (
        <label className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
            Ordenar por
            <select value={value} onChange={(e) => onChange(e.target.value as S)} className={`${CONTROL} cursor-pointer text-ink`}>
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        </label>
    );
}
