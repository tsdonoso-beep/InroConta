// A comprobante de retención (CRE): INROPRIN is a withholding agent, so when it pays a supplier it
// keeps 3 % of the IGV-inclusive amount and issues a CRE (series E001). One CRE covers one or more
// invoices; an invoice paid in parts has one CRE per payment. A reverted CRE does not count.

export type RetentionStatus = 'EMITIDO' | 'REVERTIDO';

/** One invoice a CRE covers, with the payment it withheld from. */
export interface RetentionDoc {
    /** «E001-181». */
    number: string;
    /** yyyy-mm-dd. */
    issuedOn: string;
    total: number | null;
    currency: string;
    paidOn: string;
    paid: number | null;
    retained: number | null;
    /** False when the invoice is not in the base yet (the CRE names it, the robot has not read it). */
    found: boolean;
    /** The detraction the invoice declares (XML or SIRE); an invoice has one or the other, not both. */
    detraction: number | null;
    invoicePdf: string;
}

export interface Retention {
    /** «E001-3254». */
    cre: string;
    /** yyyy-mm-dd. */
    issuedOn: string;
    /** YYYYMM: the month it is declared in. */
    period: string;
    supplierRuc: string;
    supplierName: string;
    base: number | null;
    retained: number | null;
    paid: number | null;
    status: RetentionStatus;
    revertedOn: string;
    revertReason: string;
    pdf: string;
    xml: string;
    docs: RetentionDoc[];
}

export interface Retentions {
    retentions: Retention[];
    /** ISO instant they were read. */
    readAt: string;
}
