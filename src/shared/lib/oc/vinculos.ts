// Which SUNAT invoice belongs to which OC, from what the Drive files say: what was read inside the
// file, the series in its name, or a bare number in its name. Port of the old base's vinculos_oc()
// (docs/database/database.full.sql, last definition) to plain functions over the v2 rows: the
// script computes it once and saves it with guardar_calculos_oc (README «Reglas del diseño» 1).

export type Origin = 'LEGAJO' | 'CARPETA' | 'CAPTURA';
export type Evidence = 'LECTURA' | 'NOMBRE' | 'NUMERO';

/** One walk's sighting of a Drive file that belongs to an OC (oc_archivo had one row per walk). */
export interface Sighting {
    fileId: string;
    origin: Origin;
    orderId: string;
    /** The OC as the walk writes it: 0172-2026 national, 172-2026 import. */
    ocCode: string;
    folderId: string | null;
    name: string;
    parece: string | null;
    serieInName: string | null;
    /** RUCs the walk knows for the file: in its name and, from the folder walk, the approvals table's. */
    rucs: string[];
    /** What was read inside, when it was read (LEIDO). */
    read: { ruc: string | null; serie: string | null } | null;
}

/** A purchase invoice (types 01, 03, 07, 08). */
export interface Invoice {
    id: string;
    ruc: string;
    tipo: string;
    serie: string;
    numero: string;
    issuedOn: string | null;
    total: number | null;
    currency: string | null;
}

/** What the other sources say of an OC, for the alerts and for who bought it. */
export interface OrderFacts {
    isImport: boolean;
    /** The base de CG: cost centres it splits into, first date, amount, currency and supplier RUCs. */
    cg: { costCentres: number; firstDate: string | null; amount: number | null; currency: string | null; rucs: string[] } | null;
    /** The approvals table (legajo), when it lists the OC. */
    approvals: { rows: number; hasCostCentre: boolean; paymentStatus: string | null; buyer: string | null; area: string | null } | null;
    /** Where the OC's cost centre came from when CG and the approvals table do not have it. */
    folderCcSource: string | null;
}

export interface Link {
    invoiceId: string;
    orderId: string;
    evidence: Evidence;
    fileId: string;
    origin: Origin;
    alerts: string[];
    buyer: string | null;
    area: string | null;
}

const RANK: Record<Evidence, number> = { LECTURA: 1, NOMBRE: 2, NUMERO: 3 };
const ORIGIN_RANK: Record<Origin, number> = { LEGAJO: 0, CARPETA: 1, CAPTURA: 2 };
/** The base's text order (en_US): «_» and «-» before digits, then letters; so the same file wins. */
const BY_TEXT = new Intl.Collator('en');
const INVOICE_LIKE = /^(FACTURA|NOTA DE|BOLETA|RECIBO POR|COMPROBANTE)/;

/** ltrim(n, '0'), and '0' when nothing is left (the old SQL). */
export const bareNumber = (n: string) => n.replace(/^0+/, '') || '0';

/** F0O1-123 → F001-123: what the OCR reads as an O in the series is a zero. Null if it is not a series. */
export function readSerie(s: string | null): string | null {
    if (!s || !/^[FBE][A-Z0-9]{3}-\d+$/.test(s)) return null;
    const [series, n] = s.split('-');
    return `${series[0]}${series.slice(1).replace(/O/g, '0')}-${n}`;
}

/** The numbers of 3 to 8 digits in a file name (without its extension), without leading zeros. */
export function numbersInName(name: string): string[] {
    const base = name.replace(/\.[A-Za-z0-9]{2,5}$/, '');
    const out = new Set<string>();
    for (const m of base.matchAll(/(?:^|\D)(\d{3,8})(?!\d)/g)) out.add(m[1].replace(/^0+/, ''));
    return [...out];
}

type Candidate = { s: Sighting; inv: Invoice; evidence: Evidence };

/** Every invoice each sighting proves, the three ways (por_lectura, por_nombre, por_numero_unico). */
function candidates(sightings: Sighting[], invoices: Invoice[]): Candidate[] {
    const bySerie = new Map<string, Invoice[]>();
    const byRucNumber = new Map<string, Invoice[]>();
    for (const i of invoices) {
        const k = `${i.serie}|${i.numero}`;
        bySerie.set(k, [...(bySerie.get(k) ?? []), i]);
        byRucNumber.set(`${i.ruc}|${i.numero}`, [...(byRucNumber.get(`${i.ruc}|${i.numero}`) ?? []), i]);
    }
    const ofSerie = (s: string) => {
        const [serie, n] = [s.split('-')[0], bareNumber(s.split('-')[1] ?? '')];
        const list = bySerie.get(`${serie}|${n}`) ?? [];
        return { list, unique: list.length === 1 };
    };
    const out: Candidate[] = [];
    const byNumber: Candidate[] = [];
    for (const s of sightings) {
        const serie = readSerie(s.read?.serie ?? null);
        if (s.read && serie) {
            const { list, unique } = ofSerie(serie);
            for (const inv of list)
                if (inv.ruc === s.read.ruc || (!s.read.ruc && (s.rucs.includes(inv.ruc) || unique))) out.push({ s, inv, evidence: 'LECTURA' });
        }
        if (s.serieInName) {
            const { list, unique } = ofSerie(s.serieInName);
            for (const inv of list) if (s.rucs.includes(inv.ruc) || unique) out.push({ s, inv, evidence: 'NOMBRE' });
        } else if (INVOICE_LIKE.test(s.parece ?? '')) {
            const own = bareNumber(s.ocCode.split('-')[0]);
            for (const tok of numbersInName(s.name)) {
                if (['2025', '2026', own].includes(tok)) continue;
                for (const ruc of new Set(s.rucs)) for (const inv of byRucNumber.get(`${ruc}|${tok}`) ?? []) byNumber.push({ s, inv, evidence: 'NUMERO' });
            }
        }
    }
    // A bare number counts only when it is the file's one match for that OC (over every walk).
    const count = new Map<string, number>();
    for (const c of byNumber) count.set(`${c.s.fileId}|${c.s.orderId}`, (count.get(`${c.s.fileId}|${c.s.orderId}`) ?? 0) + 1);
    return [...out, ...byNumber.filter((c) => count.get(`${c.s.fileId}|${c.s.orderId}`) === 1)];
}

/** One link per OC and invoice: the surest way; at equal way, the approvals table, then the folder walk. */
function best(all: Candidate[]): Candidate[] {
    const cmp = (x: Candidate, y: Candidate) =>
        RANK[x.evidence] - RANK[y.evidence] || ORIGIN_RANK[x.s.origin] - ORIGIN_RANK[y.s.origin] || BY_TEXT.compare(x.s.fileId, y.s.fileId);
    const out = new Map<string, Candidate>();
    for (const c of all) {
        const k = `${c.s.orderId}|${c.inv.id}`;
        const cur = out.get(k);
        if (!cur || cmp(c, cur) < 0) out.set(k, c);
    }
    return [...out.values()];
}

const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86400_000).toISOString().slice(0, 10);

/** The alerts of a link (the old `alertas`, one text per alert). */
export function alertsOf(inv: Invoice, f: OrderFacts | undefined, origin: Origin): string[] {
    const out: string[] = [];
    const cg = f?.cg ?? null;
    const legajo = f?.approvals ?? null;
    const ownCc = origin === 'CARPETA' ? (f?.folderCcSource ?? null) : null;
    if (!cg && !legajo?.hasCostCentre) {
        if (['PROYECTO', 'NOMBRE', 'ADMINISTRATIVO', 'MANUAL'].includes(ownCc ?? ''))
            out.push('OC no está en la base de CG (centro de costo por la carpeta del proyecto)');
        else if (!ownCc || ownCc === 'SIN_ASIGNAR') out.push('OC no está en la base de CG');
    }
    if (cg && cg.costCentres > 1 && !legajo?.hasCostCentre) out.push(`la OC reparte en ${cg.costCentres} centros de costo`);
    if (cg?.rucs.length && !cg.rucs.includes(inv.ruc))
        out.push(cg.rucs.some((r) => r.length !== 11) ? 'RUC mal escrito en la base de CG' : 'emisor distinto al proveedor de la OC');
    if (cg?.firstDate && inv.issuedOn && inv.issuedOn < addDays(cg.firstDate, -7)) out.push('factura anterior a la OC');
    if (
        inv.tipo === '01' &&
        cg?.amount &&
        cg.amount > 0 &&
        inv.currency === cg.currency &&
        (inv.total ?? 0) > cg.amount * (inv.currency === 'PEN' ? 1.18 : 1) * 1.1
    )
        out.push('factura mayor que la OC');
    if (legajo?.paymentStatus === 'ANULADA') out.push('la OC está anulada en el cuadro de aprobaciones');
    return out;
}

/**
 * The links between invoices and OCs. `facts` by order id. The approvals table counts for a
 * sighting of the folder or legajo walk; for one of the retired CAPTURA walk, only if the OC is
 * national and listed once (the capture could not tell imports apart).
 */
export function linkInvoices(sightings: Sighting[], invoices: Invoice[], facts: Map<string, OrderFacts>): Link[] {
    return best(candidates(sightings, invoices)).map(({ s, inv, evidence }) => {
        const f = facts.get(s.orderId);
        const approvals = f?.approvals && (s.origin !== 'CAPTURA' || (!f.isImport && f.approvals.rows === 1)) ? f.approvals : null;
        const seen = f ? { ...f, approvals } : undefined;
        return {
            invoiceId: inv.id,
            orderId: s.orderId,
            evidence,
            fileId: s.fileId,
            origin: s.origin,
            alerts: alertsOf(inv, seen, s.origin),
            buyer: approvals?.buyer ?? null,
            area: approvals?.area ?? null,
        };
    });
}
