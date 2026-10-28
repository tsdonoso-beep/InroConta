// El kardex de Almacén completo y lo que cambió de un día a otro
//
// Contabilidad (reunión del 27/10/2026): lo que cuenta es el cierre mensual, pero el kardex se
// sigue tocando después (el 1 al 5 del mes siguiente, y a veces meses atrás: «encuentro algo de
// hace dos meses»). José cuadra el kardex al cierre; cada movimiento que entra, cambia o se borra
// en un mes ya terminado le mueve ese cuadre. Por eso se lee TODO el kardex (ingresos y salidas,
// no solo lo que cruza con una OC como la pestaña KARDEX) dos veces al día y se anota cada cambio.
//
// CopiarFuentes.gs copia la pestaña «KARDEX - MOVIMIENTOS» (una fila por producto de un vale) a
// la hoja privada; fuentes-compras.mts la lee, la compara con la base (`diferenciasKardex`) y
// guarda con `guardar_kardex` (migración v2 016). Puro: sin red ni base.

import { fecha, numero, plano, tabla, texto, type Celda } from '../drive/fuentes-compras.ts';

export const PESTANA_KARDEX = 'KARDEX - MOVIMIENTOS';

/** Una fila del kardex: un producto de un vale. */
export interface MovimientoKardex {
    /** El ID de la fila en la app de Almacén. */
    id: string;
    vale: string;
    /** yyyy-mm-dd */
    fechaRegistro: string | null;
    fechaOperacion: string | null;
    /** INGRESO, SALIDA, ANULADO… */
    movimiento: string;
    operacion: string;
    /** Proveedor, proyecto o persona del vale (TIPO ANEXO + DESCRIPCION). */
    anexo: string;
    numeroDocumento: string;
    numeroOrden: string;
    proyecto: string;
    sede: string;
    responsable: string;
    sku: string;
    producto: string;
    unidad: string;
    categoria: string;
    ingreso: number | null;
    salida: number | null;
}

/** Lo que se compara para decir «cambió» (el id no: es la llave). */
export const CAMPOS_KARDEX = [
    'vale',
    'fechaRegistro',
    'fechaOperacion',
    'movimiento',
    'operacion',
    'anexo',
    'numeroDocumento',
    'numeroOrden',
    'proyecto',
    'sede',
    'responsable',
    'sku',
    'producto',
    'unidad',
    'categoria',
    'ingreso',
    'salida',
] as const satisfies readonly (keyof MovimientoKardex)[];
export type CampoKardex = (typeof CAMPOS_KARDEX)[number];

/** La pestaña KARDEX - MOVIMIENTOS, una fila por producto. Una fila sin ID no se puede seguir: se cuenta y se salta. */
export function movimientosKardex(filas: Celda[][] | undefined): { movimientos: MovimientoKardex[]; sinId: number; repetidos: number } {
    const t = tabla(filas);
    const out = new Map<string, MovimientoKardex>();
    let sinId = 0,
        repetidos = 0;
    for (const f of t.filas) {
        const g = (c: string) => texto(t.get(f, c));
        const id = g('ID');
        if (!id) {
            sinId++;
            continue;
        }
        if (out.has(id)) repetidos++;
        const tipoAnexo = g('TIPO ANEXO');
        out.set(id, {
            id,
            vale: g('VALE DE ALMACEN'),
            fechaRegistro: fecha(t.get(f, 'FECHA REGISTRO')),
            fechaOperacion: fecha(t.get(f, 'FECHA OPERACION')),
            movimiento: plano(t.get(f, 'TIPO DE MOVIMIENTO')),
            operacion: plano(t.get(f, 'TIPO DE OPERACION')),
            anexo: [tipoAnexo && plano(tipoAnexo), g('DESCRIPCION')].filter(Boolean).join(': '),
            numeroDocumento: g('NUMERO DOCUMENTO').toUpperCase(),
            numeroOrden: g('NUMERO ORDEN'),
            proyecto: g('PROYECTO'),
            sede: g('SEDE'),
            responsable: g('RESPONSABLE DE REGISTRO'),
            sku: g('CODIGO SIDIGE'),
            producto: g('DESCRIPCION DE SKU'),
            // «UNDIDAD» es como viene escrita en la base de Almacén.
            unidad: g('UNDIDAD DE MEDIDA') || g('UNIDAD DE MEDIDA'),
            categoria: g('CATEGORIA'),
            ingreso: numero(t.get(f, 'INGRESO')),
            salida: numero(t.get(f, 'SALIDA')),
        });
    }
    return { movimientos: [...out.values()], sinId, repetidos };
}

// ════════════════════════════════════════════════════════════════
// Qué cambió

export type TipoCambioKardex = 'NUEVO' | 'CAMBIO' | 'ELIMINADO';

/** Un cambio, como lo guarda la tabla `cambio` (entidad 'kardex'). */
export interface CambioKardex {
    clave: string;
    tipo: TipoCambioKardex;
    campo: CampoKardex | null;
    antes: string | null;
    despues: string | null;
    detalle: {
        /** yyyy-mm del movimiento (el de antes si se borró; el más antiguo si cambió de mes). */
        mes: string | null;
        /** El mes del movimiento ya había terminado cuando se vio el cambio: mueve un cierre. */
        mesCerrado: boolean;
        vale: string;
        movimiento: string;
        sku: string;
        producto: string;
        proyecto: string;
        responsable: string;
    };
}

export interface DiferenciasKardex {
    /** Lo nuevo o cambiado, para guardar. */
    guardar: MovimientoKardex[];
    /** Los ID que ya no están en el kardex. */
    borrar: string[];
    cambios: CambioKardex[];
}

const valorDe = (v: string | number | null) => (v == null || v === '' ? null : String(v));
const mesDe = (d: string | null) => (d && /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : null);

/**
 * Lo que cambió entre lo que tiene la base (`antes`) y el kardex de hoy (`hoy`).
 * `hoyEs`: la fecha (yyyy-mm-dd, hora de Lima) de la lectura: un mes anterior al suyo ya cerró.
 * `completa` en falso (llegó menos de la mitad): suma y cambia, pero no borra.
 * La primera carga (la base vacía) guarda todo sin anotar miles de «NUEVO».
 */
export function diferenciasKardex(
    antes: Map<string, MovimientoKardex>,
    hoy: MovimientoKardex[],
    { hoyEs, completa = true }: { hoyEs: string; completa?: boolean },
): DiferenciasKardex {
    const mesActual = hoyEs.slice(0, 7);
    const primeraCarga = antes.size === 0;
    const cerrado = (mes: string | null) => !!mes && mes < mesActual;
    const detalle = (m: MovimientoKardex, mes: string | null) => ({
        mes,
        mesCerrado: cerrado(mes),
        vale: m.vale,
        movimiento: m.movimiento,
        sku: m.sku,
        producto: m.producto,
        proyecto: m.proyecto,
        responsable: m.responsable,
    });
    const guardar: MovimientoKardex[] = [];
    const cambios: CambioKardex[] = [];
    const vistos = new Set<string>();
    for (const m of hoy) {
        vistos.add(m.id);
        const b = antes.get(m.id);
        if (!b) {
            guardar.push(m);
            if (!primeraCarga)
                cambios.push({ clave: m.id, tipo: 'NUEVO', campo: null, antes: null, despues: null, detalle: detalle(m, mesDe(m.fechaOperacion)) });
            continue;
        }
        const distintos = CAMPOS_KARDEX.filter((c) => valorDe(b[c]) !== valorDe(m[c]));
        if (!distintos.length) continue;
        guardar.push(m);
        // Si cambió de mes, cuenta el más antiguo: ese es el cierre que se movió.
        const meses = [mesDe(b.fechaOperacion), mesDe(m.fechaOperacion)].filter((x): x is string => !!x).sort();
        for (const c of distintos)
            cambios.push({ clave: m.id, tipo: 'CAMBIO', campo: c, antes: valorDe(b[c]), despues: valorDe(m[c]), detalle: detalle(m, meses[0] ?? null) });
    }
    const borrar: string[] = [];
    if (completa)
        for (const [id, b] of antes) {
            if (vistos.has(id)) continue;
            borrar.push(id);
            cambios.push({ clave: id, tipo: 'ELIMINADO', campo: null, antes: null, despues: null, detalle: detalle(b, mesDe(b.fechaOperacion)) });
        }
    return { guardar, borrar, cambios };
}

/** Una fila de la base (kardex_movimiento) como movimiento, para comparar. */
export function movimientoDeFila(r: Record<string, unknown>): MovimientoKardex {
    const s = (v: unknown) => (v == null ? '' : String(v));
    const n = (v: unknown) => (v == null || v === '' ? null : Number(v));
    const d = (v: unknown) => (v == null || v === '' ? null : String(v).slice(0, 10));
    return {
        id: s(r.id),
        vale: s(r.vale),
        fechaRegistro: d(r.fecha_registro),
        fechaOperacion: d(r.fecha_operacion),
        movimiento: s(r.movimiento),
        operacion: s(r.operacion),
        anexo: s(r.anexo),
        numeroDocumento: s(r.numero_documento),
        numeroOrden: s(r.numero_orden),
        proyecto: s(r.proyecto),
        sede: s(r.sede),
        responsable: s(r.responsable),
        sku: s(r.sku),
        producto: s(r.producto),
        unidad: s(r.unidad),
        categoria: s(r.categoria),
        ingreso: n(r.ingreso),
        salida: n(r.salida),
    };
}

/** Las columnas de kardex_movimiento que lee movimientoDeFila. */
export const COLUMNAS_KARDEX =
    'id,vale,fecha_registro,fecha_operacion,movimiento,operacion,anexo,numero_documento,numero_orden,proyecto,sede,responsable,sku,producto,unidad,categoria,ingreso,salida';

// ════════════════════════════════════════════════════════════════
// Resumen por mes (kardex_mes)

export interface MesKardex {
    /** yyyy-mm de la fecha de operación. */
    mes: string;
    movimientos: number;
    vales: number;
    ingresos: number;
    salidas: number;
    anulados: number;
}

/** Por mes de operación: cuántos movimientos y vales, cuánto entró y salió. Lo sin fecha de operación no cae en ningún mes. */
export function resumenPorMes(movimientos: MovimientoKardex[]): MesKardex[] {
    const meses = new Map<string, MesKardex & { valesDe: Set<string> }>();
    for (const m of movimientos) {
        const mes = mesDe(m.fechaOperacion);
        if (!mes) continue;
        let r = meses.get(mes);
        if (!r) meses.set(mes, (r = { mes, movimientos: 0, vales: 0, ingresos: 0, salidas: 0, anulados: 0, valesDe: new Set() }));
        r.movimientos++;
        if (m.vale) r.valesDe.add(m.vale);
        r.ingresos += m.ingreso ?? 0;
        r.salidas += m.salida ?? 0;
        if (m.movimiento === 'ANULADO') r.anulados++;
    }
    const r4 = (x: number) => Math.round(x * 10000) / 10000;
    return [...meses.values()]
        .map(({ valesDe, ...r }) => ({ ...r, vales: valesDe.size, ingresos: r4(r.ingresos), salidas: r4(r.salidas) }))
        .sort((a, b) => (a.mes < b.mes ? 1 : -1));
}
