// Leer el resultado de la Consulta RUC pública de SUNAT
//
// Si a una compra le corresponde o no la retención del IGV depende, entre
// otras cosas, de si el proveedor es Buen Contribuyente o Agente de
// Retención/Percepción. Eso no lo trae el registro de compras ni el XML del
// comprobante: solo lo dice la Consulta RUC (e-consultaruc.sunat.gob.pe).
//
// Esa página no se puede consultar con una petición suelta: el botón
// «Buscar» dispara un reCAPTCHA v3 (grecaptcha.execute) que solo un
// navegador de verdad puede resolver, y recién con ese token manda el
// formulario. Por eso la consulta la hace `scripts/consultar-padron-ruc.mts`
// con Playwright, no Apps Script.
//
// Esto solo se ocupa de la mitad que no depende del navegador: interpretar
// el HTML de resultado. Igual que el resto de `src/shared/lib/sunat`, no lanza por un
// campo que falte: devuelve lo que entendió, con `encontrado: false` cuando
// ni siquiera reconoció la página.

import { readFicha, type RucFicha } from './ruc-ficha.ts';

export interface CondicionRuc {
    ruc: string;
    razonSocial: string | null;
    /** "ACTIVO", "BAJA DE OFICIO"... tal como lo devuelve SUNAT. */
    estado: string | null;
    /** "HABIDO" o "NO HABIDO". */
    condicion: string | null;
    buenContribuyente: boolean;
    agenteRetencion: boolean;
    agentePercepcion: boolean;
    /** El texto bajo «Padrones:», para lo que los tres booleanos no explican (resolución, fecha). Vacío si era "NINGUNO". */
    padronesTexto: string | null;
    /** false si la página no trajo ni el Estado ni el RUC: no se pudo leer el resultado. */
    encontrado: boolean;
    /** Every other field of the page (see ruc-ficha.ts); null when the page could not be read. */
    ficha: RucFicha | null;
}

/** Las etiquetas que trae la pantalla, en orden. Marcan dónde termina el valor de la anterior. */
const ETIQUETAS_CONSULTA_RUC = [
    // Deregistered RUC only: a red notice before «Número de RUC» and again after «Padrones».
    'IMPORTANTE:',
    'Número de RUC:',
    'Tipo Contribuyente:',
    // Natural persons only.
    'Tipo de Documento:',
    'Nombre Comercial:',
    'Fecha de Inscripción:',
    'Fecha de Inicio de Actividades:',
    'Estado del Contribuyente:',
    // Deregistered RUC only. Without it the date ended up inside the state («BAJA DE OFICIO Fecha de Baja: …»).
    'Fecha de Baja:',
    'Condición del Contribuyente:',
    'Domicilio Fiscal:',
    'Sistema Emisión de Comprobante:',
    'Actividad Comercio Exterior:',
    'Sistema Contabilidad:',
    'Actividad(es) Económica(s):',
    'Comprobantes de Pago c/aut. de impresión',
    'Sistema de Emisión Electrónica:',
    'Emisor electrónico desde:',
    'Comprobantes Electrónicos:',
    'Afiliado al PLE desde:',
    'Padrones:',
    'Fecha consulta:',
    // Tras «Padrones» la página trae un «Razón Social: eeee -->» suelto: no es del padrón.
    'Razón Social:',
];

/**
 * El HTML de resultado, reducido a una lista de líneas de texto.
 *
 * No se sigue la estructura exacta de tablas/celdas —eso cambia con
 * cualquier rediseño menor del portal—; se aplana todo a texto y se busca por
 * las etiquetas, que SUNAT mantiene estables porque las lee gente.
 */
function textoPlano(html: string): string[] {
    return (
        html
            // The page carries a commented-out «Razón Social: eeee» block that leaked into «Padrones».
            .replace(/<!--[\s\S]*?-->/g, ' ')
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<(br|tr|p|div|li|table|\/table)\b[^>]*>/gi, '\n')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(parseInt(dec, 10)))
            .replace(/&nbsp;/gi, ' ')
            .replace(/&aacute;/gi, 'á')
            .replace(/&eacute;/gi, 'é')
            .replace(/&iacute;/gi, 'í')
            .replace(/&oacute;/gi, 'ó')
            .replace(/&uacute;/gi, 'ú')
            .replace(/&Aacute;/g, 'Á')
            .replace(/&Eacute;/g, 'É')
            .replace(/&Iacute;/g, 'Í')
            .replace(/&Oacute;/g, 'Ó')
            .replace(/&Uacute;/g, 'Ú')
            .replace(/&ntilde;/gi, 'ñ')
            .replace(/&Ntilde;/g, 'Ñ')
            .replace(/&deg;/gi, '°')
            .replace(/&ordm;/gi, 'º')
            .replace(/&amp;/gi, '&')
            .split('\n')
            .map((l) => l.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
    );
}

/**
 * El valor de una etiqueta: en la misma línea (si el HTML la puso en una
 * sola celda) o repartido en las líneas siguientes hasta la próxima etiqueta
 * conocida —el caso de «Padrones», que a veces trae la resolución y la
 * fecha en renglones separados.
 */
function valorEtiqueta(lineas: string[], etiqueta: string): string {
    return lineasEtiqueta(lineas, etiqueta).join(' ').trim();
}

/** Lo mismo que `valorEtiqueta`, pero renglón por renglón: las listas de la ficha (actividades, comprobantes) los necesitan. */
function lineasEtiqueta(lineas: string[], etiqueta: string): string[] {
    const inicio = lineas.findIndex((l) => l.startsWith(etiqueta));
    if (inicio === -1) return [];

    const partes: string[] = [];
    const resto = lineas[inicio].slice(etiqueta.length).trim();
    if (resto) partes.push(resto);

    for (let j = inicio + 1; j < lineas.length; j++) {
        if (ETIQUETAS_CONSULTA_RUC.some((e) => lineas[j].startsWith(e))) break;
        partes.push(lineas[j]);
    }
    return partes;
}

export interface Padrones {
    buenContribuyente: boolean;
    agenteRetencion: boolean;
    agentePercepcion: boolean;
}

const REGIMEN = /(Incorporado\s+al|Excluido\s+del)\s+Régimen\s+de\s+((?:(?!Incorporado|Excluido)[\s\S])*?)\s+a\s+partir\s+del\s+(\d{2})\/(\d{2})\/(\d{4})/gi;

/**
 * Qué dicen hoy los padrones.
 *
 * «Padrones:» es un historial, no un estado: trae renglones «Incorporado al
 * Régimen de Agentes de Retención de IGV (R.S. …) a partir del …» y también
 * «Excluido del Régimen …», y un RUC puede tener los dos. Cuenta el último de
 * cada régimen (por fecha). Antes se buscaba solo «agente de retención» en
 * singular y la página dice «Agentes»: ningún agente quedó marcado (209 de 3 011
 * RUC se vieron así el 09/10/2026, entre ellos INROPRIN, agente de retención desde 2010).
 */
export function leerPadrones(texto: string | null): Padrones {
    const vigente = new Map<string, { fecha: string; incorporado: boolean }>();
    for (const m of (texto ?? '').matchAll(REGIMEN)) {
        // «Agentes de Retención de IGV (R.S.217-2010)» → la clave es el régimen, sin la norma.
        const regimen = m[2].replace(/\(.*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
        const fecha = `${m[5]}-${m[4]}-${m[3]}`;
        const previo = vigente.get(regimen);
        if (!previo || fecha >= previo.fecha) vigente.set(regimen, { fecha, incorporado: /^incorporado/i.test(m[1]) });
    }
    const alguno = (patron: RegExp) => [...vigente].some(([regimen, v]) => v.incorporado && patron.test(regimen));
    return {
        buenContribuyente: alguno(/buenos?\s+contribuyentes/),
        agenteRetencion: alguno(/agentes?\s+de\s+retenci/),
        agentePercepcion: alguno(/agentes?\s+de\s+percepci/),
    };
}

/**
 * Interpreta el resultado de la consulta.
 *
 * `Padrones` trae «NINGUNO» cuando el RUC no está en ningún padrón, o el
 * historial de regímenes (ver `leerPadrones`) cuando sí.
 */
export function leerResultadoConsultaRuc(html: string, ruc: string): CondicionRuc {
    const lineas = textoPlano(html);

    const lineaRuc = valorEtiqueta(lineas, 'Número de RUC:');
    const estado = valorEtiqueta(lineas, 'Estado del Contribuyente:') || null;
    const condicion = valorEtiqueta(lineas, 'Condición del Contribuyente:') || null;
    const padrones = valorEtiqueta(lineas, 'Padrones:');

    if (!lineaRuc && !estado) {
        return {
            ruc,
            razonSocial: null,
            estado: null,
            condicion: null,
            buenContribuyente: false,
            agenteRetencion: false,
            agentePercepcion: false,
            padronesTexto: null,
            encontrado: false,
            ficha: null,
        };
    }

    const guion = lineaRuc.indexOf(' - ');
    const razonSocial = guion >= 0 ? lineaRuc.slice(guion + 3).trim() || null : null;
    const ningunPadron = /^ninguno$/i.test(padrones.trim());

    return {
        ruc,
        razonSocial,
        estado,
        condicion,
        ...leerPadrones(padrones),
        padronesTexto: ningunPadron ? null : padrones || null,
        encontrado: true,
        ficha: readFicha((etiqueta) => lineasEtiqueta(lineas, etiqueta)),
    };
}
