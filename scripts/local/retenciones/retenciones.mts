// Withholding certificates (comprobantes de retención, CRE): from SOL to Drive (PDF + XML) and the base.
//
//   login (usual menu) → «Consultar Emisión y Recepción» (option 11.5.8) → per month of ISSUE date and side
//   (emitido / recibido): the list (buscarComprobanteEmiRec) → per new or changed CRE, ONE AT A TIME (the
//   download is of the last detail loaded in the session): detail → PDF → XML → then, in a POOL of
//   SUBIDAS at a time while the next CRE is read: disk → Drive Retenciones/Compras|Ventas/AAAA-MM → base
//   (guardar_retenciones, 20 per batch) → at the end, if any came in, COMPROBANTES SUNAT - DETALLE again,
//   whose six last columns are the retention of each invoice (migration 070), next to the detraction ones.
//
// A CRE already saved with the same state and its files is not read again; one that went from EMITIDO to
// REVERTIDO is. A reverted CRE has no download (the page hides it): it is saved without files.
//
// Use:  pnpm retenciones:local                                   (the last 10 days)
//       DESDE=01/01/2026 pnpm retenciones:local                  (first load: January to today, month by month)
//       GUARDAR=0 DESDE=01/09/2026 HASTA=30/09/2026 pnpm retenciones:local     (test: disk only)
// Variables: DESDE · HASTA (dd/mm/aaaa; HASTA by default today in Lima) · DIAS (10, without DESDE)
//   SENTIDOS (emitido,recibido) · GUARDAR (1; 0 = neither Drive nor base) · LIMITE (0 = all)
//   SUBIDAS (4 at a time to Drive) · PUBLICAR (si-hay-nuevas | siempre | nunca)
// The same SOL account as the other robots: never at the same time as another run with it.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Frame } from 'playwright';
import { num, RUC, texto } from '../comun/config.mts';
import { crearBitacora, primeraLinea, vigilarProceso } from '../comun/bitacora.mts';
import { abrirNavegador, entrar, ErrorSesion, guardarEvidencia, nuevoContexto } from '../sol/sesion.mts';
import { publicarDetalle } from '../comun/guardar.mts';
import { aFecha, haceDias, hoyLima, partir, tramosPorMes, type Tramo } from '../detracciones/registro.mts';
import { respaldar, statsDrive, subir } from '../detracciones/archivo.mts';
import { abrirConsulta, buscar, descargar, detalle, type CreLista } from './sol.mts';
import { claveCre, estadoDe, fechaLima, nombreBase, registro, rutaDrive, sentidoDe, type Registro } from './registro.mts';
import { guardadas, guardarLote, statsBase } from './guardar.mts';

const DIR_SALIDA = join(process.cwd(), 'scripts', 'out', 'salida', 'retenciones');
const HASTA = texto('HASTA', hoyLima());
const DESDE = texto('DESDE', haceDias(num('DIAS', 10), HASTA));
const SENTIDOS = texto('SENTIDOS', 'emitido,recibido')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is 'emitido' | 'recibido' => s === 'emitido' || s === 'recibido');
const GUARDAR = texto('GUARDAR', '1') !== '0';
const LIMITE = num('LIMITE', 0);
const SUBIDAS = Math.max(1, num('SUBIDAS', 4));
const PUBLICAR = texto('PUBLICAR', 'si-hay-nuevas');

const b = crearBitacora('retenciones');
vigilarProceso(b);
aFecha(DESDE);
aFecha(HASTA);
b.log(
    'info',
    'inicio',
    `emisión ${DESDE} a ${HASTA} · ${SENTIDOS.join(' y ')} · ${GUARDAR ? 'guarda en Drive y en la base' : 'PRUEBA: solo disco'} · ${SUBIDAS} subidas a la vez${LIMITE ? ` · límite ${LIMITE}` : ''} · logs en ${b.dir}`,
);

const s = { consultas: 0, enLista: 0, yaEstaban: 0, bajados: 0, revertidos: 0, sinArchivo: 0, fallidos: 0 };
const resumen: Record<string, unknown> = { desde: DESDE, hasta: HASTA, sentidos: SENTIDOS, guardar: GUARDAR };
const conocidas = GUARDAR ? await guardadas(b) : null;
if (conocidas) b.log('info', 'base', `${conocidas.size} comprobantes ya guardados: no se vuelven a bajar si siguen igual`);

const nav = await abrirNavegador();
const ctx = await nuevoContexto(nav);
const page = await ctx.newPage();
page.on('dialog', (d) => {
    b.log('aviso', 'dialogo', `la página mostró: «${d.message().slice(0, 200)}»`);
    d.accept().catch(() => {});
});

const lote: Registro[] = [];
const todos: Registro[] = [];
const vistos = new Set<string>();
const subiendo = new Set<Promise<void>>();

try {
    await entrar(b, page, 'login');
    const form = await abrirConsulta(b, page);
    const cola: Array<{ t: Tramo; sentido: 'emitido' | 'recibido' }> = tramosPorMes(DESDE, HASTA).flatMap((t) => SENTIDOS.map((sentido) => ({ t, sentido })));
    for (let item = cola.shift(); item; item = cola.shift()) {
        if (LIMITE && s.bajados >= LIMITE) break;
        const { t, sentido } = item;
        const r = await buscar(form, sentido, t.desde, t.hasta);
        s.consultas++;
        if (!r.lista) {
            const mitades = r.estado === 0 || r.estado >= 500 ? partir(t) : null;
            b.log('aviso', 'lista', `${sentido} ${t.desde}–${t.hasta}: HTTP ${r.estado} sin lista${mitades ? ': se parte en dos' : ''}`, {
                respuesta: r.texto.slice(0, 500),
            });
            if (mitades) cola.unshift(...mitades.map((m) => ({ t: m, sentido })));
            else s.fallidos++;
            continue;
        }
        s.enLista += r.lista.length;
        b.log('info', 'lista', `${sentido} ${t.desde}–${t.hasta}: ${r.lista.length} comprobante(s)`);
        for (const c of r.lista) {
            if (LIMITE && s.bajados >= LIMITE) break;
            const k = claveCre(c.numRuc, c.numSerieCpe, c.numCpe);
            if (vistos.has(k)) continue;
            vistos.add(k);
            const antes = conocidas?.get(k);
            if (antes && antes.estado === estadoDe(c.codEstadoCpe) && antes.conArchivos) s.yaEstaban++;
            else await bajar(form, c);
        }
    }
    await Promise.all(subiendo);
    if (GUARDAR) await guardarLote(b, lote.splice(0));
    if (GUARDAR && PUBLICAR !== 'nunca' && (PUBLICAR === 'siempre' || s.bajados > 0)) await publicarDetalle(b);
} catch (e) {
    resumen.error = primeraLinea(e);
    b.log('error', 'retenciones', primeraLinea(e));
    for (const p of ctx.pages()) await guardarEvidencia(b, p, 'fallo');
    await Promise.allSettled(subiendo);
    if (GUARDAR) await guardarLote(b, lote.splice(0));
} finally {
    writeFileSync(join(b.dir, 'comprobantes.json'), JSON.stringify(todos, null, 2));
    Object.assign(resumen, { ...s, drive: statsDrive, base: statsBase, salida: DIR_SALIDA });
    writeFileSync(join(b.dir, 'resumen.json'), JSON.stringify(resumen, null, 2));
    b.log(
        'info',
        'resumen',
        `${s.consultas} consultas · ${s.enLista} en lista · ${s.yaEstaban} ya estaban · ${s.bajados} bajados (${s.revertidos} revertidos, ${s.sinArchivo} sin archivo) · ${s.fallidos} fallidos · Drive ${JSON.stringify(statsDrive)} · base ${JSON.stringify(statsBase)}`,
    );
    await nav.close().catch(() => {});
}
process.exit(resumen.error || (s.fallidos > 0 && s.bajados === 0) ? 1 : 0);

/** One CRE against SUNAT (detail → PDF → XML, in that order); disk, Drive and the base go to the pool. */
async function bajar(form: Frame, c: CreLista): Promise<void> {
    const nombre = nombreBase(c);
    try {
        const d = await detalle(form, c);
        const emitido = estadoDe(d.cre.codEstadoCpe ?? c.codEstadoCpe) === 'EMITIDO';
        const pdf = emitido ? await descargar(form, 'PDF') : null;
        const xml = emitido ? await descargar(form, 'XML') : null;
        s.bajados++;
        if (!emitido) s.revertidos++;
        if (emitido && (!pdf || !xml)) {
            s.sinArchivo++;
            b.log('aviso', 'archivo', `${nombre}: SUNAT no dio ${!pdf ? 'el PDF' : ''}${!pdf && !xml ? ' ni ' : ''}${!xml ? 'el XML' : ''}`);
        }
        while (subiendo.size >= SUBIDAS) await Promise.race(subiendo);
        const job = archivar(c, d, nombre, pdf, xml).finally(() => subiendo.delete(job));
        subiendo.add(job);
    } catch (e) {
        if (e instanceof ErrorSesion) throw e;
        s.fallidos++;
        b.log('error', 'comprobante', `${nombre}: ${primeraLinea(e)} (la próxima corrida lo vuelve a intentar)`);
    }
}

async function archivar(c: CreLista, d: Awaited<ReturnType<typeof detalle>>, nombre: string, pdf: Buffer | null, xml: Buffer | null): Promise<void> {
    const ruta = rutaDrive(sentidoDe(c, RUC), fechaLima(d.cre.fechaEmision ?? c.fechaEmision));
    if (pdf) respaldar(ruta, `${nombre}.pdf`, pdf, DIR_SALIDA);
    if (xml) respaldar(ruta, `${nombre}.xml`, xml, DIR_SALIDA);
    const [pdfUrl, xmlUrl] = GUARDAR
        ? await Promise.all([
              pdf ? subir(b, ruta, `${nombre}.pdf`, pdf, 'application/pdf') : null,
              xml ? subir(b, ruta, `${nombre}.xml`, xml, 'text/xml') : null,
          ])
        : [null, null];
    const reg = registro(c, d, RUC, { pdf: pdfUrl, xml: xmlUrl });
    todos.push(reg);
    b.log(
        'info',
        'comprobante',
        `${reg.serie}-${reg.numero} · ${reg.estado} · ${reg.receptorRuc} · S/ ${reg.montoRetenido} · ${reg.documentos.length} factura(s) · ${ruta.slice(1).join('/')}`,
    );
    if (GUARDAR) {
        lote.push(reg);
        if (lote.length >= 20) await guardarLote(b, lote.splice(0));
    }
}
