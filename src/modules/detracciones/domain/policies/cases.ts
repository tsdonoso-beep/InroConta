// What each proof's row says about it (the «Caso» column of the DETRACCIONES tab), in the order
// the old detracciones_hoja checked them: the first that fits wins.

export interface CaseInput {
    /** The invoice's period, YYYYMM. */
    period: string;
    /** From when the tab looks (YYYYMM). */
    since: string;
    deposited: number | null;
    /** The detraction the invoice declares: the XML's, if not the SIRE's. */
    invoiceDetraction: number | null;
    inSire: boolean;
    inXml: boolean;
    xmlDetraction: number | null;
    monthsToPay: number | null;
    /** An issued CRE covers the invoice too: an operation subject to the SPOT is not retained. */
    retained: boolean;
}

export function proofCase(c: CaseInput): string {
    if (c.retained) return 'Con retención';
    if ((c.invoiceDetraction ?? 0) > 0 && Math.abs((c.deposited ?? 0) - (c.invoiceDetraction ?? 0)) > 1) return 'Revisar monto';
    if (c.period < c.since) return `Factura de ${c.period.slice(0, 4)}`;
    if (!c.inSire && !c.inXml) return 'Sin factura';
    if (!c.inXml) return 'Sin XML';
    if ((c.xmlDetraction ?? 0) <= 0) return 'XML no declara detracción';
    if ((c.monthsToPay ?? 0) >= 2) return 'Pago 2+ meses después';
    return 'Normal';
}

/** Whole months from period YYYYMM to the date yyyy-mm-dd (null if either is missing). */
export function monthsFrom(period: string, date: string): number | null {
    if (!/^\d{6}$/.test(period) || !/^\d{4}-\d{2}/.test(date)) return null;
    return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - (Number(period.slice(0, 4)) * 12 + Number(period.slice(4, 6)));
}
