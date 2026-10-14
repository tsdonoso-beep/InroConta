// The CREs in the base (migration 070). The sheet that shows them is COMPROBANTES SUNAT - DETALLE
// (detalle_cpe_hoja_con_retencion, published by comun/guardar.mts).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RUC } from '../comun/config.mts';
import { dormir, type Bitacora } from '../comun/bitacora.mts';
import { base } from '../comun/base.mts';
import { claveCre, type Registro } from './registro.mts';

const sinMigracion = (e: { code?: string; message: string }) => e.code === 'PGRST202' || e.code === '42883' || /could not find the function/i.test(e.message);

/** The CREs already saved, by key, with their state and whether they have their files; null without migration 070. */
export async function guardadas(b: Bitacora): Promise<Map<string, { estado: string; conArchivos: boolean }> | null> {
    const { data, error } = await (await base()).rpc('retenciones_guardadas', { p_empresa_ruc: RUC });
    if (error) {
        b.log(
            sinMigracion(error) ? 'aviso' : 'error',
            'base',
            `retenciones_guardadas: ${error.message}${sinMigracion(error) ? ' (¿falta aplicar la migración 070?)' : ''}`,
        );
        return null;
    }
    const filas = (data ?? []) as { emisor_ruc: string; serie: string; numero: number; estado: string; con_archivos: boolean }[];
    return new Map(filas.map((r) => [claveCre(r.emisor_ruc, r.serie, r.numero), { estado: r.estado, conArchivos: r.con_archivos }]));
}

export const statsBase = { nuevos: 0, actualizados: 0, fallidos: 0 };

/** guardar_retenciones with 3 tries; if it does not go in, the batch stays on disk (in the run's log folder). */
export async function guardarLote(b: Bitacora, lote: Registro[]): Promise<void> {
    if (!lote.length) return;
    for (let i = 1; i <= 3; i++) {
        const { data, error } = await (await base(i > 1)).rpc('guardar_retenciones', { p_empresa_ruc: RUC, p_filas: lote });
        if (!error) {
            const r = (Array.isArray(data) ? data[0] : data) as { nuevos: number; actualizados: number } | null;
            statsBase.nuevos += r?.nuevos ?? 0;
            statsBase.actualizados += r?.actualizados ?? 0;
            b.log('info', 'base', `guardados ${lote.length}: ${r?.nuevos ?? '?'} nuevos, ${r?.actualizados ?? '?'} actualizados`);
            return;
        }
        b.log('error', 'base', `guardar_retenciones falló (intento ${i}/3): ${error.message}`, { error });
        if (sinMigracion(error)) break;
        await dormir(3000 * i);
    }
    statsBase.fallidos += lote.length;
    const archivo = join(b.dir, `lote-no-guardado-${Date.now()}.json`);
    writeFileSync(archivo, JSON.stringify(lote, null, 2));
    b.log('error', 'base', `el lote quedó en ${archivo}: la próxima corrida lo vuelve a bajar y guardar`);
}
