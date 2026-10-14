// The small pieces the opened folder's panels share: a labelled value, a titled list, a Drive link.
import type { ReactNode } from 'react';

export const LINK = { target: '_blank', rel: 'noopener', className: 'text-primary hover:underline' } as const;

/** A labelled value of the info grid; nothing when the value is empty. */
export function Datum({ label, value }: { label: string; value: ReactNode }) {
    if (!value) return null;
    return (
        <div>
            <span className="mb-0.5 block text-[11px] font-bold tracking-[.05em] text-ink-3 uppercase">{label}</span>
            {value}
        </div>
    );
}

/** A titled list under the grid. */
export function DetailList({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="mt-3 text-[12.5px]">
            <b className="mb-1 block text-[11px] tracking-[.05em] text-ink-3 uppercase">{title}</b>
            {children}
        </div>
    );
}
