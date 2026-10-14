// What the Detracciones screen writes the same way in several places: soles, the short amount of
// the charts (montoCorto), the case chip (chipCaso) and «proveedor / cliente» by direction.
import { caseOf, type DetractionFilters } from '../../../modules/detracciones/application/views.ts';
import { Chip } from '../../../shared/ui/card.tsx';
import { money } from '../../../shared/ui/format.ts';

export const soles = (n: number | null) => money(n ?? 0, 'PEN');

/** «S/ 1.2 M», «S/ 45 mil» or «S/ 9,876»: the old montoCorto (one decimal in millions, always). */
export function shortSoles(n: number): string {
    const a = Math.abs(n);
    if (a >= 1e6) return `S/ ${(a / 1e6).toFixed(1)} M`;
    if (a >= 1e4) return `S/ ${Math.round(a / 1e3)} mil`;
    return soles(n).replace(/\.\d\d$/, '');
}

/** The amount of a currency the invoice may come in (anything else is shown as soles). */
export const inCurrency = (n: number, currency: string) => money(n, currency === 'USD' || currency === 'EUR' ? currency : 'PEN');

const TONE = { success: 'ok', danger: 'danger', primary: 'info' } as const;
export function CaseChip({ name }: { name: string }) {
    const c = caseOf(name);
    return (
        <Chip tone={TONE[c.color as keyof typeof TONE] ?? 'warn'} title={c.description}>
            {name}
        </Chip>
    );
}

type Dir = DetractionFilters['direction'];
/** Header of the counterpart column. */
export const partyLabel = (d: Dir) => (d === 'venta' ? 'Cliente' : d === 'compra' ? 'Proveedor' : 'Proveedor / cliente');
export const partiesWord = (d: Dir) => (d === 'venta' ? 'clientes' : d === 'compra' ? 'proveedores' : 'proveedores y clientes');
