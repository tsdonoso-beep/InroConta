// The pure rules of the Kardex screen: the words for each column, the filters of the changes and
// how many changes each month got after it closed.
import type { KardexChange, KardexChangeType, KardexMonth } from '../entities/Kardex.ts';

/** The columns of the kardex in Contabilidad's words (movimientos.ts CAMPOS_KARDEX). */
export const FIELD_LABELS: Record<string, string> = {
    vale: 'Vale',
    fechaRegistro: 'Fecha de registro',
    fechaOperacion: 'Fecha de operación',
    movimiento: 'Movimiento',
    operacion: 'Operación',
    anexo: 'Anexo',
    numeroDocumento: 'Documento',
    numeroOrden: 'Orden',
    proyecto: 'Proyecto',
    sede: 'Sede',
    responsable: 'Responsable',
    sku: 'Código (SIDIGE)',
    producto: 'Producto',
    unidad: 'Unidad',
    categoria: 'Categoría',
    ingreso: 'Ingreso',
    salida: 'Salida',
};

export const fieldLabel = (f: string) => FIELD_LABELS[f] ?? f;

export interface KardexChangeFilter {
    /** yyyy-mm of the movement; '' = every month. */
    month: string;
    /** Only the ones that moved an already closed month. */
    closedOnly: boolean;
    type: KardexChangeType | '';
    /** Words of the voucher, the product, its code, the project or the responsible. */
    text: string;
}

export const KARDEX_FILTER_DEFAULT: KardexChangeFilter = { month: '', closedOnly: true, type: '', text: '' };

const plain = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

export function filterKardexChanges(changes: KardexChange[], f: KardexChangeFilter): KardexChange[] {
    const words = plain(f.text).split(/\s+/).filter(Boolean);
    return changes.filter((c) => {
        if (f.month && c.month !== f.month) return false;
        if (f.closedOnly && !c.closedMonth) return false;
        if (f.type && c.type !== f.type) return false;
        if (!words.length) return true;
        const t = plain(`${c.voucher} ${c.product} ${c.sku} ${c.project} ${c.responsible} ${c.key}`);
        return words.every((w) => t.includes(w));
    });
}

/** How many changes each month got after it had closed (within the changes read). */
export function postClosingByMonth(changes: KardexChange[]): Map<string, number> {
    const out = new Map<string, number>();
    for (const c of changes) if (c.closedMonth && c.month) out.set(c.month, (out.get(c.month) ?? 0) + 1);
    return out;
}

/** The movements touched (several columns of one row are one movement). */
export const movementsTouched = (changes: KardexChange[]) => new Set(changes.map((c) => c.key)).size;

export interface KardexKpis {
    /** Changes to already closed months, and how many movements and months they touched. */
    closedChanges: number;
    closedMovements: number;
    closedMonths: number;
    /** Changes seen in the last 7 days (any month). */
    lastWeek: number;
    /** This month (by the reading date): movements and vouchers so far. */
    current: KardexMonth | null;
}

export function kardexKpis(months: KardexMonth[], changes: KardexChange[], now = new Date()): KardexKpis {
    const closed = changes.filter((c) => c.closedMonth);
    const weekAgo = new Date(now.getTime() - 7 * 86400_000).toISOString();
    const thisMonth = new Date(now.getTime() - 5 * 3600_000).toISOString().slice(0, 7);
    return {
        closedChanges: closed.length,
        closedMovements: movementsTouched(closed),
        closedMonths: new Set(closed.map((c) => c.month).filter(Boolean)).size,
        lastWeek: changes.filter((c) => c.at >= weekAgo).length,
        current: months.find((m) => m.month === thisMonth) ?? null,
    };
}

/** «Salida: 4 → 5», «Nuevo movimiento», «Se borró del kardex». */
export function changeText(c: KardexChange): string {
    if (c.type === 'NUEVO') return 'Movimiento nuevo';
    if (c.type === 'ELIMINADO') return 'Se borró del kardex';
    return `${fieldLabel(c.field)}: ${c.before || '(vacío)'} → ${c.after || '(vacío)'}`;
}
