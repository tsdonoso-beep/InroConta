// The numbers of the Detracciones screen, from the proofs, the invoices without one and the
// filters. The port of CASOS_DET, BIENES_DET, pintarDetr(), pintarDetrKpis(), pintarDetrMeses(),
// pintarDetrCasos(), pintarDetrPlazo(), pintarDetrTop(), pintarDetrCodigos() and the sort of
// pintarDetrTabla() of the Apps Script view (VistaEjecutivaPagina.html), minus the HTML.
import { dateInPeriod, inPeriod, monthsTouched, parsePeriod } from '../../../../shared/period.ts';
import type { Detractions, Direction, MissingProof, Proof } from '../entities/Proof.ts';

export type CaseColor = 'danger' | 'primary' | 'warning' | 'success' | 'muted';

export interface CaseInfo {
    /** The case's prefix («Factura de» covers «Factura de 2025»), or the case itself if unknown. */
    name: string;
    color: CaseColor;
    description: string;
    order: number;
}

/** The cases, in the base's order (the first that fits), with their colour and what they mean. */
export const CASES: readonly Omit<CaseInfo, 'order'>[] = [
    { name: 'Revisar monto', color: 'danger', description: 'Lo depositado difiere en más de S/ 1 de la detracción de la factura' },
    { name: 'Factura de', color: 'primary', description: 'Depósito de una factura de un año anterior' },
    { name: 'Sin factura', color: 'danger', description: 'La factura no está ni en el SIRE ni en los XML' },
    { name: 'Sin XML', color: 'warning', description: 'Está en el SIRE, pero falta su XML (no sale en el DETALLE)' },
    { name: 'XML no declara detracción', color: 'warning', description: 'Hay XML, pero no trae la detracción' },
    { name: 'Pago 2+ meses después', color: 'warning', description: 'Se depositó dos meses o más después del período' },
    { name: 'Normal', color: 'success', description: 'Todo cuadra' },
];

export function caseOf(c: string): CaseInfo {
    const i = CASES.findIndex((k) => c.startsWith(k.name));
    return i >= 0 ? { ...CASES[i], order: i } : { name: c, color: 'muted', description: '', order: 99 };
}

const byCaseOrder = (a: string, b: string) => caseOf(a).order - caseOf(b).order || a.localeCompare(b);

/** The proofs that ask for a correction: the deposit does not match its invoice, or there is no invoice. */
export const toCorrect = (c: string) => c === 'Revisar monto' || c === 'Sin factura';

/** Goods and services subject to the SPOT (annexes of R.S. 183-2004/SUNAT, as in migration 053). */
export const GOODS: Record<string, string> = {
    '001': 'Azúcar y melaza de caña',
    '003': 'Alcohol etílico',
    '004': 'Recursos hidrobiológicos',
    '005': 'Maíz amarillo duro',
    '007': 'Caña de azúcar',
    '008': 'Madera',
    '009': 'Arena y piedra',
    '010': 'Residuos, subproductos, desechos',
    '011': 'Bienes gravados por renuncia a la exoneración',
    '012': 'Intermediación laboral y tercerización',
    '014': 'Carnes y despojos comestibles',
    '016': 'Aceite de pescado',
    '017': 'Harina, polvo y pellets de pescado',
    '019': 'Arrendamiento de bienes muebles',
    '020': 'Mantenimiento y reparación de bienes muebles',
    '021': 'Movimiento de carga',
    '022': 'Otros servicios empresariales',
    '024': 'Comisión mercantil',
    '025': 'Fabricación de bienes por encargo',
    '026': 'Transporte de personas',
    '027': 'Transporte de carga',
    '030': 'Contratos de construcción',
    '031': 'Oro gravado con el IGV',
    '032': 'Páprika y otros capsicum',
    '034': 'Minerales metálicos no auríferos',
    '035': 'Bienes exonerados del IGV',
    '036': 'Oro y minerales exonerados del IGV',
    '037': 'Demás servicios gravados con el IGV',
    '039': 'Minerales no metálicos',
    '040': 'Bien inmueble gravado con el IGV',
    '041': 'Plomo',
};

/** «22» → «022 · Otros servicios empresariales». */
export function goodsLabel(code: string): string {
    let c = code || '';
    if (/^\d+$/.test(c)) c = `00${c}`.slice(-3);
    return c ? `${c} · ${GOODS[c] ?? 'otro'}` : '—';
}

/** The month of payment, YYYYMM ('' without a date). */
export const paidMonth = (p: Proof) => (p.paidOn ? p.paidOn.slice(0, 4) + p.paidOn.slice(5, 7) : '');

/** The other party: the buyer on a sale (we received), the supplier on a purchase. */
export const counterpart = (p: Proof) =>
    p.direction === 'venta' ? { id: p.buyerDoc, name: p.buyerName || p.buyerDoc } : { id: p.supplierRuc, name: p.supplierName || p.supplierRuc };

/** «F001-00123» → «F001-123». */
export const docNumber = (series: string, number: string) => `${(series || '').toUpperCase()}-${(number || '').replace(/^0+(?=\d)/, '')}`;

const plain = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const proofText = (p: Proof) =>
    plain([p.constancia, p.supplierRuc, p.supplierName, p.buyerDoc, p.buyerName, docNumber(p.series, p.number), p.operation, p.case].join(' '));
const missingText = (m: MissingProof) => plain([m.ruc, m.name, docNumber(m.series, m.number)].join(' '));
const sum = <T>(rows: T[], pick: (r: T) => number | null) => rows.reduce((a, r) => a + (pick(r) ?? 0), 0);
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);

export interface DetractionFilters {
    /** '' = purchases and sales. */
    direction: Direction | '';
    /** A period code (shared/period.ts), '' = every date. */
    period: string;
    /** What the period is about: the date of payment, or the invoice's SUNAT period. */
    basis: 'pago' | 'periodo';
    case: string;
    text: string;
}
export const DEFAULT_FILTERS: DetractionFilters = { direction: 'compra', period: '', basis: 'pago', case: '', text: '' };

/** The months with data for the period picker: of payment, or of the invoice's period. */
export function monthOptions(d: Detractions, basis: DetractionFilters['basis']): string[] {
    const months = basis === 'pago' ? d.proofs.map(paidMonth) : [...d.proofs.map((p) => p.period), ...d.missing.map((m) => m.period)];
    return [...new Set(months.filter((p) => /^\d{6}$/.test(p)))];
}

export interface Filtered {
    /** Without the month filter nor the case one (for the bars by month, which apply the case themselves). */
    anyMonth: Proof[];
    /** Without the case filter (for the cases' card and select). */
    anyCase: Proof[];
    proofs: Proof[];
    missing: MissingProof[];
    /** The cases of `anyCase` with how many proofs each, in the base's order; the chosen one even at 0. */
    cases: { name: string; count: number }[];
}

export function filterDetractions(d: Detractions, f: DetractionFilters): Filtered {
    const ws = plain(f.text)
        .split(/\s+/)
        .filter((w) => w.length > 1);
    const hasText = (t: string) => ws.every((w) => t.includes(w));
    const per = parsePeriod(f.period);
    // By invoice period, a day or a range picks the periods (months) it touches: an invoice period has no day.
    const touched = monthsTouched(per);
    const inProof = (p: Proof) => !per || (f.basis === 'pago' ? dateInPeriod(per, p.paidOn) : touched.includes(p.period));
    const ofDirection = (dir: Direction) => !f.direction || dir === f.direction;
    const anyMonth = d.proofs.filter((p) => ofDirection(p.direction) && hasText(proofText(p)));
    const anyCase = anyMonth.filter(inProof);
    const proofs = anyCase.filter((p) => !f.case || p.case === f.case);
    // The month of payment does not apply to an invoice that has none.
    const missing = d.missing.filter(
        (m) => ofDirection(m.direction) && hasText(missingText(m)) && (f.basis === 'pago' || !per || inPeriod(per, m.period, m.issuedOn)),
    );
    const count = new Map<string, number>();
    for (const p of anyCase) count.set(p.case, (count.get(p.case) ?? 0) + 1);
    const names = [...count.keys()].sort(byCaseOrder);
    if (f.case && !count.has(f.case)) names.push(f.case);
    return { anyMonth, anyCase, proofs, missing, cases: names.map((name) => ({ name, count: count.get(name) ?? 0 })) };
}

export interface DetractionKpis {
    deposited: number;
    count: number;
    parties: number;
    purchases: number;
    sales: number;
    /** Invoices with detraction since `since` that have their proof, of all of them. */
    covered: { with: number; of: number; pct: number };
    atypical: number;
    /** The three most frequent atypical cases (by prefix), the most frequent first. */
    topCases: { name: string; count: number }[];
    toCorrect: number;
    missing: { count: number; amount: number; old: number };
    onTime: { count: number; of: number; pct: number };
}

export function detractionKpis(proofs: Proof[], missing: MissingProof[], since: string): DetractionKpis {
    const atypical = proofs.filter((p) => p.case !== 'Normal');
    const perCase = new Map<string, number>();
    for (const p of atypical) {
        const k = caseOf(p.case).name;
        perCase.set(k, (perCase.get(k) ?? 0) + 1);
    }
    const covered = proofs.filter((p) => p.period >= since).length;
    const timed = proofs.map((p) => p.monthsToPay).filter((m): m is number => m != null);
    const onTime = timed.filter((m) => m <= 1).length;
    return {
        deposited: sum(proofs, (p) => p.deposited),
        count: proofs.length,
        parties: new Set(proofs.map((p) => counterpart(p).id)).size,
        purchases: sum(
            proofs.filter((p) => p.direction === 'compra'),
            (p) => p.deposited,
        ),
        sales: sum(
            proofs.filter((p) => p.direction === 'venta'),
            (p) => p.deposited,
        ),
        covered: { with: covered, of: covered + missing.length, pct: pct(covered, covered + missing.length) },
        atypical: atypical.length,
        topCases: [...perCase.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name, count]) => ({ name, count })),
        toCorrect: proofs.filter((p) => toCorrect(p.case)).length,
        missing: {
            count: missing.length,
            amount: sum(missing, (m) => m.detraction),
            old: missing.filter((m) => m.monthsSinceIssue != null && m.monthsSinceIssue >= 2).length,
        },
        onTime: { count: onTime, of: timed.length, pct: pct(onTime, timed.length) },
    };
}

export interface PaymentMonth {
    month: string;
    purchases: number;
    sales: number;
    count: number;
    atypical: number;
}

/** The deposits by month of payment, the last 14 months. */
export function paymentMonths(proofs: Proof[]): PaymentMonth[] {
    const g = new Map<string, PaymentMonth>();
    for (const p of proofs) {
        const month = paidMonth(p);
        if (!month) continue;
        const o = g.get(month) ?? { month, purchases: 0, sales: 0, count: 0, atypical: 0 };
        if (p.direction === 'venta') o.sales += p.deposited ?? 0;
        else o.purchases += p.deposited ?? 0;
        o.count++;
        if (p.case !== 'Normal') o.atypical++;
        g.set(month, o);
    }
    return [...g.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-14);
}

/** The proofs by case, in the base's order. */
export function byCase(proofs: Proof[]): { name: string; count: number; amount: number }[] {
    const g = new Map<string, { name: string; count: number; amount: number }>();
    for (const p of proofs) {
        const o = g.get(p.case) ?? { name: p.case, count: 0, amount: 0 };
        o.count++;
        o.amount += p.deposited ?? 0;
        g.set(p.case, o);
    }
    return [...g.values()].sort((a, b) => byCaseOrder(a.name, b.name));
}

/** The months between the invoice's period and the payment, in four buckets (proofs with that datum). */
export function paymentDelay(proofs: Proof[]): { label: string; color: CaseColor; count: number; pct: number }[] {
    const timed = proofs.map((p) => p.monthsToPay).filter((m): m is number => m != null);
    if (!timed.length) return [];
    const buckets: [string, CaseColor, (m: number) => boolean][] = [
        ['En el mismo mes', 'primary', (m) => m <= 0],
        ['El mes siguiente (lo normal)', 'success', (m) => m === 1],
        ['2 meses después', 'warning', (m) => m === 2],
        ['3 meses o más', 'danger', (m) => m >= 3],
    ];
    return buckets.map(([label, color, fits]) => {
        const count = timed.filter(fits).length;
        return { label, color, count, pct: pct(count, timed.length) };
    });
}

/** The 8 suppliers or clients with the most deposited, with their share of the total. */
export function topCounterparts(proofs: Proof[]): { id: string; name: string; amount: number; count: number; pct: number }[] {
    const g = new Map<string, { id: string; name: string; amount: number; count: number }>();
    for (const p of proofs) {
        const c = counterpart(p);
        const o = g.get(c.id) ?? { id: c.id, name: c.name, amount: 0, count: 0 };
        o.amount += p.deposited ?? 0;
        o.count++;
        g.set(c.id, o);
    }
    const total = sum(proofs, (p) => p.deposited);
    return [...g.values()]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8)
        .map((o) => ({ ...o, pct: pct(o.amount, total) }));
}

/** The 8 goods or services with the most deposited. */
export function byGoods(proofs: Proof[]): { label: string; amount: number; count: number }[] {
    const g = new Map<string, { label: string; amount: number; count: number }>();
    for (const p of proofs) {
        const label = goodsLabel(p.goodsCode);
        const o = g.get(label) ?? { label, amount: 0, count: 0 };
        o.amount += p.deposited ?? 0;
        o.count++;
        g.set(label, o);
    }
    return [...g.values()].sort((a, b) => b.amount - a.amount).slice(0, 8);
}

/** The proofs for the table: the latest payment first. */
export const latestFirst = (proofs: Proof[]) => [...proofs].sort((a, b) => (a.paidOn < b.paidOn ? 1 : a.paidOn > b.paidOn ? -1 : 0));

/** Deposited − the invoice's detraction, when the invoice declares one (null otherwise). */
export const depositDifference = (p: Proof) => (p.invoiceDetraction != null && p.invoiceDetraction > 0 ? (p.deposited ?? 0) - p.invoiceDetraction : null);
