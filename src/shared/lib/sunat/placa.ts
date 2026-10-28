// La placa del vehículo en un comprobante
//
// Contabilidad (reunión del 27/10/2026, pedido de Rosa) quiere saber qué gastos van a qué
// vehículo: el combustible y los peajes sustentan gasto y crédito fiscal solo si el comprobante
// trae la placa. El emisor la pone en una de tres partes del XML:
//   1. `cac:AdditionalItemProperty` con código 7000 (catálogo 55 de SUNAT, «Gastos Art. 37
//      Renta: Número de Placa») o con un nombre que diga «placa»;
//   2. una `cbc:Note` de la cabecera («PLACA: ABC-123»);
//   3. la descripción del ítem («DIESEL B5 S50 PLACA ABC123»).
// Las reglas del texto son las de Carga CONCAR (`src/glosa.py`, `placa`), probadas con las
// rendiciones de caja chica: primero lo que va junto a la palabra PLACA, luego el formato ABC-123.
// La placa se guarda sin guion («ABC123»), como la escribe Carga CONCAR.

const PL = '([A-Z]{3}|[A-Z]\\d[A-Z]|[A-Z]{2}\\d)';
// «PLACA: ABC-123», «PLACA N° ABC123», «PLACA NRO. A1B 234».
const RX_ETIQUETA = new RegExp(`PLACA(?:[^A-Z0-9]{0,4}(?:NRO|NUM|N)(?![A-Z]))?[^A-Z0-9]{0,12}${PL}\\s*-?\\s*([0-9OD]{3})(?![0-9])`, 'g');
const RX_FORMATO = new RegExp(`(?<![A-Z0-9])${PL}\\s?-\\s?(\\d{3})(?![0-9])`, 'g');
/** Tres letras que no son una placa: «RUC-123», «IGV-018»… */
const NO_PLACA = new Set(['RUC', 'IGV', 'DNI', 'NRO', 'SOL', 'PEN', 'USD', 'TEL', 'CEL', 'FAX', 'COD', 'AV', 'JR', 'CAL', 'MZA', 'LOT']);

const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ');

function deRegex(rx: RegExp, texto: string): string[] {
    const out: string[] = [];
    for (const m of normal(texto).matchAll(rx)) {
        const letras = m[1];
        const numero = m[2].replace(/[OD]/g, '0');
        // Al menos dos letras («AB1», «A1B», «ABC»): «1A2» o «A12» son otra cosa.
        if (!NO_PLACA.has(letras) && /[A-Z].*[A-Z]/.test(letras)) out.push(`${letras}${numero}`);
    }
    return out;
}

/** Las placas de un texto, sin repetir, en el orden en que aparecen (las rotuladas «PLACA» primero). */
export function placasEnTexto(...textos: (string | null | undefined)[]): string[] {
    const vistos = new Set<string>();
    for (const rx of [RX_ETIQUETA, RX_FORMATO]) for (const t of textos) for (const p of deRegex(rx, t ?? '')) vistos.add(p);
    return [...vistos];
}

/** Una placa como se escribe para buscarla: sin guion ni espacios, en mayúsculas («abc-123» → «ABC123»). */
export const claveDePlaca = (t: string) => normal(t).replace(/[^A-Z0-9]/g, '');

/** Lo que el lector del XML (cpe-xml.ts) junta para buscar la placa. */
export interface TextosDePlaca {
    /** El valor de cada `AdditionalItemProperty` de código 7000 o con «placa» en el nombre. */
    propiedades: string[];
    /** Las `cbc:Note` del comprobante. */
    notas: string[];
    descripciones: (string | null)[];
}

/**
 * Las placas de un comprobante: la propiedad 7000 manda (ahí el valor ES la placa, aunque no
 * tenga el formato ABC-123); después las notas y las descripciones de los ítems.
 * '' si no trae ninguna; varias van con « / ».
 */
export function placaDe({ propiedades, notas, descripciones }: TextosDePlaca): string {
    const propias = propiedades.map((v) => placasEnTexto(`PLACA ${v}`)[0] ?? claveDePlaca(v)).filter((p) => p.length >= 5 && p.length <= 7);
    return [...new Set([...propias, ...placasEnTexto(...notas, ...descripciones)])].join(' / ');
}

// ════════════════════════════════════════════════════════════════
// Combustible: el gasto que sin placa no sustenta

const RX_COMBUSTIBLE = /\b(DIESEL|DB5|D2|GASOHOL|GASOLINA|PETROLEO|GLP|GNV|COMBUSTIBLE|PREMIUM \d{2}|REGULAR \d{2}|G-?(84|90|95|97))\b/;

/** Si un ítem es combustible: la unidad galón (GLL) o lo que dice su descripción. */
export function esCombustible(descripcion: string | null | undefined, unidad?: string | null): boolean {
    return unidad === 'GLL' || RX_COMBUSTIBLE.test(normal(descripcion ?? ''));
}
