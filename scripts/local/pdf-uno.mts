// Vuelve a pedirle a SUNAT (api-cpe) el PDF y el XML de uno o más comprobantes, para
// compararlos con los que ya están en Drive (por ejemplo, si un PDF salió cortado).
// Primero por la API; si SUNAT responde error (como con los bancos), por pantallas: llena
// «Nueva Consulta de comprobantes de pago», baja desde el modal «Resultado» y deja una captura.
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
import { llenar, clicConsultar, esperarResultado, bajarXml, bajarPdf, cerrarModal } from './sol/formulario.mts';
import type { Archivo } from './comun/drive.mts';

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
        const marco = await abrirFormulario(b, page, 'menu');
        await token.esperar();
        const api = new ClienteApi(b, ctx.request, () => token.valor, 'pdf');
        const guardar = (id: string, como: string, a: Archivo) => {
            const ruta = join(SALIDA, `${id}-HOY-${como}-${a.nombre}`);
            writeFileSync(ruta, a.datos);
            b.log('info', como, `${id}: ${a.nombre} (${a.datos.length} bytes) → ${ruta}`);
        };
        let tipoActual: string | null = null;
        for (const p of lista) {
            const id = `${p.proveedorRuc}-${p.tipoComprobante}-${p.serie}-${p.numero}`;
            let faltan = 0;
            for (const tipo of ['PDF', 'XML'] as const) {
                const { r, archivo } = await api.archivo(p, tipo);
                if (archivo) guardar(id, `api-${tipo.toLowerCase()}`, archivo);
                else {
                    faltan++;
                    b.log('aviso', `api-${tipo.toLowerCase()}`, `${id}: HTTP ${r.status} ${r.clase} ${r.texto.slice(0, 150)}`);
                }
            }
            if (!faltan) continue;

            b.log('info', 'pantalla', `${id}: la API no lo dio; se pide por pantallas`);
            tipoActual = await llenar(marco, p, tipoActual);
            await clicConsultar(marco);
            const { clase, textos } = await esperarResultado(marco, 60000, () => []);
            await page.screenshot({ path: join(SALIDA, `${id}-HOY-pantalla.png`), fullPage: true }).catch(() => {});
            if (clase !== 'OK') {
                b.log('aviso', 'pantalla', `${id}: ${clase} ${textos.join(' | ').slice(0, 200)}`);
                continue;
            }
            for (const [como, bajarlo] of [
                ['pantalla-pdf', bajarPdf],
                ['pantalla-xml', bajarXml],
            ] as const) {
                const a = await bajarlo(marco).catch((e: Error) => {
                    b.log('aviso', como, `${id}: ${e.message.split('\n')[0]}`);
                    return null;
                });
                if (a) guardar(id, como, a);
            }
            await cerrarModal(marco);
        }
    } finally {
        await nav.close().catch(() => {});
    }
}

main().catch((e) => {
    b.log('error', 'pdf-uno', String(e?.message ?? e));
    process.exitCode = 1;
});
