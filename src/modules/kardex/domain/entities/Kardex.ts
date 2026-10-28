// The Almacén kardex as the Kardex screen shows it: the summary per month of operation (kardex_mes)
// and every change the robot saw from one reading to the next (cambio, entidad 'kardex'), with
// whether its month had already closed when it was seen (migration v2 016,
// src/shared/lib/kardex/movimientos.ts).

export interface KardexMonth {
    /** yyyy-mm of the operation date. */
    month: string;
    movements: number;
    vouchers: number;
    /** Quantities, all units together. */
    inQty: number;
    outQty: number;
    voided: number;
}

export type KardexChangeType = 'NUEVO' | 'CAMBIO' | 'ELIMINADO';

export interface KardexChange {
    id: number;
    /** The kardex row (its ID in Almacén's app). */
    key: string;
    type: KardexChangeType;
    /** Which column changed (CAMBIO only), as movimientos.ts names it: salida, fechaOperacion… */
    field: string;
    before: string;
    after: string;
    /** yyyy-mm of the movement ('' if it has no operation date). */
    month: string;
    /** Its month had already ended when the change was seen: it moves a closing. */
    closedMonth: boolean;
    voucher: string;
    movement: string;
    sku: string;
    product: string;
    project: string;
    responsible: string;
    /** ISO instant it was seen. */
    at: string;
}

export interface KardexRead {
    months: KardexMonth[];
    /** The last DAYS days, newest first. */
    changes: KardexChange[];
    /** ISO instant of the last finished reading; '' if the robot never read it. */
    lastReadAt: string;
    readAt: string;
}

/** How far back the screen reads the changes. */
export const KARDEX_DAYS = 120;
