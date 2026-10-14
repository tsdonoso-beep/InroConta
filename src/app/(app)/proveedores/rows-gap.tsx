// Rows of gaps where a list goes while the documents travel; nothing when their read failed
// (the page header says why, in words).
import { Hueco } from '../../../shared/ui/hueco.tsx';

export function RowsGap({ rows, failed }: { rows: number; failed: boolean }) {
    if (failed) return null;
    return (
        <div className="flex flex-col gap-3">
            {Array.from({ length: rows }, (_, i) => (
                <Hueco key={i} className="h-7 w-full" />
            ))}
        </div>
    );
}
