// Las constancias en la base v2 (detraccion_constancia). La hoja que las muestra es COMPROBANTES SUNAT - DETALLE (comun/guardar.mts).

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RUC } from '../comun/config.mts';
import { dormir, type Bitacora } from '../comun/bitacora.mts';
import { base } from '../comun/base.mts';
import { allPages } from '../../../src/shared/supabase/paging.ts';
import type { Registro } from './registro.mts';

/** ¿Falta la función en la base? */
const sinMigracion = (e: { code?: string; message: string }) => e.code === 'PGRST202' || e.code === '42883' || /could not find the function/i.test(e.message);

/**
 * The proofs already saved with their PDF and HTML in Drive (what detracciones_guardadas()
 * returned, read from the table); null if the read fails, so the run downloads everything.
 */
export async function guardadas(b: Bitacora): Promise<Set<string> | null> {
    try {
        const filas = await allPages<{ numero_constancia: string }>(async (from, size) => {
            const { data, error } = await base()
                .from('detraccion_constancia')
                .select('numero_constancia')
                .eq('empresa_ruc', RUC)
                .not('pdf_drive_id', 'is', null)
                .not('html_drive_id', 'is', null)
                .order('numero_constancia')
                .range(from, from + size - 1);
            if (error) throw new Error(`${error.code ?? ''} ${error.message}`);
            return data ?? [];
        });
        return new Set(filas.map((r) => r.numero_constancia));
    } catch (e) {
        b.log('error', 'base', `no se pudieron leer las constancias guardadas: ${e instanceof Error ? e.message : e}`);
        return null;
    }
}

export const statsBase = { nuevos: 0, actualizados: 0, fallidos: 0 };

/** guardar_detracciones con 3 intentos; si no entra, el lote queda en disco (en la bitácora de la corrida). */
export async function guardarLote(b: Bitacora, lote: Registro[]): Promise<void> {
    if (!lote.length) return;
    for (let i = 1; i <= 3; i++) {
        const { data, error } = await base().rpc('guardar_detracciones', { p_empresa_ruc: RUC, p_filas: lote });
        if (!error) {
            const r = (Array.isArray(data) ? data[0] : data) as { nuevos: number; actualizados: number } | null;
            statsBase.nuevos += r?.nuevos ?? 0;
            statsBase.actualizados += r?.actualizados ?? 0;
            b.log('info', 'base', `guardadas ${lote.length}: ${r?.nuevos ?? '?'} nuevas, ${r?.actualizados ?? '?'} actualizadas`);
            return;
        }
        b.log('error', 'base', `guardar_detracciones falló (intento ${i}/3): ${error.message}`, { error });
        if (sinMigracion(error)) break;
        await dormir(3000 * i);
    }
    statsBase.fallidos += lote.length;
    const archivo = join(b.dir, `lote-no-guardado-${Date.now()}.json`);
    writeFileSync(archivo, JSON.stringify(lote, null, 2));
    b.log('error', 'base', `el lote quedó en ${archivo}: la próxima corrida lo vuelve a bajar y guardar`);
}
