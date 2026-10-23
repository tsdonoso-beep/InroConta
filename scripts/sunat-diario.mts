// La consulta diaria a SUNAT
//
// Corre en GitHub Actions, no en Vercel: allá un cron solo puede correr una
// vez al día y cada ejecución muere al minuto, mientras que el ticket de
// SUNAT tarda entre uno y tres minutos.
//
// Consulta el mes en curso y el anterior. El anterior porque los proveedores
// siguen declarando después del cierre, así que un mes «terminado» cambia
// durante semanas; el actual para ver lo que va entrando.
//
// Guarda en la base v2 con la llave de servicio (sin cuenta de persona: la
// clave de nadie vive en un servidor) y anota cada consulta en `corrida`.

import { createClient } from '@supabase/supabase-js';
import { credencialesDe } from '../src/shared/lib/sunat/credenciales.ts';
import { pedirExportacion, consultarTicket, bajarArchivo, procesoEnCurso } from '../src/shared/lib/sunat/sire.ts';
import { periodoDe, periodoCerradoAnterior, validarPeriodo } from '../src/shared/lib/sunat/periodo.ts';
import { leerZip } from '../src/shared/lib/sunat/zip.ts';
import { leerPropuestaRce, revisarIdentidad } from '../src/shared/lib/sunat/rce.ts';
import { filasComprobantesSunat, mapaPadronPorRuc, TIPOS_SUNAT, type ComprobanteHistorico } from '../src/shared/lib/export/comprobantes-sunat.ts';
import { publicarHojaPorAnio } from '../src/shared/lib/drive/servidor.ts';
import { docKey, readHistory, readPadron, readRenderedBy, registerSireRun } from './local/comun/historico.mts';

const EMPRESA = process.env.SUNAT_EMPRESA ?? 'INROPRIN';
const RUC = process.env.SUNAT_RUC ?? '20512201611';

/**
 * Corta la ejecución diciendo qué falta, en vez de fallar más adelante.
 *
 * Acepta más de un nombre porque Supabase reserva el prefijo SUPABASE_ en sus
 * propios secretos, y quien copie los valores desde ahí llega con los nombres
 * que Supabase permitió. Los dos sirven; fallar por el nombre habiendo puesto
 * el valor correcto sería una pérdida de tiempo tonta.
 */
function exigir(...nombres: string[]): string {
    for (const n of nombres) {
        const v = (process.env[n] ?? '').trim();
        if (v) return v;
    }
    console.error(
        `✗ Falta ${nombres.join(' o ')}.\n` +
            '  Van en GitHub · Settings · Secrets and variables · Actions,\n' +
            '  no en los secretos de Supabase: Actions no puede leer de ahí.',
    );
    process.exit(1);
}

const url = exigir('SUPABASE_URL_V2');
const llave = exigir('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY');

const leidas = credencialesDe(EMPRESA, RUC, process.env);
if (!leidas.ok) {
    console.error('✗ ' + leidas.motivo);
    process.exit(1);
}
const cred = leidas.cred;

const sb = createClient(url, llave, {
    auth: { autoRefreshToken: false, persistSession: false },
});

/** Espera a que SUNAT tenga listo el archivo. */
async function esperarTicket(periodo: string, ticket: string) {
    const limite = Date.now() + 6 * 60 * 1000;
    while (Date.now() < limite) {
        await new Promise((r) => setTimeout(r, 8000));
        const t = await consultarTicket(cred, periodo, ticket);
        if (!t) continue;
        if (t.fallado) throw new Error(`SUNAT rechazó el proceso: ${t.descripcion}`);
        if (t.terminado && t.archivo) {
            return {
                ...t.archivo,
                periodo: t.archivo.periodo || periodo,
                numTicket: t.archivo.numTicket || ticket,
            };
        }
    }
    throw new Error(`El ticket ${ticket} no terminó en seis minutos.`);
}

/**
 * Pide la exportación, esperando si hay otra en curso.
 *
 * SUNAT admite un proceso a la vez por contribuyente. Al consultar varios
 * meses seguidos, el siguiente llega antes de que el anterior termine de
 * cerrarse del lado de ellos, y sin esto el período se perdía.
 */
async function pedirConPaciencia(periodo: string): Promise<string> {
    const INTENTOS = 5;
    const ESPERA_MS = 30000;

    for (let i = 1; ; i++) {
        try {
            return await pedirExportacion(cred, periodo, 'csv');
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const enCurso = procesoEnCurso(msg);
            if (!enCurso || i >= INTENTOS) throw e;
            console.log(
                `  SUNAT tiene otra exportación en curso${enCurso.ticket ? ` (ticket ${enCurso.ticket})` : ''}.` +
                    ` Esperando ${ESPERA_MS / 1000} s — intento ${i} de ${INTENTOS - 1}.`,
            );
            await new Promise((r) => setTimeout(r, ESPERA_MS));
        }
    }
}

async function consultar(periodo: string): Promise<boolean> {
    const arranque = Date.now();
    console.log(`\n── ${periodo} ──`);

    const ticket = await pedirConPaciencia(periodo);
    console.log(`  ticket ${ticket}`);

    const archivo = await esperarTicket(periodo, ticket);
    console.log(`  archivo ${archivo.nombre}`);

    const dentro = leerZip(await bajarArchivo(cred, archivo));
    if (dentro.length === 0) throw new Error('El archivo de SUNAT vino vacío.');
    const reporte = dentro.reduce((a, b) => (b.contenido.length > a.contenido.length ? b : a));

    const { filas, ...lectura } = leerPropuestaRce(reporte.contenido.toString('utf8'));
    const identidad = revisarIdentidad(filas, cred.ruc);
    if (!identidad.ok) console.error(`  ⚠ ${identidad.motivo}`);
    console.log(`  ${filas.length} comprobantes leídos`);
    if (lectura.rucSospechoso > 0) {
        console.log(`  ⚠ ${lectura.rucSospechoso} fila(s) con algo sin forma de RUC/DNI: se guardaron sin proveedor.`);
    }

    const { data: g, error: eG } = await sb.rpc('guardar_comprobantes_sunat', {
        p_empresa_ruc: cred.ruc,
        p_periodo: periodo,
        p_filas: filas,
    });
    if (eG) throw new Error(`No se pudieron guardar: ${eG.message}`);
    const guardado = (Array.isArray(g) ? g[0] : g) ?? { nuevos: 0, cambiados: 0 };
    console.log(`  ${guardado.nuevos} nuevos · ${guardado.cambiados} distintos de la última vez`);

    const eB = await registerSireRun(sb, {
        empresaRuc: cred.ruc,
        periodo,
        ticket,
        archivo: reporte.nombre,
        filas: filas.length,
        startedAt: new Date(arranque),
        // Los mismos campos que guardaba registrar_consulta_sunat (la mudanza los dejó así en `resumen`).
        resumen: {
            nuevos: guardado.nuevos,
            cambiados: guardado.cambiados,
            comprobantes_nuestros: 0,
            cuadran: 0,
            monto_distinto: 0,
            no_estan_en_sunat: 0,
            no_comparables: 0,
            solo_en_sunat: 0,
            monto_solo_en_sunat: 0,
            columnas_faltantes: lectura.faltantes,
            // Para saber después si una columna viene vacía de verdad o si el
            // lector no la encuentra, sin mirar la pantalla en el momento justo.
            columnas_sin_usar: lectura.sinMapear,
            identidad_sospechosa: identidad.ok ? null : identidad.motivo,
        },
    });
    if (eB) console.error(`  ⚠ No se pudo anotar en la bitácora: ${eB}`);

    return guardado.cambiados > 0;
}

/**
 * Deja la hoja de Contabilidad al día.
 *
 * Sin esto la hoja se congela hasta que alguien entre a la aplicación y le dé
 * al botón, que es justo lo que se quería evitar al automatizar la consulta:
 * quien la mira vería datos viejos sin ninguna señal de que lo son.
 *
 * Es opcional: si faltan las credenciales de Drive, la consulta igual sirvió
 * y los datos quedaron guardados. Se avisa y se sigue.
 */
/** El histórico de comprobantes, en orden de fecha. Null (y avisa) si algo falla. */
async function leerHistorico(): Promise<ComprobanteHistorico[] | null> {
    for (let intento = 1; intento <= 3; intento++) {
        try {
            return await readHistory(sb, cred.ruc);
        } catch (e) {
            console.error(`⚠ No se pudo leer el histórico para la hoja (intento ${intento}/3):`, e instanceof Error ? e.message : e);
            await new Promise((r) => setTimeout(r, 3000 * intento));
        }
    }
    return null;
}

async function publicarLaHoja(): Promise<void> {
    if (!process.env.GOOGLE_SA_EMAIL || !process.env.GOOGLE_DRIVE_FOLDER_ID) {
        console.log('\nSin credenciales de Drive: no se actualiza la hoja de Contabilidad.');
        return;
    }

    // Tablas leídas de a 1000 filas (allPages): ninguna consulta arma el
    // histórico entero en la base, que es lo que pasaba los 8 s (02/10/2026).
    const data = await leerHistorico();
    if (!data) return;

    // Quién rindió cada comprobante: es la columna que SUNAT no puede dar, y la
    // que hace que esta hoja valga más que bajar el archivo del portal.
    const quien = await readRenderedBy(sb).catch((e) => {
        console.error('⚠ No se pudo leer quién rindió cada comprobante:', e instanceof Error ? e.message : e);
        return new Map<string, string>();
    });

    const aNum = (v: unknown) => (v == null || v === '' ? null : Number(v));

    const historico = (data as ComprobanteHistorico[]).map((c) => ({
        ...c,
        total: aNum(c.total),
        base: aNum(c.base),
        igv: aNum(c.igv),
        detraccion: aNum(c.detraccion),
        tipoCambio: aNum(c.tipoCambio),
        rendidoPor: quien.get(docKey(c.proveedorRuc, c.tipoComprobante, c.serie, c.numero)) ?? null,
    }));

    // La condición del RUC (Buen Contribuyente / Agente de Retención), de las
    // columnas que llena el scraper de Playwright en `contribuyente`. Una fila
    // por proveedor, no por comprobante (de a 1000: ya pasa de mil).
    const padronCrudo = await readPadron(sb).catch((e) => {
        console.error('⚠ No se pudo leer el padrón de RUC:', e instanceof Error ? e.message : e);
        return [];
    });
    const padron = mapaPadronPorRuc(padronCrudo);

    const r = await publicarHojaPorAnio({
        filas: filasComprobantesSunat(historico, padron),
        nombre: 'COMPROBANTES SUNAT',
        carpetas: ['SUNAT'],
        tipos: TIPOS_SUNAT,
    });
    console.log(`\nHoja al día: ${historico.length} comprobantes · ${r.url}`);
    for (const a of r.anteriores) console.log(`Hoja aparte ${a.anio}: ${a.filas} filas · ${a.url}`);
}

const hoy = new Date();

/**
 * Qué períodos consultar.
 *
 * Por omisión, el mes en curso y el anterior: el anterior porque los
 * proveedores siguen declarando después del cierre. Se puede pasar una lista
 * para rellenar meses viejos, que es lo que hace falta cuando se agrega una
 * columna nueva y los datos de antes la tienen vacía.
 *
 * Los inválidos se descartan con su motivo en vez de intentarlos: SUNAT
 * limita cuántas exportaciones se encolan seguidas, y gastar una en un
 * período mal escrito cuesta el siguiente.
 */
function periodosAConsultar(): string[] {
    const pedidos = (process.env.PERIODOS ?? '')
        .split(/[,\s]+/)
        .map((p) => p.trim())
        .filter(Boolean);

    if (pedidos.length === 0) {
        return [periodoDe(hoy), periodoCerradoAnterior(hoy)].filter((p) => validarPeriodo(p, hoy).ok);
    }

    const buenos: string[] = [];
    for (const p of pedidos) {
        const v = validarPeriodo(p, hoy);
        if (v.ok) buenos.push(v.periodo);
        else console.error(`✗ Se descarta ${p}: ${v.motivo}`);
    }
    return buenos;
}

/**
 * Rehacer la hoja sin volver a preguntarle a SUNAT.
 *
 * Hace falta cuando cambia la forma de la hoja —una columna nueva, un tipo de
 * celda distinto— y los datos ya están guardados. Preguntar de nuevo no
 * aportaría nada y costaría una de las pocas exportaciones que SUNAT deja
 * encolar por día.
 */
if (process.env.SOLO_PUBLICAR === '1') {
    await publicarLaHoja();
    process.exit(0);
}

const periodos = periodosAConsultar();
if (periodos.length === 0) {
    console.error('✗ No quedó ningún período válido que consultar.');
    process.exit(1);
}
console.log(`Períodos: ${periodos.join(', ')}`);

// Entre un período y otro se espera: pedir seis seguidos ya devolvió un 429.
const DESCANSO_MS = 20000;

let hubo = false;
const fallaron: string[] = [];

for (const [i, p] of periodos.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, DESCANSO_MS));
    try {
        if (await consultar(p)) hubo = true;
    } catch (e) {
        // Un período que falla no debe impedir el otro: SUNAT limita cuántas
        // exportaciones se encolan seguidas, y perder los dos por eso sería
        // perder el día entero.
        const motivo = e instanceof Error ? e.message : String(e);
        console.error(`  ✗ ${p}: ${motivo}`);
        fallaron.push(`${p}: ${motivo}`);
    }
}

console.log(`\n${hubo ? '⚠ Hubo comprobantes que cambiaron.' : 'Sin cambios.'}`);

// La hoja se actualiza aunque algún período haya fallado: lo que sí entró
// merece quedar visible.
try {
    await publicarLaHoja();
} catch (e) {
    console.error('⚠ No se pudo actualizar la hoja:', e instanceof Error ? e.message : String(e));
}

if (fallaron.length === periodos.length) {
    console.error('\n✗ Fallaron todos los períodos.');
    process.exit(1);
}
if (fallaron.length) {
    console.error(`\n⚠ Falló ${fallaron.length} de ${periodos.length}:\n  ${fallaron.join('\n  ')}`);
}
