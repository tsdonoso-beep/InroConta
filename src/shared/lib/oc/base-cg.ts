// The base de Control de Gestión («3. Registro Compras Grupo» of «Bd ventas, costo y gastos»), one
// row per OC line, grouped by OC and cost centre as SubirCapturaOC.gs did (filasDeBaseCg_), into
// the rows guardar_fuente_oc('CG') expects. The procedencia is decided here, as db:mudanza does:
// CG writes every OC with 4 digits and does not say whether it is an import.

import { fecha, numero, tabla, texto, type Celda } from '../drive/fuentes-compras.ts';
import type { Proc, Row } from './fuentes.ts';

/** The tab CopiarFuentes.gs copies the base de CG into, in the private sheet. */
export const CG_TAB = 'CG - REGISTRO COMPRAS';

/** Only INROPRIN's lines (the base has every company of the group). */
const OWN = 'INROPRIN';

/** What v2 already knows of an OC with that number and year: its supplier's RUC. */
export type KnownOrder = { procedencia: Proc; numero: string; anio: number; proveedor_ruc: string | null };

/** '0172-2026' → {numero: '172', anio: 2026}; null for anything else (oc_numero/oc_anio). */
export function parseOc(v: string): { numero: string; anio: number } | null {
    const m = /^\s*(\d+(?:\.\d+)?)-(\d{4})\s*$/.exec(v);
    const numero = m?.[1].replace(/^0+/, '') ?? '';
    return m && /^[1-9]/.test(numero) ? { numero, anio: Number(m[2]) } : null;
}

/**
 * 3 digits is an import. A 4-digit code is national unless the supplier is the import's and not
 * the national's (the 2025 nationals are only in CG; scripts/local/move-v2/map-orders.mts guess()).
 */
export function guessProcedencia(code: string, ruc: string | null, known: Map<string, KnownOrder>): Proc {
    if (/^\s*\d{3}-/.test(code)) return 'IMPORTACION';
    const oc = parseOc(code);
    if (!oc || !ruc) return 'NACIONAL';
    const nac = known.get(`NACIONAL|${oc.numero}|${oc.anio}`);
    const imp = known.get(`IMPORTACION|${oc.numero}|${oc.anio}`);
    return imp?.proveedor_ruc === ruc && nac?.proveedor_ruc !== ruc ? 'IMPORTACION' : 'NACIONAL';
}

/**
 * The CG tab as guardar_fuente_oc('CG') rows: one per OC × cost centre with its amount, lines,
 * RUC, first date and currency. `canonical` turns a cost-centre code into the one v2 already has
 * («PROY-2024- 032» → «PROY-2024-032»), so the base does not create a twin.
 */
export function cgRows(rows: Celda[][] | undefined, known: Map<string, KnownOrder>, canonical: (code: string) => string): Row[] {
    const t = tabla(rows);
    const groups = new Map<string, Row>();
    for (const f of t.filas) {
        if (texto(t.get(f, 'EMPRESA')) !== OWN) continue;
        const oc = texto(t.get(f, 'N° OC/OS'));
        if (!oc) continue;
        const code = texto(t.get(f, 'CODIGO CENTRO DE COSTO')).replace(/\s+/g, '') || '-';
        const name = texto(t.get(f, 'CENTRO DE COSTO'));
        const k = `${oc}|${code}|${name}`;
        const g = groups.get(k) ?? {
            oc,
            cc_codigo: code === '-' ? '-' : canonical(code),
            cc_nombre: name,
            proveedor_ruc: null,
            fecha_oc: null,
            moneda: null,
            monto: 0,
            lineas: 0,
        };
        const ruc = texto(t.get(f, 'RUC / DNI / RUT'));
        if (/^\d{8,11}$/.test(ruc)) g.proveedor_ruc = ruc;
        const day = fecha(t.get(f, 'FECHA OC'));
        if (day && (!g.fecha_oc || day < g.fecha_oc)) g.fecha_oc = day;
        const cur = texto(t.get(f, 'MONEDA'));
        if (/^[A-Z]{3}$/.test(cur)) g.moneda = cur;
        g.monto += numero(t.get(f, 'MONTO TOTAL')) ?? 0;
        g.lineas++;
        groups.set(k, g);
    }
    return [...groups.values()].map((g) => ({
        ...g,
        procedencia: guessProcedencia(g.oc, g.proveedor_ruc, known),
        monto: Math.round(g.monto * 100) / 100,
    }));
}
