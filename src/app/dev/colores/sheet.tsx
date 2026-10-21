'use client';

// The sheet itself: tokens, status, alpha, type and radii. Client so each swatch can read its
// variable from the page (the real value, var() chains resolved), and so the live components
// below can hold state.
import { useEffect, useState } from 'react';
import { ALPHA, GROUPS, RADII, STATUS, TYPE, type Swatch } from './palette.ts';
import { CARD } from '../../../shared/ui/card.tsx';
import { LiveComponents } from './live.tsx';
import { ToastSamples } from './toast-samples.tsx';
import { CODE, LIST, Section } from './section.tsx';

function useTokenValue(token: string) {
    const [value, setValue] = useState('');
    useEffect(() => setValue(getComputedStyle(document.documentElement).getPropertyValue(token).trim()), [token]);
    return value;
}

function SwatchCard({ swatch }: { swatch: Swatch }) {
    const value = useTokenValue(swatch.token);
    return (
        <li className={`flex flex-col overflow-hidden ${CARD}`}>
            <div className="h-16 w-full border-b border-line" style={{ background: `var(${swatch.token})` }} />
            <div className="flex flex-col gap-0.5 p-3">
                <code className="text-[12.5px] font-semibold select-all">{swatch.token.replace('--color-', '')}</code>
                <code className="text-xs text-ink-2 select-all">{value || '…'}</code>
                <p className="mt-1 text-xs text-ink-2">{swatch.role}</p>
                {swatch.where && <p className="text-[11.5px] text-ink-3">{swatch.where}</p>}
            </div>
        </li>
    );
}

export function ColorSheet() {
    return (
        <main className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-10">
            <header className="flex flex-col gap-2">
                <h1 className="text-[21px] font-extrabold">UI de INROCONTA</h1>
                <p className="max-w-3xl text-[13px] text-ink-2">
                    Todo lo que la app pinta, por rol. Los tokens viven en <code>src/app/globals.css</code> y cada muestra lee su variable de la página: el
                    valor que ves ES el token. Regla: un componente pinta con un rol, nunca con un hex, un valor de marca ni la paleta de Tailwind a pelo. ✅ =
                    normalizado · ⏳ = inventario, lista de trabajo.
                </p>
            </header>

            {GROUPS.map((g) => (
                <Section key={g.title} title={g.title} blurb={g.blurb}>
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {g.swatches.map((s) => (
                            <SwatchCard key={s.token} swatch={s} />
                        ))}
                    </ul>
                </Section>
            ))}

            <Section
                title="Estado ✅"
                blurb="Tres roles con las mismas tres piezas: el sólido (barra, punto, insignia), el fuerte (texto, y texto sobre el suave) y el suave (chip, aviso). No hay «info» propio: lo informativo es el primario suave."
            >
                <ul className={LIST}>
                    {STATUS.map((s) => (
                        <li key={s.role} className="flex items-center gap-3 px-3 py-2">
                            <span className="flex shrink-0 overflow-hidden rounded border border-line" aria-hidden="true">
                                <span className={`h-6 w-8 ${s.soft}`} />
                                <span className={`h-6 w-8 ${s.solid}`} />
                                <span className={`h-6 w-8 ${s.strongBg}`} />
                            </span>
                            <code className={`w-20 ${CODE}`}>{s.role}</code>
                            <span className="flex-1 text-[13px]">{s.use}</span>
                            <span className={`hidden rounded-full px-2.5 py-1 text-[12.5px] font-semibold sm:block ${s.soft} ${s.strong}`}>suave + fuerte</span>
                        </li>
                    ))}
                </ul>
            </Section>

            <Section
                title="Alfa sobre ink ✅"
                blurb="Casi no hay: la tinta va en tres grises sólidos. Solo quedan el hueco de carga y el hover del botón oscuro. Cualquier otro /NN es deriva."
            >
                <ul className={LIST}>
                    {ALPHA.map((a) => (
                        <li key={a.className} className="flex items-center gap-3 px-3 py-2">
                            <span className={`h-6 w-16 shrink-0 rounded ${a.className}`} aria-hidden="true" />
                            <code className={`w-20 ${CODE}`}>{a.className}</code>
                            <span className="flex-1 text-[13px]">{a.role}</span>
                        </li>
                    ))}
                </ul>
            </Section>

            <Section
                title="Tipografía ⏳"
                blurb="Manrope, cuerpo a 14px. Los tamaños se escribieron en px al portar la vista de Apps Script: hay diez, varios a medio punto de distancia (13 / 13.5, 11 / 11.5 / 12). Contados el 14/10; plegarlos a una escala con nombre es el siguiente paso."
            >
                <ul className={LIST}>
                    {TYPE.map((t) => (
                        <li key={t.className} className="flex items-center gap-3 px-3 py-2">
                            <span className={`w-44 shrink-0 truncate ${t.className}`}>Aa 1,234.50</span>
                            <code className={`w-56 truncate ${CODE}`}>{t.className}</code>
                            <span className="flex-1 text-[13px]">{t.role}</span>
                            <span className="text-xs text-ink-3 tabular-nums">{t.uses}×</span>
                        </li>
                    ))}
                </ul>
            </Section>

            <Section
                title="Radios ✅"
                blurb="De dentro hacia fuera: cuanto más grande la pieza, más redondo su borde, y lo que va dentro de otra pieza lleva menos radio que ella."
            >
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {RADII.map((r) => (
                        <li key={r.className} className="flex flex-col gap-2">
                            <span className={`h-14 border border-control bg-surface-2 ${r.className}`} aria-hidden="true" />
                            <code className={CODE}>{r.className}</code>
                            <span className="text-xs text-ink-2">{r.role}</span>
                        </li>
                    ))}
                </ul>
            </Section>

            <LiveComponents />
            <ToastSamples />
        </main>
    );
}
