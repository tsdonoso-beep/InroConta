// The charts of Resumen: sparkline, bars by month, donut by type and the supplier × month heat
// map. Ports of chispa(), pintarMeses(), pintarDona() and pintarCalor() of the Apps Script view.
import type { DocKind, HeatRow, KindSlice, MonthBar } from '../../../modules/comprobantes/application/views.ts';
import { money, monthLabel, thousands } from '../../../shared/ui/format.ts';
import { Hueco } from '../../../shared/ui/hueco.tsx';

export const KIND: Record<DocKind, { label: string; fill: string; stroke: string; bg: string }> = {
    F: { label: 'Facturas', fill: 'fill-teal', stroke: 'stroke-teal', bg: 'bg-teal' },
    B: { label: 'Boletas', fill: 'fill-primary', stroke: 'stroke-primary', bg: 'bg-primary' },
    C: { label: 'Notas de crédito', fill: 'fill-danger', stroke: 'stroke-danger', bg: 'bg-danger' },
    D: { label: 'Notas de débito', fill: 'fill-warning', stroke: 'stroke-warning', bg: 'bg-warning' },
    O: { label: 'Otros', fill: 'fill-ink-3', stroke: 'stroke-ink-3', bg: 'bg-ink-3' },
};

/** `lit`: the months of the chosen period ([] = all of them). */
export function Sparkline({ values, months, lit, fill }: { values: number[]; months: string[]; lit: string[]; fill: string }) {
    if (!values.length) return null;
    const w = 220,
        h = 34,
        max = Math.max(...values.map(Math.abs), 1),
        bw = w / values.length;
    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="mt-2.5 block h-auto max-w-full">
            {values.map((v, i) => {
                const bh = Math.max(2, (Math.abs(v) / max) * h);
                return (
                    <rect
                        key={i}
                        x={i * bw + 1.5}
                        y={h - bh}
                        width={Math.max(2, bw - 3)}
                        height={bh}
                        rx={2}
                        className={fill}
                        opacity={!lit.length || lit.includes(months[i]) ? 1 : 0.35}
                    />
                );
            })}
        </svg>
    );
}

/** A click on a bar chooses that month, or lets it go when it was the only one chosen. */
export function MonthBars({ bars, lit, currency, onPick }: { bars: MonthBar[]; lit: string[]; currency: string; onPick: (m: string) => void }) {
    const max = Math.max(...bars.map((b) => Math.abs(b.total)), 1);
    return (
        <div className="flex h-[210px] items-end gap-2.5 overflow-x-auto pt-1.5">
            {bars.map((b) => (
                <button
                    key={b.month}
                    type="button"
                    onClick={() => onPick(lit.length === 1 && lit[0] === b.month ? '' : b.month)}
                    title={`${monthLabel(b.month)}: ${money(b.total, currency)} · ${b.count} comprobantes`}
                    className={`group flex h-full flex-[1_0_46px] flex-col items-center justify-end gap-1.5 ${lit.length && !lit.includes(b.month) ? 'opacity-30' : ''}`}
                >
                    <span className="text-[11.5px] font-bold whitespace-nowrap text-ink-2">{money(b.total, currency, true)}</span>
                    <span
                        className={`block w-[70%] max-w-[46px] rounded-t-[7px] rounded-b-[3px] group-hover:opacity-80 ${b.total < 0 ? 'bg-danger' : 'bg-primary'}`}
                        style={{ height: Math.max(2, (Math.abs(b.total) / max) * 150) }}
                    />
                    <span className={`text-xs whitespace-nowrap ${lit.includes(b.month) ? 'font-bold text-ink' : 'text-ink-2'}`}>{monthLabel(b.month)}</span>
                </button>
            ))}
        </div>
    );
}

export function Donut({ slices, count, currency }: { slices: KindSlice[]; count: number; currency: string }) {
    const total = slices.reduce((a, s) => a + s.total, 0);
    if (!total) return <p className="text-[13px] text-ink-3">Sin comprobantes con este filtro.</p>;
    const r = 54,
        c = 2 * Math.PI * r;
    let acc = 0;
    return (
        <div className="flex flex-wrap items-center gap-[22px]">
            <svg width="140" height="140" viewBox="0 0 140 140">
                {slices.map((s) => {
                    const len = (c * s.total) / total;
                    const arc = (
                        <circle
                            key={s.kind}
                            cx="70"
                            cy="70"
                            r={r}
                            fill="none"
                            strokeWidth="22"
                            className={KIND[s.kind].stroke}
                            strokeDasharray={`${len} ${c - len}`}
                            strokeDashoffset={-acc}
                            transform="rotate(-90 70 70)"
                        />
                    );
                    acc += len;
                    return arc;
                })}
                <text x="70" y="66" textAnchor="middle" fontSize="20" fontWeight="800" className="fill-ink">
                    {thousands(count)}
                </text>
                <text x="70" y="84" textAnchor="middle" fontSize="11" className="fill-ink-3">
                    comprobantes
                </text>
            </svg>
            <div className="flex min-w-[180px] flex-1 flex-col gap-2.5">
                {slices.map((s) => (
                    <div key={s.kind} className="flex justify-between gap-2.5 text-[13px]">
                        <span>
                            <i className={`mr-2 inline-block size-2.5 rounded-[3px] align-[-1px] ${KIND[s.kind].bg}`} />
                            {KIND[s.kind].label} <span className="text-xs text-ink-3">({s.count})</span>
                        </span>
                        <b className="whitespace-nowrap tabular-nums">{money(s.total, currency, true)}</b>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function HeatMap({ months, rows, lit, currency }: { months: string[]; rows: HeatRow[]; lit: string[]; currency: string }) {
    if (!rows.length) return <p className="text-[13px] text-ink-3">Sin datos.</p>;
    const max = Math.max(1, ...rows.flatMap((r) => months.map((m) => r.byMonth[m] ?? 0)));
    return (
        <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-[3px] text-[12.5px]">
                <thead>
                    <tr className="text-[11px] font-semibold tracking-[.04em] text-ink-3 uppercase">
                        <th />
                        {months.map((m) => (
                            <th key={m} className={`px-1 pb-1 whitespace-nowrap ${lit.includes(m) ? 'text-ink' : ''}`}>
                                {monthLabel(m)}
                            </th>
                        ))}
                        <th className="text-right">6 meses</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => (
                        <tr key={r.ruc}>
                            <td className="max-w-[260px] truncate pr-2.5 font-semibold" title={r.name}>
                                {r.name}
                            </td>
                            {months.map((m) => {
                                const v = r.byMonth[m] ?? 0,
                                    a = v > 0 ? 0.08 + (0.8 * v) / max : 0;
                                return (
                                    <td
                                        key={m}
                                        title={`${r.name} · ${monthLabel(m)}: ${money(v, currency)}`}
                                        className={`min-w-[66px] rounded-[7px] px-1 py-2 text-center whitespace-nowrap tabular-nums ${a > 0.55 ? 'text-white' : v ? 'text-ink' : 'text-disabled-ink'} ${lit.includes(m) ? 'outline-2 outline-ink' : ''}`}
                                        style={{ background: `color-mix(in srgb, var(--color-teal) ${Math.round(a * 100)}%, transparent)` }}
                                    >
                                        {v ? money(v, currency, true) : '—'}
                                    </td>
                                );
                            })}
                            <td className="pl-2.5 text-right font-bold whitespace-nowrap">{money(r.total, currency, true)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/** The bars while the documents travel: the same 210 px box, bars as gaps (shorter than real). */
export function MonthBarsGap() {
    return (
        <div className="flex h-[210px] items-end gap-2.5 pt-1.5">
            {[60, 75, 70, 55, 50, 40, 45, 35, 30].map((h, i) => (
                <div key={i} className="flex h-full flex-[1_0_46px] flex-col items-center justify-end gap-1.5">
                    <Hueco className="h-3 w-10" />
                    <span className="block w-[70%] max-w-[46px] animate-pulse rounded-t-[7px] rounded-b-[3px] bg-ink/10" style={{ height: h }} />
                    <Hueco className="h-3 w-9" />
                </div>
            ))}
        </div>
    );
}

/** The donut while the documents travel: the ring and three legend rows, as gaps. */
export function DonutGap() {
    return (
        <div className="flex flex-wrap items-center gap-[22px]">
            <span className="block size-[140px] animate-pulse rounded-full border-[22px] border-ink/10" aria-hidden="true" />
            <div className="flex min-w-[180px] flex-1 flex-col gap-2.5">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="flex justify-between gap-2.5">
                        <Hueco className="h-4 w-32" />
                        <Hueco className="h-4 w-16" />
                    </div>
                ))}
            </div>
        </div>
    );
}
