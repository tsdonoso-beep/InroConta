// The five states of every button variant, PAINTED BY HAND in one row each (GRAMA's sheet): a
// hover or a press cannot be photographed, and without seeing them side by side there is no way to
// judge whether the step from normal to hover reads. If this ever disagrees with
// shared/ui/button.tsx, button.tsx rules: this is the sheet, not the source.
import { CARD } from '../../../shared/ui/card.tsx';

const ring = 'outline-2 outline-offset-2 outline-primary';
const grey = 'bg-disabled text-disabled-ink';

const ROWS: { variant: string; states: string[] }[] = [
    {
        variant: 'primary',
        states: ['bg-primary text-on-fill', 'bg-primary-hover text-on-fill', 'bg-primary-active text-on-fill', `bg-primary text-on-fill ${ring}`, grey],
    },
    {
        variant: 'secondary',
        states: [
            'border border-control bg-surface text-ink',
            'border border-control bg-surface-2 text-ink',
            'border border-control bg-surface-3 text-ink',
            `border border-control bg-surface text-ink ${ring}`,
            `border border-disabled ${grey}`,
        ],
    },
    // No box at rest: disabled dims the ink and leaves the background alone (a grey box would draw
    // a shape the button does not have).
    { variant: 'ghost', states: ['text-ink-2', 'bg-surface-2 text-ink', 'bg-surface-3 text-ink', `text-ink-2 ${ring}`, 'text-disabled-ink'] },
    { variant: 'dark', states: ['bg-ink text-on-fill', 'bg-ink-hover text-on-fill', 'bg-ink-active text-on-fill', `bg-ink text-on-fill ${ring}`, grey] },
    {
        variant: 'danger',
        states: ['bg-danger text-on-fill', 'bg-danger-hover text-on-fill', 'bg-danger-active text-on-fill', `bg-danger text-on-fill ${ring}`, grey],
    },
    { variant: 'enlace', states: ['text-primary', 'text-primary underline', 'text-primary-active underline', `text-primary ${ring}`, 'text-disabled-ink'] },
];

const HEADS = ['normal', 'encima (hover)', 'pulsado', 'foco (teclado)', 'deshabilitado'];

export function ButtonStates() {
    return (
        <div className={`overflow-x-auto ${CARD}`}>
            <table className="w-full min-w-[40rem] text-[13px]">
                <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-3">
                        <th className="px-3 py-2 font-semibold">variante</th>
                        {HEADS.map((h) => (
                            <th key={h} className="px-3 py-2 font-semibold">
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-line">
                    {ROWS.map((r) => (
                        <tr key={r.variant}>
                            <td className="px-3 py-2">
                                <code className="text-xs text-ink-2">{r.variant}</code>
                            </td>
                            {r.states.map((cls, i) => (
                                <td key={i} className="px-3 py-3">
                                    <span className={`inline-flex items-center rounded-[9px] px-3.5 py-2 font-semibold ${cls}`}>Texto</span>
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
