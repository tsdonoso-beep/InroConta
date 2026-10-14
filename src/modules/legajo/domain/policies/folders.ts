// Legajo por OC: the filters, KPIs, «hidden» folders and buyer ranking of the folder list, and the
// 12 documents of an opened folder with their mark. Port of pintarLegajo(), arrancarBase() (the
// buyer and company filters) and detalleCarpeta() of VistaEjecutivaPagina.html.
import type { Folder } from '../entities/Folder.ts';
import type { FolderDetail, FolderFile } from '../entities/FolderDetail.ts';

/** '' = all · '0' = nacionales · '1' = COMEX (the old segment's values). */
export type FolderArea = '' | '0' | '1';
/** INC = incomplete · SUBIR = something to upload · '' = all. */
export type FolderState = 'INC' | 'SUBIR' | 'OK' | 'VACÍA' | '';

export const ALL_COMPANIES = '*';
export const UNKNOWN_BUYER = '-';
export const DEFAULT_COMPANY = 'INROPRIN';

export interface FolderFilters {
    area: FolderArea;
    state: FolderState;
    /** A company, or ALL_COMPANIES. */
    company: string;
    /** '' = all, UNKNOWN_BUYER = folders with no buyer. */
    buyer: string;
    text: string;
}

export const DEFAULT_FOLDER_FILTERS: FolderFilters = { area: '', state: 'INC', company: DEFAULT_COMPANY, buyer: '', text: '' };

const plainText = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const searchWords = (q: string) =>
    plainText(q)
        .split(/\s+/)
        .filter((w) => w.length > 1);

/** The known buyers, sorted, for the filter. */
export const buyersOf = (folders: Folder[]) => [...new Set(folders.map((f) => f.buyer).filter(Boolean))].sort();

/** The companies with how many folders each: INROPRIN first, then each consortium. */
export function companiesOf(folders: Folder[]): { company: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const f of folders) counts.set(f.company, (counts.get(f.company) ?? 0) + 1);
    return [...counts]
        .sort(([a], [b]) => (a === DEFAULT_COMPANY ? -1 : b === DEFAULT_COMPANY ? 1 : a.localeCompare(b)))
        .map(([company, count]) => ({ company, count }));
}

/** The chosen company, or all of them when no folder is of it (no INROPRIN folders at all). */
export const effectiveCompany = (folders: Folder[], company: string) =>
    company === ALL_COMPANIES || folders.some((f) => f.company === company) ? company : ALL_COMPANIES;

const passesCompany = (f: Folder, company: string) => company === ALL_COMPANIES || f.company === company;
const passesState = (f: Folder, state: FolderState) =>
    state === 'SUBIR' ? !!f.toUpload : state === 'INC' ? f.status === 'INCOMPLETA' : !state || f.status === state;
const passesArea = (f: Folder, area: FolderArea) => area === '' || (f.isImport ? '1' : '0') === area;

export interface FolderKpis {
    total: number;
    distinctOcs: number;
    complete: number;
    /** The sheet of Compras, COMEX and Almacén is loaded: the KPIs say what exists elsewhere. */
    withSources: boolean;
    missingNowhere: { total: number; guide: number; invoice: number; act: number; dam: number; costing: number };
    toUpload: { total: number; guideInWarehouse: number; damOrCostingInComex: number; invoiceInSunat: number };
    /** On `missing`, for a base without the sources. */
    missing: { guide: number; invoice: number; act: number; dam: number; costing: number };
    withoutSunatInvoice: number;
}

export interface HiddenFolders {
    count: number;
    /** [«completa», 3] in the order they appear; the label already in plural when it applies. */
    byKind: [string, number][];
    /** The first five, «OC-123» or «OC-123 COMEX». */
    sample: string[];
    otherCompany: boolean;
}

export interface BuyerRank {
    buyer: string;
    count: number;
    complete: number;
    pct: number;
}

export interface FolderList {
    list: Folder[];
    hidden: HiddenFolders | null;
    kpis: FolderKpis;
    ranking: BuyerRank[];
}

function folderKpis(scope: Folder[]): FolderKpis {
    const on = (field: 'missing' | 'missingNowhere' | 'toUpload', re: RegExp) => scope.filter((f) => re.test(f[field])).length;
    return {
        total: scope.length,
        distinctOcs: new Set(scope.map((f) => f.oc)).size,
        complete: scope.filter((f) => f.status === 'OK').length,
        withSources: scope.some((f) => f.statusDetail),
        missingNowhere: {
            total: scope.filter((f) => f.missingNowhere).length,
            guide: on('missingNowhere', /Guía/),
            invoice: on('missingNowhere', /Factura/),
            act: on('missingNowhere', /Acta/),
            dam: on('missingNowhere', /DAM/),
            costing: on('missingNowhere', /costeo/),
        },
        toUpload: {
            total: scope.filter((f) => f.toUpload).length,
            guideInWarehouse: on('toUpload', /Guía de remisión \(Almacén/),
            damOrCostingInComex: on('toUpload', /(DAM|costeo) \(COMEX/),
            invoiceInSunat: on('toUpload', /Factura \(SUNAT/),
        },
        missing: {
            guide: on('missing', /Guía/),
            invoice: on('missing', /Factura/),
            act: on('missing', /Acta/),
            dam: on('missing', /DAM/),
            costing: on('missing', /costeo/),
        },
        withoutSunatInvoice: scope.filter((f) => !f.sunatInvoices).length,
    };
}

/** Per buyer (with the area and company filters), the share of folders complete: best first, «por identificar» last. */
function buyerRanking(folders: Folder[], area: FolderArea, company: string): BuyerRank[] {
    const g = new Map<string, { count: number; complete: number }>();
    for (const f of folders) {
        if (!passesArea(f, area) || !passesCompany(f, company)) continue;
        const k = f.buyer || UNKNOWN_BUYER;
        const c = g.get(k) ?? { count: 0, complete: 0 };
        c.count++;
        if (f.status === 'OK') c.complete++;
        g.set(k, c);
    }
    return [...g]
        .sort(([a, x], [b, y]) => (a === UNKNOWN_BUYER ? 1 : b === UNKNOWN_BUYER ? -1 : y.complete / y.count - x.complete / x.count || y.count - x.count))
        .map(([buyer, c]) => ({ buyer, ...c, pct: Math.round((100 * c.complete) / c.count) }));
}

/** What the text finds but the state or company filter hides (e.g. a complete OC under «Incompletas»). */
function hiddenFolders(found: Folder[], f: FolderFilters): HiddenFolders | null {
    if (!found.length) return null;
    const byKind = new Map<string, number>();
    for (const x of found) {
        const k = !passesCompany(x, f.company) ? 'de otra empresa' : x.status === 'OK' ? 'completa' : x.status === 'VACÍA' ? 'vacía' : 'incompleta';
        byKind.set(k, (byKind.get(k) ?? 0) + 1);
    }
    return {
        count: found.length,
        byKind: [...byKind].map(([k, n]) => [n === 1 || k === 'de otra empresa' ? k : `${k}s`, n]),
        sample: found.slice(0, 5).map((x) => x.oc + (x.isImport ? ' COMEX' : '')),
        otherCompany: found.some((x) => !passesCompany(x, f.company)),
    };
}

export function folderList(folders: Folder[], f: FolderFilters): FolderList {
    const words = searchWords(f.text);
    const passesText = (x: Folder) => {
        if (!words.length) return true;
        const t = plainText([x.oc, x.supplier, x.project, x.folderName, x.buyer, x.missing, x.documents, x.toUpload, x.company].join(' '));
        return words.every((w) => t.includes(w));
    };
    const ofAreaAllCompanies = folders.filter((x) => passesArea(x, f.area) && (f.buyer === '' || (f.buyer === UNKNOWN_BUYER ? !x.buyer : x.buyer === f.buyer)));
    const ofArea = ofAreaAllCompanies.filter((x) => passesCompany(x, f.company));
    return {
        list: ofArea.filter((x) => passesState(x, f.state) && passesText(x)),
        hidden: words.length
            ? hiddenFolders(
                  ofAreaAllCompanies.filter((x) => !(passesState(x, f.state) && passesCompany(x, f.company)) && passesText(x)),
                  f,
              )
            : null,
        kpis: folderKpis(ofArea),
        ranking: buyerRanking(folders, f.area, f.company),
    };
}

/** The latest of a list of ISO instants, or ''. */
export const latestInstant = (values: string[]) => values.reduce((m, v) => (v > m ? v : m), '');

/** «Guía de remisión (Almacén: …) | DAM (COMEX: …)» → «Guía de remisión, DAM». */
export const toUploadNames = (toUpload: string) =>
    toUpload
        .split(' | ')
        .filter(Boolean)
        .map((t) => t.replace(/ \(.*$/, ''))
        .join(', ');

// ── The opened folder ──

/** s = has it · n = missing and found nowhere · p = exists elsewhere, to upload · x = not for it · o = not there, not required. */
export type DocMark = 's' | 'n' | 'p' | 'x' | 'o';

export interface LegajoDoc {
    key: string;
    label: string;
    mark: DocMark;
    files: FolderFile[];
    /** Where it exists, when the mark is p. */
    evidence: { evidencia: string; enlace: string | null } | null;
}

/** The 12 documents of the legajo, in order; importOnly = only for imports. */
const LEGAJO_DOCS: { key: string; label: string; importOnly?: boolean }[] = [
    { key: 'FACTURA', label: 'Factura' },
    { key: 'OC', label: 'OC' },
    { key: 'SWIFT', label: 'SWIFT', importOnly: true },
    { key: 'GUIA', label: 'Guía de remisión' },
    { key: 'DAM', label: 'DAM', importOnly: true },
    { key: 'COSTEO', label: 'Cuadro de costeo', importOnly: true },
    { key: 'REQ', label: 'Requerimiento' },
    { key: 'CONTRATO', label: 'Contrato' },
    { key: 'COTIZACION', label: 'Cotización' },
    { key: 'PROFORMA', label: 'Proforma' },
    { key: 'CORREO', label: 'Correos' },
    { key: 'ACTA', label: 'Acta de conformidad' },
];

// The proof of payment: SWIFT abroad; in nacionales the bank payment with its operation number.
const isPayment = (a: FolderFile) => a.docs.includes('SWIFT') || /^PAGO/.test(a.parece ?? '');

export const isImportFolder = (d: FolderDetail) => d.carpeta.procedencia === 'Importación';

export function legajoDocs(d: FolderDetail): LegajoDoc[] {
    const imp = isImportFolder(d);
    const missing = d.carpeta.le_falta ?? '';
    const exists = new Map((d.fuentes?.por_subir ?? []).map((e) => [e.doc, { evidencia: e.evidencia, enlace: e.enlace }]));
    if (d.facturas.length) exists.set('FACTURA', { evidencia: `SUNAT: ${d.facturas.map((f) => f.comprobante).join(', ')}`, enlace: null });
    return LEGAJO_DOCS.map((k) => {
        // In nacionales there is no SWIFT: its place is the payment with its operation number (not required;
        // meeting with Contabilidad, 06/10/2026).
        const domesticPayment = k.key === 'SWIFT' && !imp;
        const label = domesticPayment ? 'Pago de OC (N.º de operación)' : k.label;
        const files = d.archivos.filter((a) => (k.key === 'SWIFT' ? isPayment(a) : a.docs.includes(k.key)));
        const lacks = missing.includes(label);
        const mark: DocMark = files.length ? 's' : domesticPayment ? 'o' : k.importOnly && !imp ? 'x' : lacks && exists.has(k.key) ? 'p' : lacks ? 'n' : 'o';
        return { key: k.key, label, mark, files, evidence: mark === 'p' ? (exists.get(k.key) ?? null) : null };
    });
}

/** The files that are none of the 12 documents (nor a payment). */
export const otherFiles = (d: FolderDetail) => d.archivos.filter((a) => !a.docs.length && !isPayment(a));
