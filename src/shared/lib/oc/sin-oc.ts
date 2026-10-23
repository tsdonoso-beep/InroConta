// The received invoices that look like they lack an OC, and why. Port of the old base's
// facturas_sin_oc() and gasto_tipico_sin_oc() (docs/database/database.full.sql, last definitions):
// the script computes it with the links (vinculos.ts) and saves it in comprobante.sin_oc_*.

/** The rough exchange rate the old function used to rank amounts in dollars. */
const USD_TO_PEN = 3.75;

const TYPICAL: Array<[RegExp, string]> = [
    [/(BANCO|FINANCIERA|CAJA MUNICIPAL|CAJA RURAL|SCOTIABANK|INTERBANK)/, 'Banco (comisiones)'],
    [/(SEGUROS|REASEGUROS|PRESTADORA DE SALUD| EPS |SANITAS|INSUR S)/, 'Seguro / EPS'],
    [/(COMBUSTIBLE|GRIFO|REPSOL|PRIMAX|PECSA|COESTI|PETRO|LLAMA GAS| GAS S)/, 'Combustible'],
    [/(HOTEL|HOSTAL|HOSPEDAJE|HOTELERA| HTL |ALOJAMIENTO|RESORT)/, 'Hospedaje'],
    [/(PEAJE|RED VIAL|LIMA EXPRESA|CONCESIONARIA VIAL|RUTAS DE LIMA|COVIPERU|PARQUEO|ESTACIONAMIENTO|URBANISTICAS OPERADORA)/, 'Peaje / estacionamiento'],
];
const TRAVEL =
    /(TURISMO|TOURS?|TRAVEL|BUS |EXPRESO|CRUZERO|CIVA|ORMENO|FLECHA|LATAM|JETSMART|SKY AIRLINE|AVIANCA|TAXI|TRANSPORTES? .*(PASAJ|TURIS)|EMPRESA DE TRANSPORTES)/;
const AFTER_TRAVEL: Array<[RegExp, string]> = [
    [
        /(RESTAURANT|CHIFA|POLLO|CHICKEN|POLLERIA|CAFE|JUGUERIA|SANGUCHE|SANDWICH|PASTELERIA|BAKERY|PANADERIA|BAGUETERIA|FOOD|GOURMET|BEMBOS|ARCOS DORADOS|DELOSI|SNACK|DELIVERY HERO|CEVICHERIA|PARRILLA|PIZZ|BURGER|KFC|STARBUCKS|FRANQUICIAS|SUCULENTO|SABOR)/,
        'Comida',
    ],
    [
        /(TAMBO|OXXO|MAYORSA|HARD DISCOUNT|SUPERMERCADO|CENCOSUD|PLAZA VEA|HIPERMERCADO|MARKET |MARTKET |BODEGA|CADENA DE COMERCIO|C\.H\. RETAIL|FOOD RETAIL)/,
        'Tienda / supermercado',
    ],
    [/(BOTICA|FARMACIA|MIFARMA|INKAFARMA|CLINICA)/, 'Farmacia / salud'],
    [
        /(TELEFONICA|MOVISTAR|CLARO |AMERICA MOVIL|ENTEL|LUZ DEL SUR|ENEL |SEDAPAL|CALIDDA|HIDRANDINA|ELECTRO ?(NORTE|SUR|CENTRO|ORIENTE|DUNAS|UCAYALI|PERU))/,
        'Servicios (luz, agua, teléfono)',
    ],
    [
        /(MUNICIPALIDAD|SERPAR|SOCIEDAD NACIONAL DE INDUSTRIAS|UNIVERSIDAD|NOTARIA|COLEGIO DE|CAMARA DE COMERCIO|SUNAT|REGISTROS PUBLICOS|SUNARP)/,
        'Institución / trámite',
    ],
    [/(SHALOM|OLVA|MARVISUR)/, 'Envíos (encomiendas)'],
];
const NATURAL_PERSON = 'Persona natural, monto menor (movilidad / viáticos)';

/** gasto_tipico_sin_oc(): what kind of expense never carries an OC, by the supplier's name. */
export function typicalExpense(name: string | null, ruc: string, amount: number | null): string | null {
    const accents: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', ñ: 'n', Ñ: 'N' };
    const t = ` ${(name ?? '').replace(/[áéíóúÁÉÍÓÚñÑ]/g, (c) => accents[c]).toUpperCase()} `;
    for (const [re, label] of TYPICAL) if (re.test(t)) return label;
    if (!/CARGA/.test(t) && TRAVEL.test(t)) return 'Pasajes / movilidad';
    for (const [re, label] of AFTER_TRAVEL) if (re.test(t)) return label;
    return ruc.startsWith('10') && (amount ?? 0) < 1000 ? NATURAL_PERSON : null;
}

export interface ReceivedInvoice {
    id: string;
    ruc: string;
    name: string | null;
    total: number | null;
    currency: string | null;
}

/** What the links say of a supplier: its invoices' buyers and areas, and its OCs' procedencias. */
export interface SupplierLinks {
    /** One entry per link: who bought it and from which area (the approvals table). */
    who: Array<{ buyer: string | null; area: string | null }>;
    /** One entry per folder of a linked OC (the folder walk): true for an import. */
    folders: boolean[];
}

export interface NoOc {
    invoiceId: string;
    signal: 'ALTA' | 'MEDIA' | null;
    reason: string;
    likelyArea: string | null;
}

/** The area and buyer that appear most with the supplier (the old `quien`). */
function mostSeen(who: SupplierLinks['who']): { area: string | null } | null {
    const n = new Map<string, { area: string | null; count: number }>();
    for (const w of who) {
        if (!(w.buyer ?? w.area)) continue;
        const k = `${w.area ?? ''}|${w.buyer ?? ''}`;
        n.set(k, { area: w.area, count: (n.get(k)?.count ?? 0) + 1 });
    }
    return [...n.entries()].sort((a, z) => z[1].count - a[1].count || a[0].localeCompare(z[0]))[0]?.[1] ?? null;
}

/** mode() over the procedencias of the supplier's OC folders; a tie goes to COMEX, as in SQL. */
function folderArea(folders: boolean[]): string | null {
    if (!folders.length) return null;
    const imports = folders.filter(Boolean).length;
    return imports >= folders.length - imports ? 'COMEX (importaciones)' : 'Compras nacionales';
}

/**
 * The received facturas (type 01, from `since`) without any link, each with its signal: ALTA if the
 * supplier works with OCs (some of its invoices are linked), MEDIA if the amount is high and it is
 * not a typical expense without OC. A supplier marked by Contabilidad (proveedor_sin_oc) has none.
 */
export function invoicesWithoutOc(
    invoices: ReceivedInvoice[],
    linked: Set<string>,
    bySupplier: Map<string, SupplierLinks>,
    manual: Map<string, string>,
): NoOc[] {
    const per = new Map<string, { n: number; withOc: number }>();
    for (const i of invoices) {
        const p = per.get(i.ruc) ?? { n: 0, withOc: 0 };
        p.n++;
        if (linked.has(i.id)) p.withOc++;
        per.set(i.ruc, p);
    }
    return invoices
        .filter((i) => !linked.has(i.id))
        .map((i) => {
            const p = per.get(i.ruc)!;
            const why = manual.get(i.ruc);
            const typical = typicalExpense(i.name, i.ruc, 1e12) ?? (i.ruc.startsWith('10') && (i.total ?? 0) < 1000 ? NATURAL_PERSON : null);
            const pen = (i.total ?? 0) * (i.currency === 'USD' ? USD_TO_PEN : 1);
            const high = !typical && i.total !== null && pen >= 2000;
            const signal = why ? null : p.withOc > 0 ? 'ALTA' : high ? 'MEDIA' : null;
            const reason = why
                ? `Contabilidad: ${why}`
                : p.withOc > 0
                  ? `El proveedor trabaja con OC: ${p.withOc} de sus ${p.n} facturas están unidas a una OC. Falta la OC o subir esta factura a su carpeta.`
                  : high
                    ? 'Monto alto y no es un gasto típico sin OC.'
                    : typical
                      ? 'Gasto típico sin OC.'
                      : 'Monto menor.';
            const s = bySupplier.get(i.ruc);
            const likelyArea = (mostSeen(s?.who ?? [])?.area || null) ?? folderArea(s?.folders ?? []);
            return { invoiceId: i.id, signal, reason, likelyArea };
        });
}
