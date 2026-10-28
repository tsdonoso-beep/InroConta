// El kardex completo de Almacén a la base v2, con lo que cambió desde la lectura anterior
// (src/shared/lib/kardex/movimientos.ts, migración v2 016). Lo llama fuentes-compras.mts con la
// pestaña KARDEX - MOVIMIENTOS de la hoja privada; cada lectura es una corrida del job 'kardex'
// (la pantalla Kardex dice «leído el …» con ella).

import {
    COLUMNAS_KARDEX,
    diferenciasKardex,
    movimientoDeFila,
    movimientosKardex,
    resumenPorMes,
    type MovimientoKardex,
} from '../../src/shared/lib/kardex/movimientos.ts';
import type { Celda } from '../../src/shared/lib/drive/fuentes-compras.ts';
import { allRows, call, type Base } from './oc/base.mts';

/** De a cuántos se manda a guardar_kardex (un JSON de ~1 MB). */
const LOTE = 2000;

function trozos<T>(xs: T[], n: number): T[][] {
    return Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
}

/** yyyy-mm-dd en Lima (UTC-5): el mes que corre ahí decide qué mes ya cerró. */
export const hoyEnLima = (ahora = new Date()) => new Date(ahora.getTime() - 5 * 3600_000).toISOString().slice(0, 10);

export interface ResumenKardex {
    filas: number;
    habia: number;
    nuevos: number;
    cambiados: number;
    borrados: number;
    cambios: number;
    enMesesCerrados: number;
    sinId: number;
    repetidos: number;
    completa: boolean;
}

/** Lee lo que ya está, compara y guarda. Con `soloComparar` no escribe nada (DEBUG=1). */
export async function cargarKardex(
    sb: Base | null,
    empresaRuc: string,
    filas: Celda[][],
    soloComparar: boolean,
): Promise<ResumenKardex & { cambiosDetalle: unknown[] }> {
    const { movimientos, sinId, repetidos } = movimientosKardex(filas);
    const antes = new Map<string, MovimientoKardex>();
    if (sb)
        for (const r of await allRows<Record<string, unknown>>(sb, 'kardex_movimiento', COLUMNAS_KARDEX, ['id'], (q) => q.eq('empresa_ruc', empresaRuc))) {
            const m = movimientoDeFila(r);
            antes.set(m.id, m);
        }
    // Una pestaña cortada (menos de la mitad de lo que había) suma, pero no borra.
    const completa = movimientos.length >= antes.size / 2;
    const d = diferenciasKardex(antes, movimientos, { hoyEs: hoyEnLima(), completa });
    const resumen: ResumenKardex = {
        filas: movimientos.length,
        habia: antes.size,
        nuevos: d.guardar.filter((m) => !antes.has(m.id)).length,
        cambiados: d.guardar.filter((m) => antes.has(m.id)).length,
        borrados: d.borrar.length,
        cambios: d.cambios.length,
        enMesesCerrados: d.cambios.filter((c) => c.detalle.mesCerrado).length,
        sinId,
        repetidos,
        completa,
    };
    if (soloComparar || !sb) return { ...resumen, cambiosDetalle: d.cambios };

    const origen = process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : 'laptop';
    const { data: corrida, error } = await sb.from('corrida').insert({ job: 'kardex', empresa_ruc: empresaRuc, origen }).select('id').single();
    if (error) throw new Error(`corrida (kardex): ${error.message}`);
    try {
        // Cada lote lleva sus propios cambios: si uno falla, la siguiente lectura vuelve a ver (y anotar) solo lo que no entró.
        const cambiosDe = new Map<string, typeof d.cambios>();
        for (const c of d.cambios) cambiosDe.set(c.clave, [...(cambiosDe.get(c.clave) ?? []), c]);
        const lotes = [
            ...trozos(d.guardar, LOTE).map((g) => ({ filas: g, borrar: [] as string[], claves: g.map((m) => m.id) })),
            ...trozos(d.borrar, LOTE).map((b) => ({ filas: [] as MovimientoKardex[], borrar: b, claves: b })),
        ];
        for (const l of lotes)
            await call(sb, 'guardar_kardex', {
                p_empresa_ruc: empresaRuc,
                p_filas: l.filas,
                p_borrar: l.borrar,
                p_cambios: l.claves.flatMap((k) => cambiosDe.get(k) ?? []),
                p_corrida: corrida.id,
            });
        // El resumen por mes, solo con el kardex entero (una pestaña cortada daría meses a medias).
        if (completa) {
            const meses = resumenPorMes(movimientos).map((m) => ({ ...m, empresa_ruc: empresaRuc, calculado_en: new Date().toISOString() }));
            const { error: e1 } = await sb.from('kardex_mes').upsert(meses, { onConflict: 'empresa_ruc,mes' });
            if (e1) throw new Error(`kardex_mes: ${e1.message}`);
            const hay = meses.map((m) => m.mes);
            if (hay.length) {
                const { error: e2 } = await sb
                    .from('kardex_mes')
                    .delete()
                    .eq('empresa_ruc', empresaRuc)
                    .not('mes', 'in', `(${hay.join(',')})`);
                if (e2) throw new Error(`kardex_mes: ${e2.message}`);
            }
        }
        await sb
            .from('corrida')
            .update({ terminada_en: new Date().toISOString(), resultado: completa ? 'OK' : 'PARCIAL', filas: movimientos.length, resumen })
            .eq('id', corrida.id);
    } catch (e) {
        await sb
            .from('corrida')
            .update({ terminada_en: new Date().toISOString(), resultado: 'ERROR', error: e instanceof Error ? e.message : String(e) })
            .eq('id', corrida.id);
        throw e;
    }
    return { ...resumen, cambiosDetalle: [] };
}
