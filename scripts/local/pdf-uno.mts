// Vuelve a pedirle a SUNAT (api-cpe) el PDF y el XML de uno o más comprobantes, para
// compararlos con los que ya están en Drive (por ejemplo, si un PDF salió cortado).
// No guarda nada en Drive ni en la base: deja los archivos en scripts/out/salida/pdf-prueba/.
//
//   COMPROBANTES="20100130204-01-FB30-30129519" pnpm cpe:pdf
//   (varios separados por coma; formato RUCEMISOR-TIPO-SERIE-NUMERO)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crearBitacora, vigilarProceso } from './comun/bitacora.mts';
import type { Pendiente } from './comun/tipos.mts';
import { abrirNavegador, nuevoContexto, entrar, abrirFormulario, Token } from './sol/sesion.mts';
import { ClienteApi } from './api/cliente.mts';

const b = crearBitacora('pdf-uno');
vigilarProceso(b);
const SALIDA = join(process.cwd(), 'scripts', 'out', 'salida', 'pdf-prueba');
mkdirSync(SALIDA, { recursive: true });

function leerLista(texto: string): Pendiente[] {
    return texto
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
            const m = /^(\d{11})-(\d{2})-([A-Z0-9]{4})-(\d+)$/i.exec(s);
            if (!m) throw new Error(`«${s}» no tiene la forma RUCEMISOR-TIPO-SERIE-NUMERO`);
            return {
                proveedorRuc: m[1],
                proveedorNombre: null,
                tipoComprobante: m[2],
                serie: m[3].toUpperCase(),
                numero: m[4],
                fechaEmision: null,
                periodo: null,
            };
        });
}

async function main() {
    const lista = leerLista(process.env.COMPROBANTES ?? '');
    if (!lista.length) throw new Error('Falta COMPROBANTES, por ejemplo COMPROBANTES="20100130204-01-FB30-30129519"');

    const nav = await abrirNavegador();
    const ctx = await nuevoContexto(nav);
    const token = new Token();
    token.vigilar(ctx);
    const page = await ctx.newPage();
    page.on('dialog', (d) => {
        d.accept().catch(() => {});
    });
    try {
        await entrar(b, page, 'login');
        await abrirFormulario(b, page, 'menu');
        await token.esperar();
        const api = new ClienteApi(b, ctx.request, () => token.valor, 'pdf');
        for (const p of lista) {
            const id = `${p.proveedorRuc}-${p.tipoComprobante}-${p.serie}-${p.numero}`;
            for (const tipo of ['PDF', 'XML'] as const) {
                const { r, archivo } = await api.archivo(p, tipo);
                if (!archivo) {
                    b.log('aviso', tipo.toLowerCase(), `${id}: HTTP ${r.status} ${r.clase} ${r.texto.slice(0, 150)}`);
                    continue;
                }
                const ruta = join(SALIDA, `${id}-HOY-${archivo.nombre}`);
                writeFileSync(ruta, archivo.datos);
                b.log('info', tipo.toLowerCase(), `${id}: ${archivo.datos.length} bytes → ${ruta}`);
            }
        }
    } finally {
        await nav.close().catch(() => {});
    }
}

main().catch((e) => {
    b.log('error', 'pdf-uno', String(e?.message ?? e));
    process.exitCode = 1;
});
