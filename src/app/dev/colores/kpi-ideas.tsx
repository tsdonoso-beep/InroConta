// Sketches to replace the red KPI (the red border and the red-to-pink gradient he did not like,
// 21/10/2026). Each one is drawn twice: with a subtraction that is NOT a risk (credit notes: they
// are already taken off the total) and with a real alert (invoices without their proof). Only
// sketches: shared/ui/card.tsx keeps the current Kpi until he picks one.
import type { ReactNode } from 'react';
import { CARD } from '../../../shared/ui/card.tsx';

const LABEL = 'mb-2 text-[11px] font-semibold tracking-[.06em] text-ink-3 uppercase';
const VALUE = 'truncate text-2xl leading-tight font-extrabold tracking-tight';
const NOTE = 'mt-1.5 text-xs text-ink-2';

function Sketch({ name, why, children }: { name: string; why: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-2">
            <div className="grid gap-3 sm:grid-cols-2">{children}</div>
            <p className="text-xs text-ink-2">
                <b className="text-ink">{name}.</b> {why}
            </p>
        </div>
    );
}

const Box = ({ className = '', children }: { className?: string; children: ReactNode }) => (
    <div className={`min-w-0 ${CARD} px-[18px] pt-4 pb-3.5 ${className}`}>{children}</div>
);

export function KpiIdeas() {
    return (
        <div className="flex flex-col gap-6">
            <Sketch
                name="A · Neutra"
                why="La tarjeta y el número como cualquier otra; solo la nota dice qué es. Para lo que no es alerta (las notas de crédito restan, no avisan)."
            >
                <Box>
                    <div className={LABEL}>Notas de crédito</div>
                    <div className={VALUE}>−S/ 2,528,939.24</div>
                    <div className={NOTE}>354 notas · ya restadas del total</div>
                </Box>
                <Box>
                    <div className={LABEL}>Sin constancia</div>
                    <div className={VALUE}>42</div>
                    <div className={NOTE}>facturas con detracción sin depósito</div>
                </Box>
            </Sketch>

            <Sketch
                name="B · Punto"
                why="Un punto de color junto al rótulo: se ve de lejos sin teñir la tarjeta. Rojo para la alerta, gris para lo informativo."
            >
                <Box>
                    <div className={`${LABEL} flex items-center gap-1.5`}>
                        <span className="size-2 rounded-full bg-ink-3" /> Notas de crédito
                    </div>
                    <div className={VALUE}>−S/ 2,528,939.24</div>
                    <div className={NOTE}>354 notas · ya restadas del total</div>
                </Box>
                <Box>
                    <div className={`${LABEL} flex items-center gap-1.5`}>
                        <span className="size-2 rounded-full bg-danger" /> Sin constancia
                    </div>
                    <div className={VALUE}>42</div>
                    <div className={NOTE}>facturas con detracción sin depósito</div>
                </Box>
            </Sketch>

            <Sketch
                name="C · Filo"
                why="Un filo de 3 px a la izquierda; el resto igual a todas. Marca la alerta sin gritar y sigue el estilo de la tarjeta única."
            >
                <Box className="border-l-[3px] border-l-ink-3">
                    <div className={LABEL}>Notas de crédito</div>
                    <div className={VALUE}>−S/ 2,528,939.24</div>
                    <div className={NOTE}>354 notas · ya restadas del total</div>
                </Box>
                <Box className="border-l-[3px] border-l-danger">
                    <div className={LABEL}>Sin constancia</div>
                    <div className={VALUE}>42</div>
                    <div className={NOTE}>facturas con detracción sin depósito</div>
                </Box>
            </Sketch>

            <Sketch
                name="D · Solo el número"
                why="Tarjeta neutra, el color solo en la cifra (sin borde ni degradado rojo). Lo más parecido a hoy, sin lo que molestaba."
            >
                <Box>
                    <div className={LABEL}>Notas de crédito</div>
                    <div className={`${VALUE} text-ink-2`}>−S/ 2,528,939.24</div>
                    <div className={NOTE}>354 notas · ya restadas del total</div>
                </Box>
                <Box>
                    <div className={LABEL}>Sin constancia</div>
                    <div className={`${VALUE} text-danger`}>42</div>
                    <div className={NOTE}>facturas con detracción sin depósito</div>
                </Box>
            </Sketch>

            <Sketch
                name="E · Etiqueta"
                why="Número en tinta; una etiqueta suave dice el estado. Como el selector Compras | Ventas: la pieza oscura o de color es pequeña, la tarjeta no cambia."
            >
                <Box>
                    <div className={LABEL}>Notas de crédito</div>
                    <div className={VALUE}>−S/ 2,528,939.24</div>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-ink-2">
                        <span className="rounded-full bg-surface-3 px-2 py-0.5 font-semibold">resta</span> 354 notas
                    </div>
                </Box>
                <Box>
                    <div className={LABEL}>Sin constancia</div>
                    <div className={VALUE}>42</div>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-ink-2">
                        <span className="rounded-full bg-danger-soft px-2 py-0.5 font-semibold text-danger-strong">por resolver</span> sin depósito
                    </div>
                </Box>
            </Sketch>
        </div>
    );
}
