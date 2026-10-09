// Registro de lo que la consulta SPOT pide por debajo, para ver si hay una API que se pueda llamar directo
// (como «Nueva Consulta» → api-cpe). Solo después del login, y sin claves, tokens ni cookies: el artefacto
// de la corrida lo puede bajar quien tenga acceso al repositorio.
//
//   <corrida>/red.jsonl          una línea por pedido: método, url, estado, tipo, cuerpo enviado
//   <corrida>/red/NNN-<host>.txt la respuesta (JSON, HTML o texto), recortada

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext, Response } from 'playwright';
import type { Bitacora } from '../comun/bitacora.mts';

const SENSIBLE = /token|auth|state|code|session|clave|pass|contrasena|jwt|cookie|idcache/i;
const MAX_CUERPO = 20000;

/** La URL sin los valores de parámetros sensibles. */
export function limpiarUrl(url: string): string {
    try {
        const u = new URL(url);
        for (const k of [...u.searchParams.keys()]) if (SENSIBLE.test(k)) u.searchParams.set(k, '***');
        // Un JWT en cualquier parámetro (p. ej. idCache=eyJ…, que iba entero a red.jsonl el 08/10/2026).
        return limpiarTexto(u.toString());
    } catch {
        return url.slice(0, 300);
    }
}

/** Tokens JWT y campos «…token»: fuera. */
export function limpiarTexto(t: string): string {
    return t.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '***jwt***').replace(/("[\w-]*(?:token|clave|password)[\w-]*"\s*:\s*")[^"]*/gi, '$1***');
}

export function registrarRed(b: Bitacora, ctx: BrowserContext): { pedidos: () => number } {
    const dir = join(b.dir, 'red');
    mkdirSync(dir, { recursive: true });
    let n = 0;
    const anotar = async (r: Response) => {
        const req = r.request();
        if (!['xhr', 'fetch', 'document'].includes(req.resourceType())) return;
        const url = req.url();
        // El ingreso y la seguridad de SUNAT nunca: ahí viajan usuario y clave.
        if (/api-seguridad\.sunat\.gob\.pe/i.test(url)) return;
        const i = ++n;
        const tipo = (await r.headerValue('content-type').catch(() => null)) ?? '';
        const enviado = req.postData();
        let host = '?';
        try {
            host = new URL(url).host;
        } catch {
            /* url rara */
        }
        b.jsonl('red.jsonl', {
            i,
            t: new Date().toISOString(),
            metodo: req.method(),
            url: limpiarUrl(url),
            estado: r.status(),
            tipo,
            recurso: req.resourceType(),
            enviado: enviado && !SENSIBLE.test(enviado) ? enviado.slice(0, 4000) : enviado ? '(omitido: parece llevar datos de sesión)' : null,
        });
        if (!/json|html|text|javascript/i.test(tipo)) return;
        const cuerpo = await r.text().catch(() => '');
        if (cuerpo) writeFileSync(join(dir, `${String(i).padStart(3, '0')}-${host}.txt`), limpiarTexto(cuerpo.slice(0, MAX_CUERPO)));
    };
    ctx.on('response', (r) => {
        void anotar(r).catch(() => {});
    });
    return { pedidos: () => n };
}
