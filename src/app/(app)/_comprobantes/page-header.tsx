'use client';

// The title of a SUNAT section (code: drawn at once) and where its data comes from (a gap until
// the documents arrive). The error of the first read is shown here, in words, instead of zeros.
import { monthsOf } from '../../../modules/comprobantes/application/views.ts';
import { monthLabel, thousands } from '../../../shared/ui/format.ts';
import { Hueco } from '../../../shared/ui/hueco.tsx';
import { useDocs } from './docs-store.ts';

export function PageHeader({ title }: { title: string }) {
    const { snapshot, error } = useDocs();
    const months = snapshot ? monthsOf(snapshot.docs) : [];
    return (
        <>
            {/* pr-12: the top right corner belongs to the user's photo (UserMenu, in the layout). */}
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3 pr-12">
                <h1 className="text-[21px] font-extrabold">{title}</h1>
                <span className="text-xs text-ink-3">
                    {snapshot ? (
                        <>
                            {thousands(snapshot.docs.length)} comprobantes ·{' '}
                            {months.length ? `${monthLabel(months[0])} a ${monthLabel(months[months.length - 1])}` : 'sin meses'}
                        </>
                    ) : (
                        !error && <Hueco className="h-3 w-80" />
                    )}
                </span>
            </div>
            {error && (
                <p className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-[13px] text-danger-strong">
                    No se pudieron leer los comprobantes de la base: {error} El detalle está en el log del servidor.
                </p>
            )}
        </>
    );
}
