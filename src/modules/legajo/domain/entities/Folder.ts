// The OC folders of the two mother folders (nacionales and importaciones) as the robot reads them
// every night (scripts/carpetas-oc.mts), with what Compras, COMEX and Almacén say of each OC;
// the SUNAT invoices that look like they lack an OC; and what changed in the folders.

/** One OC folder (carpetas_madre_fuentes_json, migration 058 and later). */
export interface Folder {
    isImport: boolean;
    /** Compras nacionales or COMEX. */
    area: string;
    buyer: string;
    paymentStatus: string;
    paymentForm: string;
    oc: string;
    supplier: string;
    project: string;
    folderName: string;
    folderId: string;
    /** OK, INCOMPLETA or VACÍA. */
    status: string;
    /** What the legajo lacks, «Guía de remisión, Factura». */
    missing: string;
    documents: string;
    sunatInvoices: number;
    costCenter: string;
    lastChange: string;
    lastChangeAt: string;
    loadedAt: string;
    statusDetail: string;
    /** What exists elsewhere (Almacén, COMEX, SUNAT) and only needs uploading, «Guía de remisión (Almacén: …) | …». */
    toUpload: string;
    /** What is missing and found nowhere. */
    missingNowhere: string;
    buyerSource: string;
    ocDate: string;
    amountPen: number | null;
    warehouseEntry: string;
    comexStatus: string;
    plantArrival: string;
    sourceChanges: number;
    /** INROPRIN or a consortium (migration 061). */
    company: string;
    companySource: string;
}

/** A SUNAT invoice tied to no OC that looks like it should be (facturas_sin_oc_json). */
export interface NoOcInvoice {
    /** ALTA: the supplier works with OCs · MEDIA: a high amount that is not a typical expense without OC. */
    signal: string;
    reason: string;
    likelyArea: string;
    likelyBuyer: string;
    issuedOn: string;
    ruc: string;
    name: string;
    number: string;
    currency: string;
    total: number;
    supplierOcs: string;
    pdf: string;
}

/** What the robot saw change in a folder (carpeta_cambio). */
export interface FolderChange {
    at: string;
    isImport: boolean;
    oc: string;
    type: string;
    detail: string;
    folderId: string;
}

/** When the robot read the private sheet of Compras, COMEX and Almacén (fuente_copia). */
export interface SourceCopy {
    pestana: string;
    filas: number | null;
    fin: string | null;
    resultado: string | null;
    leido_en: string;
}

// Three reads, one per screen: the folders cost ~3.5 s in the base, the invoices without OC ~1.7 s
// and the changes ~0.3 s (measured 13/10/2026), so a screen never waits for another one's data.
export interface FoldersRead {
    folders: Folder[];
    copies: SourceCopy[];
    readAt: string;
}
export interface NoOcRead {
    noOc: NoOcInvoice[];
    readAt: string;
}
export interface ChangesRead {
    /** The last 500. */
    changes: FolderChange[];
    readAt: string;
}

/** The id of a Drive file link (…/file/d/ID/…, …?id=ID), or ''. */
export function fileIdOf(url: string | null | undefined): string {
    const u = url ?? '';
    const m = /\/d\/([\w-]{20,})/.exec(u) || /[?&]id=([\w-]{20,})/.exec(u);
    return m ? m[1] : '';
}

/** The id of a Drive folder link, or ''. */
export function folderIdOf(url: string | null | undefined): string {
    const m = /folders\/([\w-]{10,})/.exec(url ?? '');
    return m ? m[1] : '';
}
