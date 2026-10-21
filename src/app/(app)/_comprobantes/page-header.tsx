'use client';

// The title of a SUNAT section (code: drawn at once). The error of the first read of the documents
// is shown here, in words, instead of zeros.
import { useDocs } from './docs-store.ts';

export function PageHeader({ title }: { title: string }) {
    const { error } = useDocs();
    return (
        <>
            {/* pr-12: the top right corner belongs to the user's photo (UserMenu, in the layout). */}
            <h1 className="mb-4 pr-12 text-[21px] font-extrabold">{title}</h1>
            {error && (
                <p className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-[13px] text-danger-strong">
                    No se pudieron leer los comprobantes de la base: {error} El detalle está en el log del servidor.
                </p>
            )}
        </>
    );
}
