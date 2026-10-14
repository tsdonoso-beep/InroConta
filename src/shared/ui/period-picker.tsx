'use client';

// The period filter every screen shares: first what kind (día, mes, bimestre, trimestre,
// semestre, año o rango), then which one. The options are only the periods that have data
// (`months`, YYYYMM); a day and a range take any date. The value is a code of shared/period.ts.
import { useState } from 'react';
import { parsePeriod, periodCode, periodLabel, rangeCode, type PeriodKind } from '../period.ts';

const KINDS: { value: PeriodKind | ''; label: string }[] = [
    { value: '', label: 'Todo el período' },
    { value: 'day', label: 'Un día' },
    { value: 'month', label: 'Mes' },
    { value: 'bimester', label: 'Bimestre' },
    { value: 'quarter', label: 'Trimestre' },
    { value: 'semester', label: 'Semestre' },
    { value: 'year', label: 'Año' },
    { value: 'range', label: 'Rango de fechas' },
];

const CONTROL = 'rounded-[9px] border border-control bg-surface px-2.5 py-2 text-[13.5px] disabled:opacity-60';

/** The periods of `kind` that have data, newest first, as [code, label]. */
function optionsOf(kind: PeriodKind, months: string[]): [string, string][] {
    const codes = [...new Set(months.map((m) => periodCode(kind, m)))].filter(Boolean).sort((a, b) => (parsePeriod(a)!.from < parsePeriod(b)!.from ? 1 : -1));
    return codes.map((c) => [c, periodLabel(parsePeriod(c))]);
}

export function PeriodPicker({
    value,
    onChange,
    months,
    disabled = false,
    allLabel = 'Todo el período',
}: {
    value: string;
    onChange: (code: string) => void;
    /** The months with data (YYYYMM), any order. */
    months: string[];
    disabled?: boolean;
    allLabel?: string;
}) {
    const p = parsePeriod(value);
    // A day or a range chosen but without its dates yet: the kind is remembered here until they come.
    const [pending, setPending] = useState<PeriodKind | null>(null);
    const kind: PeriodKind | '' = p?.kind ?? pending ?? '';
    const [from, setFrom] = useState(p?.kind === 'range' ? p.from : '');
    const [to, setTo] = useState(p?.kind === 'range' ? p.to : '');
    const latest = [...months].sort().at(-1) ?? '';

    const pickKind = (k: PeriodKind | '') => {
        if (!k) {
            setPending(null);
            return onChange('');
        }
        if (k === 'day' || k === 'range') {
            setPending(k);
            return onChange('');
        }
        setPending(null);
        onChange(latest ? periodCode(k, latest) : '');
    };
    const pickRange = (f: string, t: string) => {
        setFrom(f);
        setTo(t);
        const code = rangeCode(f, t);
        if (code) onChange(code);
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            <select
                aria-label="Tipo de período"
                value={kind}
                disabled={disabled}
                onChange={(e) => pickKind(e.target.value as PeriodKind | '')}
                className={CONTROL}
            >
                {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                        {k.value ? k.label : allLabel}
                    </option>
                ))}
            </select>
            {kind === 'day' && (
                <input
                    type="date"
                    aria-label="Día"
                    value={p?.kind === 'day' ? p.from : ''}
                    disabled={disabled}
                    onChange={(e) => e.target.value && onChange(`d${e.target.value}`)}
                    className={CONTROL}
                />
            )}
            {kind === 'range' && (
                <>
                    <input
                        type="date"
                        aria-label="Desde"
                        value={from}
                        disabled={disabled}
                        onChange={(e) => pickRange(e.target.value, to)}
                        className={CONTROL}
                    />
                    <span className="text-xs text-ink-3">a</span>
                    <input
                        type="date"
                        aria-label="Hasta"
                        value={to}
                        disabled={disabled}
                        onChange={(e) => pickRange(from, e.target.value)}
                        className={CONTROL}
                    />
                </>
            )}
            {kind && kind !== 'day' && kind !== 'range' && (
                <select aria-label="Período" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={CONTROL}>
                    {/* The chosen one even if it has no data (a link from another screen). */}
                    {!optionsOf(kind, months).some(([c]) => c === value) && value && <option value={value}>{periodLabel(p)}</option>}
                    {optionsOf(kind, months).map(([c, label]) => (
                        <option key={c} value={c}>
                            {label}
                        </option>
                    ))}
                </select>
            )}
        </div>
    );
}
