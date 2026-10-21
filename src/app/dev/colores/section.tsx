// The frame every block of /dev/colores shares: a title, why it is the way it is, and the samples.
import type { ReactNode } from 'react';
import { CARD } from '../../../shared/ui/card.tsx';

export function Section({ title, blurb, children }: { title: string; blurb: ReactNode; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
                <h2 className="text-[17px] font-extrabold">{title}</h2>
                <p className="max-w-3xl text-[13px] text-ink-2">{blurb}</p>
            </div>
            {children}
        </section>
    );
}

export const LIST = `flex flex-col divide-y divide-line ${CARD}`;
export const CODE = 'shrink-0 text-xs text-ink-2 select-all';
