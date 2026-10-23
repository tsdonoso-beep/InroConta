// Leer la hoja privada de Contabilidad (Compras, COMEX, CG y Almacén) y subirla a la base v2
//
// La hoja la llena CopiarFuentes.gs dos veces al día (00:45 y 11:15), con los
// permisos de quien la instaló, desde los archivos originales: la base de
// compras nacionales, el STATUS DE CARGAS de COMEX, la base de Control de
// Gestión (pestaña «CG - REGISTRO COMPRAS») y el kardex de Almacén.
// Está compartida como Lector SOLO con la cuenta de servicio del robot.
//
// Esto la lee entera (sin formato: fechas como número de serie, montos como
// número), la junta por OC y por vale (src/shared/lib/drive/fuentes-compras.ts,
// src/shared/lib/oc/), compara con lo que ya tiene la base (un monto, una DAM,
// un vale corregido o anulado) y la guarda con guardar_fuente_oc, una vez por
// fuente, con esos cambios. Cuándo se copió cada pestaña va a `corrida`.
// Entra a la base v2 con SUPABASE_URL_V2 + SUPABASE_SECRET_KEY.
//
//   FUENTES_HOJA   el ID de la hoja privada (por omisión, la de Contabilidad)
//   FUENTES_JSON   en vez de leer la hoja, un archivo con las pestañas
//                  ({ "NACIONALES": [[…], …], … }), para probar en la computadora
//   DEBUG=1        lee y resume, pero no sube nada a la base
//
// Corre en el flujo de las carpetas (carpetas-oc.yml), antes de leerlas.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { conectarDrive } from '../src/shared/lib/drive/servidor.ts';
import { leerFuentes, PESTANAS, type Celda } from '../src/shared/lib/drive/fuentes-compras.ts';
import { CG_TAB, cgRows } from '../src/shared/lib/oc/base-cg.ts';
import { orderKey, sourceChanges } from '../src/shared/lib/oc/cambios-fuentes.ts';
import { copyRuns, keepResolved, sourceRows } from '../src/shared/lib/oc/fuentes.ts';
import { cargarClaveDeArchivo } from './local/comun/config.mts';
import { baseV2, type Base } from './local/oc/base.mts';
import { canonicalCode, knownOrders, loadSource, readSourcesState, rowsBefore, saveCopies, type Source, type SourcesState } from './local/oc/fuentes.mts';

cargarClaveDeArchivo();

const DEBUG = process.env.DEBUG === '1';
const HOJA = process.env.FUENTES_HOJA?.trim() || '1sJhaKxamPG1lIEAaso5uprqUU_ixHLylQtAY53KUEms';
const EMPRESA_RUC = process.env.EMPRESA_RUC?.trim() || '20512201611';
const SALIDA = join(process.cwd(), 'scripts', 'out', 'salida', 'fuentes-compras');
mkdirSync(SALIDA, { recursive: true });

type Pestanas = Partial<Record<(typeof PESTANAS)[number] | typeof CG_TAB, Celda[][]>>;

/** Las pestañas de la hoja privada, sin formato. Las que no están no se piden (Sheets rechaza todo el pedido). */
async function leerHoja(): Promise<Pestanas> {
    const { hojas } = conectarDrive();
    const meta = await hojas.spreadsheets.get({ spreadsheetId: HOJA, fields: 'properties(title),sheets(properties(title))' });
    const hay = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title ?? ''));
    console.log(`· hoja «${meta.data.properties?.title}»: ${[...hay].join(', ')}`);
    const pedir = ([...PESTANAS, CG_TAB] as const).filter((p) => hay.has(p));
    const r = await hojas.spreadsheets.values.batchGet({
        spreadsheetId: HOJA,
        ranges: pedir.map((p) => `'${p}'`),
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'SERIAL_NUMBER',
    });
    const out: Pestanas = {};
    (r.data.valueRanges ?? []).forEach((v, i) => {
        out[pedir[i]] = (v.values ?? []) as Celda[][];
    });
    return out;
}

const inicio = Date.now();
const pestanas: Pestanas = process.env.FUENTES_JSON?.trim() ? JSON.parse(readFileSync(process.env.FUENTES_JSON.trim(), 'utf8')) : await leerHoja();
const f = leerFuentes(pestanas);

const resumen = {
    hoja: HOJA,
    compras: {
        nacionales: f.compras.filter((c) => c.procedencia === 'Nacional').length,
        importaciones: f.compras.filter((c) => c.procedencia === 'Importación').length,
    },
    comex: f.comex.length,
    vales: f.vales.length,
    valesConOc: f.vales.filter((v) => v.oc).length,
    copia: f.estado,
    avisos: f.avisos,
    carga: {} as Record<string, unknown>,
};
for (const a of f.avisos) console.log(`⚠ ${a}`);
console.log(`· Compras: ${resumen.compras.nacionales} OC nacionales y ${resumen.compras.importaciones} de importación`);
console.log(`· COMEX: ${resumen.comex} OC · Almacén: ${resumen.vales} vales (${resumen.valesConOc} con OC)`);
// Una copia vieja no se descarta (es lo último que hay), pero se avisa.
const ultima = f.estado
    .map((e) => e.fin ?? e.inicio ?? '')
    .filter(Boolean)
    .sort()
    .pop();
if (ultima) {
    const horas = (Date.now() - new Date(ultima).getTime()) / 3600000;
    console.log(`· la hoja se copió por última vez: ${ultima}${horas > 20 ? ` ⚠ hace ${Math.round(horas)} h (¿se detuvo CopiarFuentes.gs?)` : ''}`);
}
for (const e of f.estado) if (!/^OK/.test(e.resultado)) console.log(`⚠ ${e.pestana}: ${e.resultado}`);

// La base v2: en depuración solo se lee (para armar lo que se guardaría y dejarlo en el artefacto),
// y si no hay acceso se arma igual, sin comparar con nada.
let v2: SourcesState = { orders: new Map(), duas: new Map(), vouchers: new Map(), cgRows: 0, costCentres: [] };
let sb: Base | null = null;
try {
    sb = baseV2();
    v2 = await readSourcesState(sb, EMPRESA_RUC);
} catch (e) {
    if (!DEBUG) throw e;
    console.log(`⚠ sin la base v2 (${e instanceof Error ? e.message : e}): no se compara con lo que ya está`);
}
const filas = sourceRows(f);
const cg = cgRows(pestanas[CG_TAB], knownOrders(v2, filas.COMPRAS), canonicalCode(v2));
const cargas: [Source, Record<string, unknown>[], boolean][] = [
    ['COMPRAS', keepResolved(filas.COMPRAS, v2.orders, orderKey), !!pestanas['NACIONALES']?.length || !!pestanas['IMPO - BASE']?.length],
    ['COMEX', filas.COMEX, !!pestanas['IMPO - STATUS']?.length],
    ['CG', cg, !!pestanas[CG_TAB]?.length],
    ['ALMACEN', filas.ALMACEN, !!pestanas['KARDEX - VALES']?.length],
];
console.log(`· CG: ${cg.length} filas (OC × centro de costo)${pestanas[CG_TAB]?.length ? '' : ` ⚠ falta la pestaña «${CG_TAB}»`}`);
if (DEBUG) {
    const seco = cargas.map(([n, x]) => [n, { filas: x, cambios: n === 'CG' ? [] : sourceChanges(n, x, v2, x.length >= rowsBefore(v2, n) / 2) }]);
    writeFileSync(join(SALIDA, 'cargas.json'), JSON.stringify(Object.fromEntries(seco), null, 1));
    for (const [n, x] of seco)
        console.log(`· ${n}: ${(x as { filas: unknown[] }).filas.length} filas, ${(x as { cambios: unknown[] }).cambios.length} cambios`);
    console.log('DEBUG=1: no se sube nada a la base (lo que se subiría quedó en cargas.json).');
} else {
    for (const [fuente, rows, hay] of cargas) {
        // Una pestaña que no llegó no se sube: borraría lo que ya está en la base.
        if (!hay) {
            console.log(`· ${fuente}: sin datos en la hoja, se deja lo que ya está en la base`);
            continue;
        }
        // Una hoja cortada (menos de la mitad de lo que había) suma, pero no borra.
        const completa = rows.length >= rowsBefore(v2, fuente) / 2;
        const d = await loadSource(sb!, EMPRESA_RUC, v2, fuente, rows, completa);
        resumen.carga[fuente] = d;
        console.log(
            `· ${fuente}: ${d.filas} filas (había ${d.habia}, quitadas ${d.quitadas}), ${d.cambios} cambios anotados${completa ? '' : ' ⚠ llegaron menos de la mitad: no se borró nada'}`,
        );
    }
    if (f.estado.length) {
        const n = await saveCopies(sb!, EMPRESA_RUC, copyRuns(f.estado, EMPRESA_RUC, new Date().toISOString()));
        resumen.carga.COPIA = n;
        console.log(`· COPIA: ${n} pestañas con una copia nueva`);
    }
}

writeFileSync(join(SALIDA, 'resumen.json'), JSON.stringify(resumen, null, 2));
console.log(`listo en ${Math.round((Date.now() - inicio) / 1000)} s`);
