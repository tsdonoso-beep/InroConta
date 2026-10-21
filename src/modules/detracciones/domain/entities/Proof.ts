// The SPOT detraction proofs (constancias, Banco de la Nación) and the invoices with detraction
// that have none: the rows of the DETRACCIONES and DETRACCIONES SIN CONSTANCIA tabs of the book
// (detracciones_hoja and detracciones_sin_constancia, migration 067).

export type Direction = 'compra' | 'venta';

export interface Proof {
    /** «Normal», «Revisar monto», «Factura de 2025»… (the first that fits, in the base's order). */
    case: string;
    /** The invoice's period, YYYYMM. */
    period: string;
    direction: Direction;
    /** yyyy-mm-dd. */
    paidOn: string;
    /** Months between the invoice's period and the payment. */
    monthsToPay: number | null;
    constancia: string;
    docType: string;
    series: string;
    number: string;
    supplierRuc: string;
    supplierName: string;
    buyerDoc: string;
    buyerName: string;
    /** The code of the annex of R.S. 183-2004/SUNAT. */
    goodsCode: string;
    deposited: number | null;
    invoiceDetraction: number | null;
    /** Where the invoice was found (XML, SIRE) or «No encontrada». */
    invoiceIn: string;
    invoiceTotal: number | null;
    currency: string;
    account: string;
    xmlAccount: string;
    operation: string;
    proofPdf: string;
    proofHtml: string;
    invoicePdf: string;
    paidAt: string;
    /** The issued CRE that also covers the invoice («E001-2845»): an ERROR, '' when none. */
    retentionCre: string;
}

export interface MissingProof {
    direction: Direction;
    period: string;
    /** yyyy-mm-dd. */
    issuedOn: string;
    monthsSinceIssue: number | null;
    ruc: string;
    name: string;
    docType: string;
    series: string;
    number: string;
    total: number | null;
    currency: string;
    detraction: number | null;
    /** XML or SIRE. */
    source: string;
    invoicePdf: string;
    /** The issued CRE that covers the invoice («E001-2845»): an ERROR, '' when none. */
    retentionCre: string;
}

export interface Detractions {
    proofs: Proof[];
    missing: MissingProof[];
    /** Since when the invoices without proof are looked for (p_desde). */
    since: string;
    readAt: string;
}
