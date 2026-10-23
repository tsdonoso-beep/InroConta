// The CREs in the v2 base (retencion_comprobante + retencion_documento). The sheet that shows them is
// COMPROBANTES SUNAT - DETALLE (published by comun/guardar.mts).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RUC } from '../comun/config.mts';
import { dormir, type Bitacora } from '../comun/bitacora.mts';
import { base } from '../comun/base.mts';
import { allPages } from '../../../src/shared/supabase/paging.ts';
import { claveCre, type Registro } from './registro.mts';

const sinMigracion = (e: { code?: string; message: string }) => e.code === 'PGRST202' || e.code === '42883' || /could not find the function/i.test(e.message);

type Cre = { emisor_ruc: string; serie: string; numero: number; estado: string; pdf_drive_id: string | null; xml_drive_id: string | null };

/**
 * The CREs already saved WITH their invoices, by key, with their state and whether they have their
 * files (what retenciones_guardadas() returned, read from the table: a reversed CRE needs no
 * files). null if the read fails, so the run reads everything again.
 */
export async function guardadas(b: Bitacora): Promise<Map<string, { estado: string; conArchivos: boolean }> | null> {
    try {
        const filas = await allPages<Cre>(async (from, size) => {
            const { data, error } = await base()
                .from('retencion_comprobante')
                // !inner: only the CREs that have at least one invoice saved.
                .select('id, emisor_ruc, serie, numero, estado, pdf_drive_id, xml_drive_id, retencion_documento!inner(tipo)')
                .eq('empresa_ruc', RUC)
                .limit(1, { referencedTable: 'retencion_documento' })
                .order('id')
                .range(from, from + size - 1);
            if (error) throw new Error(`${error.code ?? ''} ${error.message}`);
            return (data ?? []) as unknown as Cre[];
        });
        return new Map(
            filas.map((r) => [
                claveCre(r.emisor_ruc, r.serie, r.numero),
                { estado: r.estado, conArchivos: (!!r.pdf_drive_id && !!r.xml_drive_id) || r.estado === 'REVERTIDO' },
            ]),
        );
    } catch (e) {
        b.log('error', 'base', `no se pudieron leer los CRE guardados: ${e instanceof Error ? e.message : e}`);
        return null;
    }
}

export const statsBase = { nuevos: 0, actualizados: 0, fallidos: 0 };

/** guardar_retenciones with 3 tries; if it does not go in, the batch stays on disk (in the run's log folder). */
export async function guardarLote(b: Bitacora, lote: Registro[]): Promise<void> {
    if (!lote.length) return;
    for (let i = 1; i <= 3; i++) {
        const { data, error } = await base().rpc('guardar_retenciones', { p_empresa_ruc: RUC, p_filas: lote });
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
