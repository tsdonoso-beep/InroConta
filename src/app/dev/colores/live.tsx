'use client';

// The shared components for real, not drawings of them: hover, press and reach them with Tab.
// If one of them changes in shared/ui, it changes here by itself.
import { useState } from 'react';
import { BarRow, Empty, MoreButton, Notice, Ring, SearchBox, Select, TextButton, type BarColor } from '../../../shared/ui/bits.tsx';
import { Button, BUTTON_SIZES, BUTTON_VARIANTS, LINK_CLASS } from '../../../shared/ui/button.tsx';
import { Card, Chip, Kpi, KpiNote, Segmented } from '../../../shared/ui/card.tsx';
import { Hueco } from '../../../shared/ui/hueco.tsx';
import { PeriodPicker } from '../../../shared/ui/period-picker.tsx';
import { Section } from './section.tsx';

const BARS: BarColor[] = ['primary', 'teal', 'success', 'warning', 'danger', 'muted'];
const MONTHS = ['202607', '202608', '202609', '202610'];

export function LiveComponents() {
    const [seg, setSeg] = useState<'a' | 'b' | 'c'>('a');
    const [q, setQ] = useState('');
    const [sel, setSel] = useState('todos');
    const [period, setPeriod] = useState('');
    const [chosen, setChosen] = useState(1);

    return (
        <>
            <Section
                title="Botones ✅"
                blurb={
                    <>
                        Un solo juego de clases (<code>shared/ui/button.tsx</code>: <code>buttonClass()</code> para un <code>&lt;a&gt;</code> o un{' '}
                        <code>Link</code>, <code>Button</code> para un botón). Antes eran tres botones escritos a mano con tres radios, tres hovers (uno con
                        opacidad) y un solo deshabilitado. Hover un peldaño más oscuro; el foco es un anillo que solo trae el teclado (Tab); deshabilitado gris,
                        sin opacidad. Una acción principal por pantalla.
                    </>
                }
            >
                <div className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-4">
                    {BUTTON_SIZES.map((size) => (
                        <div key={size} className="flex flex-wrap items-center gap-2.5">
                            <code className="w-8 shrink-0 text-xs text-ink-3">{size}</code>
                            {BUTTON_VARIANTS.map((v) => (
                                <Button key={v} variant={v} size={size}>
                                    {v}
                                </Button>
                            ))}
                            <Button size={size} disabled>
                                deshabilitado
                            </Button>
                        </div>
                    ))}
                    <div className="flex flex-wrap items-center gap-4">
                        <code className="w-8 shrink-0 text-xs text-ink-3">texto</code>
                        <TextButton onClick={() => {}}>Acción de texto</TextButton>
                        <a href="#" className={LINK_CLASS}>
                            Enlace (Drive, archivo) ↗
                        </a>
                        <MoreButton shown={10} total={25} onMore={() => {}} />
                    </div>
                </div>
            </Section>

            <Section
                title="Controles ✅"
                blurb="Buscador, select y período comparten CONTROL (bits.tsx): mismo radio, borde, foco azul y deshabilitado gris. Antes el período se apagaba con opacidad y el select no marcaba el foco."
            >
                <div className="flex flex-wrap items-center gap-2.5 rounded-[10px] border border-line bg-surface p-4">
                    <SearchBox value={q} onChange={setQ} placeholder="Buscar RUC o razón social" />
                    <Select value={sel} onChange={setSel} label="Estado">
                        <option value="todos">Todos</option>
                        <option value="pendientes">Pendientes</option>
                    </Select>
                    <PeriodPicker value={period} onChange={setPeriod} months={MONTHS} />
                    <PeriodPicker value="" onChange={() => {}} months={MONTHS} disabled />
                    <Segmented
                        value={seg}
                        onChange={setSeg}
                        options={[
                            { value: 'a', label: 'Recibidos' },
                            { value: 'b', label: 'Emitidos' },
                            { value: 'c', label: 'Todos' },
                        ]}
                    />
                </div>
            </Section>

            <Section title="Chips y avisos ✅" blurb="La pareja suave + fuerte de cada rol. «info» es el primario suave.">
                <div className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-4">
                    <div className="flex flex-wrap gap-2">
                        <Chip tone="ok">ok</Chip>
                        <Chip tone="warn">warn</Chip>
                        <Chip tone="danger">danger</Chip>
                        <Chip tone="info">info</Chip>
                        <Chip tone="muted">muted</Chip>
                    </div>
                    <Notice tone="danger">Aviso danger: 3 facturas de proveedores en la lista SSCO.</Notice>
                    <Notice tone="warning">Aviso warning: el robot no corrió hoy.</Notice>
                    <Notice tone="info">Aviso info: los datos son del libro, actualizados a las 07:00.</Notice>
                    <Empty>Vacío: no hay comprobantes en este período.</Empty>
                </div>
            </Section>

            <Section
                title="Tarjetas y KPI ✅"
                blurb="Tarjeta blanca sobre el lienzo con shadow-card. El KPI de riesgo degrada a danger-soft; con el valor aún viajando, el hueco ocupa su sitio exacto."
            >
                <div className="grid gap-3 sm:grid-cols-3">
                    <Kpi label="Ventas del mes" value="S/ 1,234,567.89">
                        <KpiNote>132 comprobantes</KpiNote>
                    </Kpi>
                    <Kpi label="Sin OC" value="27" risk>
                        <KpiNote>S/ 48,210.00 por sustentar</KpiNote>
                    </Kpi>
                    <Kpi label="Cargando" value={null} />
                </div>
                <Card title="Tarjeta con título" note="nota a la derecha">
                    <p className="text-[13px] text-ink-2">
                        Cuerpo de la tarjeta. Hueco en línea: <Hueco className="h-3.5 w-24" />
                    </p>
                </Card>
            </Section>

            <Section
                title="Barras y anillos ✅"
                blurb="Los colores que puede tomar una barra (BAR en bits.tsx): un rol, nunca un hex. La fila elegida se pinta con primary-soft."
            >
                <div className="grid gap-3 sm:grid-cols-2">
                    <Card>
                        {BARS.map((c, i) => (
                            <BarRow
                                key={c}
                                label={c}
                                figures={`${(i + 1) * 15}%`}
                                pct={(i + 1) * 15}
                                color={c}
                                chosen={chosen === i}
                                onClick={() => setChosen(i)}
                            />
                        ))}
                    </Card>
                    <Card>
                        <div className="flex flex-col gap-4">
                            <Ring pct={72} color="primary">
                                primary
                            </Ring>
                            <Ring pct={45} color="teal">
                                teal
                            </Ring>
                            <Ring pct={18} color="danger">
                                danger
                            </Ring>
                        </div>
                    </Card>
                </div>
            </Section>
        </>
    );
}
