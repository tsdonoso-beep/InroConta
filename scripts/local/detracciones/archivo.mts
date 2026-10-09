// La constancia en disco, en PDF y en Drive: Detracciones/Compras|Ventas/AAAA-MM/<factura>_DTR-<constancia>.pdf|.html
//
// Misma carpeta raíz que los XML (SUNAT_DRIVE_FOLDER, al lado de Recibidas/ y Emitidas/). Cada carpeta se lista
// una vez y lo que ya está no se vuelve a subir (comun/cache-drive.mts).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext } from 'playwright';
import { CARPETA_DRIVE } from '../comun/config.mts';
import { dormir, type Bitacora } from '../comun/bitacora.mts';
import { drive } from '../comun/drive.mts';
import { crearSubidor } from '../comun/cache-drive.mts';
import { carpeta } from '../../../src/shared/lib/drive/servidor.ts';

export const DIR_SALIDA = join(process.cwd(), 'scripts', 'out', 'salida', 'detracciones');

/** UTF-8 si lo es; si no, latin1 (SUNAT mezcla las dos). */
export function decodificar(datos: Buffer): string {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(datos);
    } catch {
        return datos.toString('latin1');
    }
}

/** El HTML de SUNAT impreso a PDF por el mismo navegador (solo sin ventana: HEADLESS=1). */
export async function aPdf(ctx: BrowserContext, html: Buffer): Promise<Buffer> {
    const p = await ctx.newPage();
    try {
        await p.setContent(decodificar(html), { waitUntil: 'load', timeout: 30000 });
        return await p.pdf({ format: 'A4', printBackground: true, margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' } });
    } finally {
        await p.close().catch(() => {});
    }
}

/** Copia en disco antes de subir: si Drive falla, la constancia no se pierde. */
export function respaldar(ruta: string[], nombre: string, datos: Buffer): void {
    const dir = join(DIR_SALIDA, ...ruta.slice(1));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, nombre), datos);
}

const carpetas = new Map<string, Promise<string>>();
function carpetaDe(ruta: string[]): Promise<string> {
    const k = ruta.join('/');
    let pr = carpetas.get(k);
    if (!pr) {
        pr = (async () => {
            let id = CARPETA_DRIVE;
            for (const nombre of ruta) id = await carpeta(drive(), nombre, id);
            return id;
        })();
        pr.catch(() => carpetas.delete(k));
        carpetas.set(k, pr);
    }
    return pr;
}

let subidor: ReturnType<typeof crearSubidor> | null = null;
export const statsDrive = { nuevos: 0, existian: 0, fallidos: 0 };

/** Sube a la carpeta de la ruta (la crea si falta); reintenta lo que Google deja reintentar. */
export async function subir(b: Bitacora, ruta: string[], nombre: string, datos: Buffer, tipo: string): Promise<string | null> {
    subidor ??= crearSubidor(drive() as unknown as Parameters<typeof crearSubidor>[0]);
    for (let i = 1; ; i++) {
        try {
            const r = await subidor(await carpetaDe(ruta), { nombre, datos, tipo });
            if (r.estado === 'nuevo') statsDrive.nuevos++;
            else statsDrive.existian++;
            return r.url;
        } catch (e) {
            const m = e instanceof Error ? e.message : String(e);
            if (i >= 5 || !/rate limit|quota|429|500|502|503|ECONNRESET|ETIMEDOUT|socket hang up/i.test(m)) {
                statsDrive.fallidos++;
                b.log('error', 'drive', `${ruta.join('/')}/${nombre}: ${m.split('\n')[0]} (quedó en disco)`);
                return null;
            }
            b.log('aviso', 'drive', `${nombre}: reintento ${i}/5 en ${5 * i}s: ${m.split('\n')[0]}`);
            await dormir(5000 * i);
        }
    }
}
