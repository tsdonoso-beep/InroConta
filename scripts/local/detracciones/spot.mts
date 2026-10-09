// La consulta SPOT de SOL ya abierta (menu.mts la abre): filtros, tabla y constancia.
//
//   filtros (fechas vacías, tipo de cuenta, período) → «Consultar» → tabla
//   → número azul de «Constancia» → modal → «Guardar» → constancia_dtr_<número>.html
//
// Detalle: docs/detracciones-spot.md §4 y §5.

import type { Download, Frame } from 'playwright';
import type { Bitacora } from '../comun/bitacora.mts';

/** Un control del formulario, tal cual lo ve la página (para anotar ids y opciones reales). */
export interface Control {
    etiqueta: string;
    tag: string;
    tipo: string;
    id: string;
    name: string;
    placeholder: string;
    valor: string;
    visible: boolean;
    opciones?: { valor: string; texto: string; elegida: boolean }[];
}

/** Todos los campos y desplegables de la consulta, con sus opciones. */
export function controles(f: Frame): Promise<Control[]> {
    return f.evaluate(() =>
        Array.from(document.querySelectorAll('input, select, textarea, button')).map((el) => {
            const e = el as HTMLInputElement & HTMLSelectElement;
            const fila = el.closest('.form-group, .row, tr');
            const r = (el as HTMLElement).getBoundingClientRect();
            return {
                etiqueta: (fila?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
                tag: el.tagName.toLowerCase(),
                tipo: e.type ?? '',
                id: el.id,
                name: e.name ?? '',
                placeholder: e.placeholder ?? '',
                valor: el.tagName === 'BUTTON' ? (el.textContent ?? '').trim() : (e.value ?? ''),
                visible: r.width > 0 && r.height > 0,
                opciones:
                    el.tagName === 'SELECT' ? Array.from(e.options).map((o) => ({ valor: o.value, texto: o.text.trim(), elegida: o.selected })) : undefined,
            };
        }),
    );
}

/**
 * Filtros: fechas vacías, el tipo de cuenta cuyo texto contenga `tipoCuenta`
 * y el período. Lo que no se encuentre queda anotado en la bitácora: es un
 * reconocimiento, se sigue con lo que haya.
 */
export async function llenarFiltros(b: Bitacora, f: Frame, periodo: string, tipoCuenta: string): Promise<void> {
    const lista = await controles(f);
    for (const c of lista.filter((c) => c.tag === 'input' && c.visible && /^\d{2}\/\d{2}\/\d{4}$/.test(c.valor))) {
        await f.locator(selector(c)).first().fill('');
        b.log('info', 'filtros', `fecha vaciada (${selector(c)}, tenía ${c.valor})`);
    }
    const cuenta = lista.find((c) => c.tag === 'select' && c.opciones?.some((o) => /convencional/i.test(o.texto)));
    const opcion = cuenta?.opciones?.find((o) => o.texto.toLowerCase().includes(tipoCuenta.toLowerCase()));
    if (cuenta && opcion) {
        await f.locator(selector(cuenta)).first().selectOption(opcion.valor);
        b.log('info', 'filtros', `tipo de cuenta: «${opcion.texto}»`);
    } else b.log('aviso', 'filtros', `no se encontró el tipo de cuenta «${tipoCuenta}»`);
    const per = lista.find((c) => c.tag === 'input' && /aaaamm/i.test(c.placeholder));
    if (!per) return b.log('aviso', 'filtros', 'no se encontró el campo del período (placeholder aaaamm)');
    const campo = f.locator(selector(per)).first();
    await campo.fill(periodo);
    // Si el selector de mes no tomó lo escrito, se fija el valor y se avisa a la página.
    if ((await campo.inputValue()) !== periodo)
        await campo.evaluate((el, v) => {
            (el as HTMLInputElement).value = v;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }, periodo);
    await campo.press('Escape').catch(() => {});
    b.log('info', 'filtros', `período: escrito ${periodo}, quedó «${await campo.inputValue()}»`);
}

function selector(c: Control): string {
    if (c.id) return /^[A-Za-z][\w-]*$/.test(c.id) ? `#${c.id}` : `[id="${c.id}"]`;
    if (c.name) return `${c.tag}[name="${c.name}"]`;
    return `${c.tag}[placeholder="${c.placeholder}"]`;
}

export async function consultar(f: Frame): Promise<void> {
    await f.getByRole('button', { name: 'Consultar' }).first().click();
}

/** Los números azules de la columna «Constancia» (enlaces de solo dígitos). */
export function enlacesConstancia(f: Frame) {
    return f.locator('a').filter({ hasText: /^\s*\d{6,}\s*$/ });
}

/** El modal de la constancia, ya abierto. */
export function modalConstancia(f: Frame) {
    return f.locator('.modal, [role=dialog]').filter({ hasText: 'CONSTANCIA DE DEP' }).first();
}

/** «Guardar» del modal → el HTML que entrega SUNAT. */
export async function guardarConstancia(f: Frame): Promise<{ nombre: string; datos: Buffer }> {
    const modal = modalConstancia(f);
    const [d] = await Promise.all([
        f.page().waitForEvent('download', { timeout: 60000 }) as Promise<Download>,
        modal.getByText('Guardar', { exact: true }).first().click(),
    ]);
    const trozos: Buffer[] = [];
    for await (const t of await d.createReadStream()) trozos.push(t as Buffer);
    return { nombre: d.suggestedFilename(), datos: Buffer.concat(trozos) };
}

/** Cierra el modal con su ×, o con Escape. */
export async function cerrarConstancia(f: Frame): Promise<void> {
    const modal = modalConstancia(f);
    const x = modal.locator('button.close, [aria-label=Close], [data-dismiss=modal]').first();
    if (await x.isVisible().catch(() => false)) await x.click().catch(() => {});
    else await f.page().keyboard.press('Escape');
    await modal.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
}
