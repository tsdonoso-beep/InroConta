/**
 * Lectura de carpetas de OC (compras nacionales e importaciones)
 * ----------------------------------------------------------------------------
 * Versión 100 % Apps Script (sin cuenta de servicio) de la lógica de INROCONTA:
 *   · `src/shared/lib/drive/carpetas-oc.ts`  → qué OC es cada carpeta y qué
 *     parece cada archivo por su NOMBRE;
 *   · `src/shared/lib/drive/lectura.ts`      → qué dice un archivo POR DENTRO
 *     (XML, ZIP, texto de PDF u OCR);
 *   · `src/shared/lib/drive/legajo-carpeta.ts` → qué documentos tiene cada OC
 *     y cuál le falta.
 * La explicación completa está en `docs/logica-lectura-carpetas-oc.md`.
 *
 * ── Instalación ──
 * 1. Hoja de cálculo nueva → Extensiones → Apps Script → pegar este archivo.
 * 2. Servicios (+) → «Drive API» → versión v2 → Agregar (para el OCR).
 * 3. Poner abajo los ID de las dos carpetas madre (el ID es lo que va después
 *    de /folders/ en el enlace) y guardar. Recargar la hoja: aparece el menú
 *    «Carpetas de OC».
 * 4. Menú → 1 o 2 (leer nombres), luego 3 (leer por dentro, se repite hasta
 *    que no queden pendientes) y 4 (legajo por OC).
 *
 * Nada de las carpetas se modifica: solo se leen. El OCR hace una copia
 * temporal en «_lectura_temporal» y la borra al terminar.
 */

// ── Configuración ──
var CARPETA_NACIONALES_ID = 'PEGAR_AQUI_EL_ID'; // «5. Ordenes de Compra»
var CARPETA_IMPORTACIONES_ID = 'PEGAR_AQUI_EL_ID';
var RUC_EMPRESA = '20512201611'; // aparece en los comprobantes, pero nunca es el proveedor
var SUBCARPETA = ''; // p. ej. 'TALLERES': solo ese proyecto (útil si la carpeta es muy grande)
var MINUTOS = 5; // Apps Script corta a los 6
var MAX_KB_LECTURA = 25 * 1024; // archivos más grandes no se abren
var CARPETA_TEMPORAL = '_lectura_temporal';

var HOJA_ARCHIVOS = 'ARCHIVOS';
var HOJA_OC = 'OC';
var CAB_ARCHIVOS = [
    'Procedencia',
    'OC',
    'OC u OS',
    'Proveedor',
    'Carpeta de proyecto',
    'Subcarpeta (dentro de la OC)',
    'Archivo',
    'Tipo de archivo',
    'Parece (por el nombre)',
    'Serie (por el nombre)',
    'Pistas',
    'Prioridad de lectura',
    'Leído: estado',
    'Leído: método',
    'Leído: tipo',
    'Leído: serie',
    'Leído: RUC emisor',
    'Leído: documentos que trae',
    'Leído: OC que cita',
    'Leído: detalle',
    'Enlace',
    'ID',
];
var C = {}; // índice de cada columna por nombre
CAB_ARCHIVOS.forEach(function (n, i) {
    C[n] = i;
});

function onOpen() {
    SpreadsheetApp.getUi()
        .createMenu('Carpetas de OC')
        .addItem('1. Leer nombres: compras nacionales', 'leerNacionales')
        .addItem('2. Leer nombres: importaciones', 'leerImportaciones')
        .addSeparator()
        .addItem('3. Leer por dentro los pendientes (repetir hasta terminar)', 'leerPorDentroPendientes')
        .addItem('4. Armar legajo por OC', 'armarLegajo')
        .addToUi();
}

function leerNacionales() {
    leerCarpetaMadre_(CARPETA_NACIONALES_ID, 'Nacional');
}
function leerImportaciones() {
    leerCarpetaMadre_(CARPETA_IMPORTACIONES_ID, 'Importación');
}

// ════════════════════════════════════════════════════════════════════════════
// 1. LA CARPETA: qué OC es
// ════════════════════════════════════════════════════════════════════════════

// «IMP», «IMPO», «IMPORTACIÓN» van delante (o detrás de «OC») en importaciones.
var IMPO_ = '(?:IMP(?:O|ORTACI[OÓ]N)?\\.?)';
// «0C 101-2026» (con cero en vez de O) aparece en las carpetas de importaciones.
var PREFIJO_ =
    '(?:(?:[O0]\\.?\\s*C\\.?|[O0]\\.?\\s*S\\.?|ORDEN\\s+DE\\s+COMPRA|ORDEN\\s+DE\\s+SERVICIO)(?:\\s*' + IMPO_ + ')?|' + IMPO_ + '(?:\\s*O\\.?\\s*C\\.?)?)';
var NUM_ = '(\\d{1,5})(?:\\.\\d{1,2})?';
var ANIO_ = '(20[2-3]\\d)';
var SEP_ = '\\s*[-_]\\s*';
var RE_CARPETA_OC = new RegExp('^(' + PREFIJO_ + '\\s*(?:N[°ºo.]?\\s*)?)?(?:' + ANIO_ + SEP_ + NUM_ + '|' + NUM_ + SEP_ + ANIO_ + ')(?!\\d)\\s*(.*)$', 'i');

/**
 * La OC del nombre de una carpeta, o null si no es la carpeta de una OC.
 *   «OC 2026 - 0200 COMERCIALIZADORA LUCY - TALLERES ESPECIALIZADOS»
 *     → { tipo: 'OC', oc: '0200-2026', proveedor: 'COMERCIALIZADORA LUCY', proyecto: 'TALLERES ESPECIALIZADOS' }
 *   «IMPO OC 172-2026 NINGBO ABC» (importación) → oc '172-2026'
 * `estricto`: el nombre tiene que EMPEZAR con OC/OS (se usa dentro de otra
 * OC, para no confundir una subcarpeta «Factura 0123-2026» con otra OC).
 * Nacional con 4 dígitos, importación con 3: son numeraciones DISTINTAS.
 */
function carpetaDeOC_(nombre, estricto, procedencia) {
    var t = String(nombre == null ? '' : nombre)
        .normalize('NFC')
        .trim()
        .replace(/\s+/g, ' ');
    var m = RE_CARPETA_OC.exec(t);
    if (!m || (estricto && !m[1])) return null;
    var num = m[3] || m[4],
        anio = m[2] || m[5],
        resto = m[6];
    if (!num || !anio || Number(num) === 0) return null;
    // Sin «OC» delante, «2026-01 ENERO» no es la OC 1: se piden 3 dígitos o más.
    if (!m[1] && num.length < 3) return null;
    var tipo = /^([O0]\.?\s*S|ORDEN\s+DE\s+SERVICIO)/i.test(t) ? 'OS' : 'OC';
    var limpio = (resto || '').replace(/^[\s\-_–—:.]+/, '').trim();
    var corte = limpio.lastIndexOf(' - ');
    var ancho = procedencia === 'Importación' ? 3 : 4;
    return {
        tipo: tipo,
        oc: rellenar_(String(Number(num)), ancho) + '-' + anio,
        proveedor: (corte > 0 ? limpio.slice(0, corte) : limpio).trim(),
        proyecto: corte > 0 ? limpio.slice(corte + 3).trim() : '',
    };
}

/**
 * La OC como clave cuando viene de una tabla («OC 115-2026», «2026-0115»).
 * Respeta la procedencia; si no se sabe, decide por la cantidad de dígitos.
 *   ('OC 115-2026', 'Nacional') → '0115-2026' · ('172-2026', 'Importación') → '172-2026'
 */
function ocNormalizada_(texto, procedencia) {
    // «1296.1-2025»: parte 1 de la OC 1296 (no la OC 1).
    var s = String(texto == null ? '' : texto).replace(/(\d)\.\d{1,2}(?=\s*-\s*20\d\d)/g, '$1');
    var num,
        anio,
        m = /(\d{1,6})\s*-\s*(202\d)(?!\d)/.exec(s);
    if (m) {
        num = m[1];
        anio = m[2];
    } else if ((m = /(?:^|\D)(202\d)\s*-\s*(\d{1,6})(?!\d)/.exec(s))) {
        num = m[2];
        anio = m[1];
    } else return '';
    var p = String(procedencia || '').toUpperCase();
    var impo = /IMPO|INTERNAC|EXTRANJ/.test(p) ? true : /NAC/.test(p) ? false : num.length <= 3;
    return rellenar_(String(Number(num)), impo ? 3 : 4) + '-' + anio;
}

function rellenar_(s, ancho) {
    while (s.length < ancho) s = '0' + s;
    return s;
}

// ════════════════════════════════════════════════════════════════════════════
// 2. EL ARCHIVO POR SU NOMBRE: qué parece y qué serie trae
// ════════════════════════════════════════════════════════════════════════════

/**
 * F001-00018178, E001 179, FE010001380 → «F001-18178». Vacío si no trae.
 * «01F0010031388»: tipo SUNAT (01, 03, 07, 08) pegado a serie y número.
 * «PDF-DOC-E001-37320547523939»: SUNAT pega el RUC del emisor (11 dígitos) al número.
 */
function serieEnNombre_(nombre) {
    var t = String(nombre || '')
        .toUpperCase()
        .replace(/\.[A-Z0-9]{2,5}$/, '');
    var pegado = /(?:^|[^A-Z0-9])0[1378]([FBE][A-Z]?\d{2,3})(\d{4,8})(?!\d)/.exec(t);
    if (pegado && pegado[1].length === 4) return pegado[1] + '-' + pegado[2].replace(/^0+(?=\d)/, '');
    var m = /(?:^|[^A-Z0-9])([FBE][A-Z0-9]{3})(\s*[-_ ]?\s*)(\d{1,19})(?!\d)/.exec(t);
    if (!m || !/\d/.test(m[1])) return '';
    if (!/[-_ ]/.test(m[2]) && !/^[FBE][A-Z]?0\d{1,2}$/.test(m[1])) return '';
    var num = m[3];
    if (num.length > 11 && /[12]\d{10}$/.test(num)) num = num.slice(0, -11);
    num = num.replace(/^0+(?=\d)/, '');
    if (num.length > 8) return '';
    return m[1] + '-' + num;
}

// En ORDEN: gana la primera que calce. «PAGO SWIFT» sale SWIFT y no PAGO;
// «PROFORMA INVOICE» sale PROFORMA y no FACTURA.
//   frases:    se buscan como texto seguido («GUIA DE REMISION»)
//   palabras:  palabra exacta («GR», «DUA»)
//   parecidas: se aceptan con error de tipeo («FACURA» ≈ FACTURA)
var CATEGORIAS = [
    { parece: 'CUADRO DE COSTEO', frases: ['CUADRO DE COSTEO', 'FORMATO DE COSTEO'], palabras: ['COSTEO', 'COSTEOS'], parecidas: ['COSTEO'] },
    { parece: 'NOTA DE CRÉDITO', frases: ['NOTA DE CREDITO', 'NOTA CREDITO'], palabras: ['NC'] },
    { parece: 'NOTA DE DÉBITO', frases: ['NOTA DE DEBITO', 'NOTA DEBITO'], palabras: ['ND'] },
    {
        parece: 'PROFORMA',
        frases: ['PROFORMA INVOICE', 'PERFORMA INVOICE', 'PRO FORMA'],
        palabras: ['PROFORMA', 'PROFORMAS', 'PERFORMA'],
        parecidas: ['PROFORMA'],
    },
    {
        parece: 'FACTURA',
        frases: ['FACTURA ELECTRONICA', 'COMMERCIAL INVOICE'],
        palabras: ['FACTURA', 'FACTURAS', 'FACT', 'FAC', 'FACTU', 'FACTS', 'FE', 'INVOICE', 'INVOICES', 'INV'],
        parecidas: ['FACTURA', 'FACTURAS', 'FACTURACION', 'INVOICE'],
    },
    // «FT_…» resultó ser ficha técnica, no factura.
    { parece: 'FICHA TÉCNICA', frases: ['FICHA TECNICA', 'FICHAS TECNICAS'], palabras: ['FT', 'FTS'] },
    { parece: 'BOLETA', frases: [], palabras: ['BOLETA', 'BOLETAS', 'BV'], parecidas: ['BOLETA'] },
    {
        parece: 'RECIBO POR HONORARIOS',
        frases: ['RECIBO POR HONORARIOS', 'RECIBO HONORARIOS', 'R X H'],
        palabras: ['RH', 'RHE', 'RXH', 'HONORARIOS'],
        parecidas: ['HONORARIOS'],
    },
    { parece: 'COMPROBANTE (revisar)', frases: [], palabras: ['COMPROBANTE', 'COMPROBANTES', 'CPE'], parecidas: ['COMPROBANTE'] },
    { parece: 'DETRACCIÓN', frases: [], palabras: ['DETRACCION', 'DETRACCIONES', 'SPOT'], parecidas: ['DETRACCION'] },
    {
        parece: 'SWIFT',
        frases: ['TT COPY', 'BANK SLIP', 'PAYMENT SLIP', 'TRANSFERENCIA INTERNACIONAL', 'MT 103'],
        palabras: ['SWIFT', 'MT103', 'TT'],
        parecidas: ['SWIFT'],
    },
    { parece: 'DAM', frases: ['DECLARACION ADUANERA', 'DECLARACION ADUANERA DE MERCANCIAS'], palabras: ['DAM', 'DAMS', 'DUA', 'LEVANTE'] },
    {
        parece: 'PAGO',
        frases: [],
        palabras: ['PAGO', 'PAGOS', 'VOUCHER', 'TRANSFERENCIA', 'CONSTANCIA', 'DEPOSITO', 'ABONO', 'ADELANTO'],
        parecidas: ['TRANSFERENCIA'],
    },
    { parece: 'GUÍA', frases: ['GUIA DE REMISION', 'GUIA REMISION'], palabras: ['GUIA', 'GUIAS', 'GR', 'GRE', 'REMISION'], parecidas: ['REMISION'] },
    {
        parece: 'ACTA DE CONFORMIDAD',
        frases: ['ACTA DE CONFORMIDAD', 'ACTA CONFORMIDAD', 'CONFORMIDAD DE SERVICIO', 'ACTA DE RECEPCION'],
        palabras: ['ACTA', 'ACTAS', 'CONFORMIDAD'],
        parecidas: ['CONFORMIDAD'],
    },
    {
        parece: 'DOCUMENTO DE IMPORTACIÓN',
        frases: ['BILL OF LADING', 'PACKING LIST', 'AGENTE DE ADUANA'],
        palabras: ['BL', 'AWB', 'PACKING', 'DESADUANAJE', 'ADUANA', 'ADUANAS'],
    },
    { parece: 'CONTRATO', frases: [], palabras: ['CONTRATO', 'CONTRATOS'], parecidas: ['CONTRATO'] },
    { parece: 'COTIZACIÓN', frases: [], palabras: ['COTIZACION', 'COTIZACIONES', 'COT', 'QUOTATION', 'QUOTE'], parecidas: ['COTIZACION'] },
    { parece: 'ORDEN DE COMPRA/SERVICIO', frases: ['ORDEN DE COMPRA', 'ORDEN DE SERVICIO', 'PURCHASE ORDER'], palabras: ['OC', 'OS', 'PO'] },
    { parece: 'REQUERIMIENTO', frases: [], palabras: ['REQUERIMIENTO', 'REQ', 'RQ'], parecidas: ['REQUERIMIENTO'] },
    {
        parece: 'CORREO / CAPTURA',
        frases: ['CAPTURA DE PANTALLA', 'SCREEN SHOT'],
        palabras: ['CORREO', 'CORREOS', 'EMAIL', 'MAIL', 'GMAIL', 'OUTLOOK', 'CAPTURA', 'PANTALLAZO', 'SCREENSHOT', 'WHATSAPP'],
        parecidas: ['CORREO'],
    },
    { parece: 'DATOS BANCARIOS', frases: ['CUENTA BANCARIA', 'CUENTAS BANCARIAS'], palabras: ['CCI'] },
];

// Código de tipo de SUNAT dentro del nombre «RUC-TIPO-SERIE-NÚMERO».
var TIPO_SUNAT = { '01': 'FACTURA', '03': 'BOLETA', '07': 'NOTA DE CRÉDITO', '08': 'NOTA DE DÉBITO', '09': 'GUÍA', R01: 'RECIBO POR HONORARIOS' };

// Palabras que se parecen a una categoría pero no lo son.
var NO_SON = ['FACTOR', 'FACTORES', 'FACIL', 'FACHADA', 'BOLETIN', 'REMISOR', 'CONTRATISTA', 'CORRER'];

/** Sin tildes, mayúsculas, solo letras y números, sin extensión, «F001» → «F 001». */
function textoPlano_(s) {
    return String(s == null ? '' : s)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\.[A-Z0-9]{2,5}$/, '')
        .replace(/[^A-Z0-9]+/g, ' ')
        .replace(/([A-Z])(\d)/g, '$1 $2')
        .replace(/(\d)([A-Z])/g, '$1 $2')
        .trim();
}

/** Distancia de edición (Damerau-Levenshtein): cuántas letras hay que cambiar. */
function distancia_(a, b) {
    var d = [],
        i,
        j;
    for (i = 0; i <= a.length; i++) d[i] = [i];
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) {
        for (j = 1; j <= b.length; j++) {
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
    }
    return d[a.length][b.length];
}

/** Error de tipeo tolerado: 1 letra en palabras de 5 o más; 2 si además empieza igual (6 o más). */
function seParece_(p, q) {
    if (p.length < 5 || NO_SON.indexOf(p) !== -1) return false;
    var d = distancia_(p, q);
    return d <= 1 || (d <= 2 && p.length >= 6 && p.slice(0, 3) === q.slice(0, 3));
}

/** Las categorías que calzan con un texto (ya en textoPlano_), en orden, con la palabra que las delató. */
function pistasEn_(texto) {
    var palabras = texto.split(' ').filter(Boolean);
    var salida = [];
    CATEGORIAS.forEach(function (cat) {
        var hallada = '';
        cat.frases.forEach(function (fr) {
            if (!hallada && (' ' + texto + ' ').indexOf(' ' + fr + ' ') !== -1) hallada = fr;
        });
        palabras.forEach(function (p) {
            if (hallada) return;
            if (cat.palabras.indexOf(p) !== -1) hallada = p;
            else if (
                (cat.parecidas || []).some(function (q) {
                    return seParece_(p, q);
                })
            )
                hallada = p + ' (≈' + cat.parecidas[0] + ')';
        });
        if (hallada) salida.push({ parece: cat.parece, palabra: hallada });
    });
    return salida;
}

/**
 * Qué parece un archivo por su nombre y, si el nombre no dice nada, por la
 * subcarpeta donde está («Guías / scan001.pdf» → GUÍA (por la carpeta)).
 * `ubicacion`: solo las subcarpetas DEBAJO de la carpeta de la OC (el nombre
 * «OC 2026 - 0200 …» diría «orden de compra» de todo lo que hay adentro).
 */
function clasificarArchivo_(nombre, ubicacion, mime) {
    var n = textoPlano_(nombre);
    var ext = ((/\.([a-z0-9]{2,5})$/i.exec(nombre || '') || [])[1] || '').toUpperCase();
    var serie = serieEnNombre_(nombre);
    var pistas = pistasEn_(n);
    var parece = '';

    // 1) XML de verdad (el tipo interno de un Excel también contiene «xml»).
    var esXml = ext === 'XML' || mime === 'text/xml' || mime === 'application/xml';
    if (esXml) parece = /^R-/i.test(nombre) ? 'CDR (constancia SUNAT)' : 'XML';
    else if (ext === 'ZIP' && /^R-/i.test(nombre)) parece = 'CDR (constancia SUNAT)';
    // 2) Correos guardados.
    if (!parece && (ext === 'EML' || ext === 'MSG')) parece = 'CORREO / CAPTURA';
    // 3) Número de DAM: aduana-año-régimen 10-número (118-2025-10-123456).
    if (!parece && /(^|\D)\d{3}[- _]20\d\d[- _]10[- _]\d{4,6}(\D|$)/.test(String(nombre))) {
        parece = 'DAM';
        pistas.unshift({ parece: 'DAM', palabra: 'número de DAM' });
    }
    // 4) Nombre como lo baja SUNAT: RUC-TIPO-SERIE-NÚMERO.
    var codigo = (/(?:^|\D)[12]\d{10}[-_ ](01|03|07|08|09|R01)[-_ ]/.exec(String(nombre).toUpperCase()) || [])[1];
    if (!parece && codigo) {
        parece = TIPO_SUNAT[codigo];
        pistas.unshift({ parece: parece, palabra: 'tipo SUNAT en el nombre' });
    }
    // 5) Palabras del nombre (la primera categoría que calce).
    if (!parece && pistas.length) parece = pistas[0].parece;
    // «FT F001-123» o «PROFORMA F001-123» con serie de SUNAT sí son factura.
    if ((parece === 'FICHA TÉCNICA' && serie && !/^EG/.test(serie)) || (parece === 'PROFORMA' && /^F/.test(serie))) parece = 'FACTURA';
    // 6) Solo la serie: F → factura, B → boleta, E → factura o RH.
    if (!parece && serie) {
        parece = /^F/.test(serie) ? 'FACTURA' : /^B/.test(serie) ? 'BOLETA' : 'FACTURA o RH (serie E)';
        pistas.push({ parece: parece, palabra: serie });
    }
    // 7) La subcarpeta.
    if (!parece) {
        var enCarpeta = pistasEn_(textoPlano_(ubicacion));
        if (enCarpeta.length) {
            parece = enCarpeta[0].parece + ' (por la carpeta)';
            pistas = pistas.concat(enCarpeta);
        }
    }
    var vistas = {};
    return {
        parece: parece || 'OTRO',
        serie: serie,
        pistas: pistas
            .map(function (p) {
                return p.palabra;
            })
            .filter(function (p) {
                return vistas[p] ? false : (vistas[p] = true);
            }),
    };
}

/** Si lo que parece es un comprobante de pago. */
function esComprobante_(parece) {
    return /^(FACTURA|BOLETA|NOTA DE|RECIBO POR|COMPROBANTE|XML)/.test(parece);
}

// ════════════════════════════════════════════════════════════════════════════
// 3. EL ARCHIVO POR DENTRO: XML, ZIP, texto del PDF u OCR
// ════════════════════════════════════════════════════════════════════════════

/** Cómo se lee un archivo, o null si no se lee (Excel, Word, video…). */
function tipoDeLectura_(nombre, mime) {
    var ext = ((/\.([a-z0-9]{2,5})$/i.exec(nombre || '') || [])[1] || '').toLowerCase();
    if (mime === 'application/vnd.google-apps.document') return 'DOCUMENTO DE GOOGLE';
    if (ext === 'xml' || mime === 'text/xml' || mime === 'application/xml') return 'XML';
    if (ext === 'zip' || mime === 'application/zip' || mime === 'application/x-zip-compressed') return 'ZIP';
    if (ext === 'pdf' || mime === 'application/pdf') return 'PDF';
    if (/^image\/(jpeg|png|tiff|bmp|webp|gif)$/.test(mime) || /^(jpe?g|png|tiff?|bmp|webp)$/.test(ext)) return 'IMAGEN';
    return null;
}

// Nombres que no dicen nada.
var NOMBRES_GENERICOS = [
    'DOC',
    'DOCS',
    'DOSC',
    'DCOS',
    'DOCUMENTO',
    'DOCUMENTOS',
    'SCAN',
    'ESCANEO',
    'ESCANEADO',
    'CAMSCANNER',
    'IMG',
    'IMAGEN',
    'ADJUNTO',
    'ADJUNTOS',
    'WHATSAPP',
    'SUSTENTO',
    'SUSTENTOS',
    'ARCHIVO',
    'NUEVO',
    'SCANNED',
    'SCANNER',
    'FOTO',
    'PHOTO',
    'IMAGE',
    'DOCUMENT',
    'FILE',
    'COPIA',
    'COPY',
];

/**
 * Cuánto vale la pena abrir un archivo (más alto, antes); -1 = no se abre.
 *   4  XML o ZIP sin serie en el nombre (barato y exacto)
 *   3  el nombre dice comprobante («FACTURA LUCY.pdf») pero sin número
 *   2  el nombre no dice nada («scan001», «WhatsApp Image…») o lo dice la carpeta
 *   1  solo dice «OC» (un escaneo de la factura suele llamarse «docs prov oc150-2026»)
 * Lo que ya se entiende por el nombre (cotización, guía, pago…) o trae serie, no se abre.
 */
function prioridadDeLectura_(nombre, mime, parece, serie, kb, pistas) {
    var como = tipoDeLectura_(nombre, mime);
    if (!como || serie || kb > MAX_KB_LECTURA) return -1;
    if (/^CDR/.test(parece)) return -1;
    if (como === 'XML' || como === 'ZIP') return 4;
    if (esComprobante_(parece)) return 3;
    var generico = textoPlano_(nombre)
        .split(' ')
        .some(function (p) {
            return NOMBRES_GENERICOS.indexOf(p) !== -1;
        });
    if (parece === 'OTRO' || / \(por la carpeta\)$/.test(parece) || generico) return 2;
    if (parece === 'ORDEN DE COMPRA/SERVICIO' && !/ORDEN DE|PURCHASE ORDER/.test(pistas || '')) return 1;
    return -1;
}

// ── RUC ──

/** Dígito verificador de SUNAT (módulo 11): descarta los RUC que el OCR leyó mal. */
function rucValido_(ruc) {
    if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;
    var pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2],
        suma = 0;
    for (var i = 0; i < 10; i++) suma += pesos[i] * Number(ruc[i]);
    var resto = 11 - (suma % 11);
    var digito = resto === 10 ? 0 : resto === 11 ? 1 : resto;
    return digito === Number(ruc[10]);
}

/** El RUC del emisor: el primero válido que no sea el de la empresa. `P` ya normalizado. */
function rucEmisorEnTexto_(P) {
    // El OCR confunde O con 0 e I/L con 1 dentro de los números.
    var a = P.split('');
    for (var i = 0; i < a.length; i++) {
        var antes = a[i - 1] || '',
            despues = a[i + 1] || '';
        if (a[i] === 'O' && ((/\d/.test(antes) && /[\dO]/.test(despues)) || (/[\dO]/.test(antes) && /\d/.test(despues)))) a[i] = '0';
        else if ((a[i] === 'I' || a[i] === 'L') && /\d/.test(antes) && /\d/.test(despues)) a[i] = '1';
    }
    var t = a.join(''),
        re = /(?:^|\D)((?:10|15|16|17|20)\d{9})(?!\d)/g,
        m;
    while ((m = re.exec(t))) if (m[1] !== RUC_EMPRESA && rucValido_(m[1])) return m[1];
    return '';
}

// ── El comprobante dentro de un texto ──

/** Mayúsculas, sin tildes, espacios simples. */
function normalizarTexto_(texto) {
    return String(texto || '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');
}

// «FACTURA» aunque el OCR la parta o confunda letras: «FACTUR A», «FACIURA», «FACTUPA».
var RE_FACTURA = /F\s?A\s?[CG]\s?[TI1]\s?U\s?[RP]\s?A/;

/**
 * Tipo y serie-número del comprobante que trae un texto (ya normalizado).
 * Electrónicas (F001-00113668 con errores de OCR: FO01, «F001 N° 113668»),
 * físicas («FACTURA 001- N° 0031388») y la «commercial invoice» del exterior.
 * Las series de guía (T001, EG07) se saltan: una factura suele citarlas.
 */
function comprobanteEnTexto_(P) {
    var esFactura = RE_FACTURA.test(P),
        esBoleta = /BOLETA\s+DE\s+VENTA/.test(P),
        esRH = /RECIBO\s+POR\s+HONORARIOS/.test(P),
        esNota = /NOTA\s+DE\s+(CREDITO|DEBITO)\s+ELECTRONICA/.test(P);
    var re = /(?:^|[^A-Z0-9])([FBE][A-Z0-9|\][!]{3})\s*(?:[-–—_]\s*(?:N\s*[°ºO.]\s*)?|N\s*[°º.]\s*)0*(\d{1,8})(?!\d)/g,
        m,
        serie = '';
    while ((m = re.exec(P))) {
        var s =
            m[1][0] +
            m[1]
                .slice(1)
                .replace(/O/g, '0')
                .replace(/[IL|\][!]/g, '1');
        if (!/^[FBE][A-Z]?\d{2,3}$/.test(s) || /^EG/.test(s)) continue;
        serie = s + '-' + m[2];
        break;
    }
    if (!serie && (esFactura || esBoleta)) {
        var f = /(?:FACTURA|BOLETA)[^]{0,80}?(?:^|[^A-Z0-9])(\d{3,4})\s*[-–—]\s*(?:N\s*[°ºO.]\s*)?0*(\d{3,8})(?!\d)/.exec(P);
        if (f && !/^20\d\d$/.test(f[1])) serie = f[1] + '-' + f[2];
    }
    var tipo = '';
    if (esNota) tipo = /NOTA\s+DE\s+CREDITO/.test(P) ? 'NOTA DE CRÉDITO' : 'NOTA DE DÉBITO';
    else if (esRH && /^E/.test(serie)) tipo = 'RECIBO POR HONORARIOS';
    else if (esFactura && (/F\s?A\s?C\s?T\s?U\s?R\s?A\s+E\s?L\s?E\s?C\s?T\s?R\s?O\s?N\s?I\s?C\s?A/.test(P) || (serie && /R\s?\.?\s?U\s?\.?\s?C/.test(P))))
        tipo = 'FACTURA';
    else if (esBoleta && /^B/.test(serie)) tipo = 'BOLETA';
    else if (/COMMERCIAL\s+INVOICE|\bINVOICE\s*(NO\b|N[°º]|#|NUMBER|DATE)/.test(P)) {
        tipo = 'INVOICE';
        var inv = /INVOICE\s*(?:NO\.?|N[°º]|#|NUMBER)\s*[:.]?\s*((?=[A-Z0-9\/-]*\d)[A-Z0-9][A-Z0-9\/-]{2,20})/.exec(P);
        serie = inv ? inv[1] : '';
    }
    return { tipo: tipo, serie: tipo ? serie : '' };
}

/**
 * Qué documentos trae un texto (un PDF puede traer factura Y guía). Se pide
 * el RASGO propio de cada documento, no solo la palabra: una factura CITA su
 * guía, pero solo la guía trae «punto de partida»; una OC dice «factura a 30
 * días» sin ser factura.
 */
function documentosEnTexto_(texto) {
    var P = normalizarTexto_(texto);
    var hay = [];
    var cpe = comprobanteEnTexto_(P);
    if (cpe.tipo) hay.push('FACTURA');
    if (/PUNTO\s+DE\s+PARTIDA|PUNTO\s+DE\s+LLEGADA|MOTIVO\s+DEL?\s+TRASLADO|DATOS\s+DEL\s+TRASLADO/.test(P)) hay.push('GUIA');
    if (/DECLARACION\s+ADUANERA\s+DE\s+MERCANCIAS|\bDAM\b[^A-Z]{0,20}\d{3}\s*-\s*20\d\d\s*-\s*10\s*-\s*\d{3,6}/.test(P)) hay.push('DAM');
    if (/ACTA\s+DE\s+(CONFORMIDAD|RECEPCION)|CONFORMIDAD\s+DEL?\s+SERVICIO/.test(P)) hay.push('ACTA');
    if (/\bMT\s?103\b|SWIFT\s+(COPY|MESSAGE)|:32A:/.test(P)) hay.push('SWIFT');
    if (!hay.length && /^.{0,300}ORDEN\s+DE\s+(COMPRA|SERVICIO)/.test(P)) hay.push('OC');
    var ruc = cpe.tipo && cpe.tipo !== 'INVOICE' ? rucEmisorEnTexto_(P) : '';
    return { tipo: cpe.tipo, serie: cpe.serie, ruc: ruc, claves: hay, ocReferencia: '' };
}

/** Resultado de leer un texto: LEÍDO si trae comprobante con número. */
function lecturaDeTexto_(texto, metodo) {
    if (normalizarTexto_(texto).replace(/[^A-Z0-9]/g, '').length < 20) {
        return { estado: 'SIN TEXTO', metodo: metodo, tipo: '', serie: '', ruc: '', claves: [], ocReferencia: '', detalle: '' };
    }
    var d = documentosEnTexto_(texto);
    d.estado = d.tipo && d.serie ? 'LEÍDO' : 'SIN COMPROBANTE';
    d.metodo = metodo;
    d.detalle = '';
    return d;
}

// ── XML del comprobante electrónico (UBL 2.1 de SUNAT) ──

/** Contenido del primer <prefijo:TAG …>…</prefijo:TAG> (el prefijo puede ser cbc:, cac:, o ninguno). */
function bloqueXml_(xml, tag) {
    var m = new RegExp('<(?:[\\w.-]+:)?' + tag + '\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?' + tag + '>').exec(xml || '');
    return m ? m[1] : '';
}
function valoresXml_(xml, tag) {
    var re = new RegExp('<(?:[\\w.-]+:)?' + tag + '\\b[^>]*>([^<]*)</(?:[\\w.-]+:)?' + tag + '>', 'g'),
        m,
        out = [];
    while ((m = re.exec(xml || ''))) out.push(m[1].trim());
    return out;
}

var TIPO_XML = { '01': 'FACTURA', '03': 'BOLETA', '07': 'NOTA DE CRÉDITO', '08': 'NOTA DE DÉBITO' };

/**
 * Un XML de comprobante dice todo exacto: tipo, serie, número, RUC del
 * emisor, a quién se emitió y la OC que cita (OrderReference). Si es una
 * constancia de SUNAT (CDR, raíz ApplicationResponse) no es el comprobante.
 * `xmls`: uno o varios (un ZIP puede traer la factura y su CDR).
 */
function lecturaDeXml_(xmls, metodo) {
    var vacia = { estado: 'SIN COMPROBANTE', metodo: metodo, tipo: '', serie: '', ruc: '', claves: [], ocReferencia: '', detalle: '' };
    var raiz = function (x) {
        return /<\s*(?:[\w-]+:)?(Invoice|CreditNote|DebitNote)[\s>]/.test(x.slice(0, 4000));
    };
    var esCdr = function (x) {
        return /<\s*(?:[\w-]+:)?ApplicationResponse[\s>]/.test(x.slice(0, 4000));
    };
    var xml =
        xmls.filter(raiz)[0] ||
        xmls.filter(function (x) {
            return !esCdr(x);
        })[0];
    if (!xml) {
        vacia.detalle = 'constancia de SUNAT (CDR), no el comprobante';
        return vacia;
    }
    var codigo = /<(?:[\w.-]+:)?CreditNote\b/.test(xml) ? '07' : /<(?:[\w.-]+:)?DebitNote\b/.test(xml) ? '08' : valoresXml_(xml, 'InvoiceTypeCode')[0];
    var id =
        valoresXml_(xml, 'ID').filter(function (v) {
            return /^[A-Za-z0-9]{1,4}-\d+$/.test(v);
        })[0] || '';
    var tipo = TIPO_XML[codigo] || '';
    if (!tipo || !id) {
        vacia.detalle = 'el XML no trae tipo, serie o número';
        return vacia;
    }
    var partes = id.split('-');
    var rucDe = function (parte) {
        return valoresXml_(bloqueXml_(bloqueXml_(xml, parte), 'PartyIdentification'), 'ID')[0] || '';
    };
    var cliente = rucDe('AccountingCustomerParty');
    return {
        estado: 'LEÍDO',
        metodo: metodo,
        tipo: tipo,
        serie: partes[0].toUpperCase() + '-' + partes[1].replace(/^0+(?=\d)/, ''),
        ruc: rucDe('AccountingSupplierParty'),
        claves: ['FACTURA'],
        ocReferencia: valoresXml_(bloqueXml_(xml, 'OrderReference'), 'ID')[0] || '',
        detalle: !cliente || cliente === RUC_EMPRESA ? '' : 'emitido a ' + cliente + ', no a la empresa',
    };
}

// ── Abrir el archivo ──

/** Lee un archivo de Drive por dentro según su tipo. Nunca lanza: el problema va en `estado`. */
function leerArchivo_(id, nombre, mime, temporalId) {
    try {
        var como = tipoDeLectura_(nombre, mime);
        if (como === 'XML') return lecturaDeXml_([DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8')], 'XML');
        if (como === 'ZIP') {
            var blob = DriveApp.getFileById(id).getBlob().setContentType('application/zip');
            var xmls = Utilities.unzip(blob)
                .filter(function (b) {
                    return /\.xml$/i.test(b.getName());
                })
                .map(function (b) {
                    return b.getDataAsString('UTF-8');
                });
            return xmls.length
                ? lecturaDeXml_(xmls, 'ZIP')
                : { estado: 'SIN COMPROBANTE', metodo: 'ZIP', tipo: '', serie: '', ruc: '', claves: [], ocReferencia: '', detalle: 'el ZIP no trae XML' };
        }
        if (como === 'DOCUMENTO DE GOOGLE') return lecturaDeTexto_(DocumentApp.openById(id).getBody().getText(), 'DOCUMENTO DE GOOGLE');
        if (como === 'PDF' || como === 'IMAGEN') return lecturaDeTexto_(textoConOcr_(id, temporalId), 'OCR');
        return { estado: 'ERROR', metodo: '', tipo: '', serie: '', ruc: '', claves: [], ocReferencia: '', detalle: 'tipo de archivo que no se lee' };
    } catch (e) {
        return { estado: 'ERROR', metodo: '', tipo: '', serie: '', ruc: '', claves: [], ocReferencia: '', detalle: String(e.message || e).slice(0, 150) };
    }
}

/**
 * PDF o imagen → texto, con la API de Drive v2: se copia como Documento de
 * Google con `ocr: true` (Drive le hace OCR; si el PDF ya trae texto, lo
 * usa), se saca el texto y se borra la copia. El original no se toca.
 * Requiere el servicio avanzado «Drive API» (v2).
 */
function textoConOcr_(id, temporalId) {
    var copia = Drive.Files.copy({ title: 'lectura ' + id, parents: [{ id: temporalId }] }, id, {
        convert: true,
        ocr: true,
        ocrLanguage: 'es',
        supportsAllDrives: true,
    });
    try {
        return DocumentApp.openById(copia.id).getBody().getText();
    } finally {
        try {
            Drive.Files.remove(copia.id, { supportsAllDrives: true });
        } catch (e) {
            DriveApp.getFileById(copia.id).setTrashed(true);
        }
    }
}

// ════════════════════════════════════════════════════════════════════════════
// 4. EL LEGAJO: qué documentos tiene cada OC y cuál le falta
// ════════════════════════════════════════════════════════════════════════════

var DOCUMENTOS = [
    { clave: 'FACTURA', nombre: 'Factura' },
    { clave: 'OC', nombre: 'OC' },
    { clave: 'SWIFT', nombre: 'SWIFT' },
    { clave: 'GUIA', nombre: 'Guía de remisión' },
    { clave: 'DAM', nombre: 'DAM' },
    { clave: 'COSTEO', nombre: 'Cuadro de costeo' },
    { clave: 'REQ', nombre: 'Requerimiento' },
    { clave: 'CONTRATO', nombre: 'Contrato' },
    { clave: 'COTIZACION', nombre: 'Cotización' },
    { clave: 'PROFORMA', nombre: 'Proforma' },
    { clave: 'CORREO', nombre: 'Correos' },
    { clave: 'ACTA', nombre: 'Acta de conformidad' },
];
var POR_PARECE = {
    'ORDEN DE COMPRA/SERVICIO': 'OC',
    SWIFT: 'SWIFT',
    GUÍA: 'GUIA',
    DAM: 'DAM',
    REQUERIMIENTO: 'REQ',
    CONTRATO: 'CONTRATO',
    COTIZACIÓN: 'COTIZACION',
    PROFORMA: 'PROFORMA',
    'CORREO / CAPTURA': 'CORREO',
    'ACTA DE CONFORMIDAD': 'ACTA',
    'DOCUMENTO DE IMPORTACIÓN': 'DAM',
    'CUADRO DE COSTEO': 'COSTEO',
};

/** Qué documento(s) del legajo es un archivo: por el nombre y por lo leído dentro. */
function clavesDeArchivo_(parece, clavesLeidas) {
    var p = String(parece || '').replace(/ \(por la carpeta\)$/, '');
    var salida = {};
    (clavesLeidas || []).forEach(function (c) {
        salida[c] = true;
    });
    if (/^(FACTURA|COMPROBANTE|RECIBO POR|BOLETA|NOTA DE|XML$|INVOICE)/.test(p)) salida.FACTURA = true;
    else if (POR_PARECE[p]) salida[POR_PARECE[p]] = true;
    return Object.keys(salida);
}

/**
 * Lo que le falta a una OC: factura siempre; guía si es un bien o acta si es
 * un servicio (si ya trae una de las dos, esa manda); DAM y cuadro de costeo
 * si es importación.
 */
function documentosDeOC_(archivos, servicio, importacion) {
    var cuenta = {};
    archivos.forEach(function (a) {
        a.claves.forEach(function (c) {
            cuenta[c] = (cuenta[c] || 0) + 1;
        });
    });
    var requeridos = ['FACTURA'];
    if (!cuenta.GUIA && !cuenta.ACTA) requeridos.push(servicio ? 'ACTA' : 'GUIA');
    if (importacion) requeridos.push('DAM', 'COSTEO');
    var nombre = function (c) {
        return DOCUMENTOS.filter(function (d) {
            return d.clave === c;
        })[0].nombre;
    };
    var leFalta = requeridos
        .filter(function (c) {
            return !cuenta[c];
        })
        .map(nombre);
    var texto = DOCUMENTOS.filter(function (d) {
        return cuenta[d.clave];
    })
        .map(function (d) {
            return d.nombre + ' ' + cuenta[d.clave];
        })
        .join(' · ');
    return { texto: texto, leFalta: leFalta, estado: archivos.length === 0 ? 'VACÍA' : leFalta.length ? 'INCOMPLETA' : 'OK' };
}

// ════════════════════════════════════════════════════════════════════════════
// 5. LOS PASOS DEL MENÚ
// ════════════════════════════════════════════════════════════════════════════

/**
 * Recorre la carpeta madre (solo nombres, sin abrir nada) y escribe una fila
 * por archivo en ARCHIVOS. Cada subcarpeta hereda la OC de su carpeta de arriba:
 *   carpeta madre / PROYECTO / OC 2026 - 0200 … / Factura y Guía / archivo.pdf
 */
function leerCarpetaMadre_(idMadre, procedencia) {
    var limite = Date.now() + MINUTOS * 60 * 1000;
    var filas = [],
        incompleto = false;
    var pila = [{ carpeta: DriveApp.getFolderById(idMadre), nivel: 0, proyecto: '', oc: null, sub: '' }];
    var vistas = {};
    while (pila.length) {
        if (Date.now() > limite) {
            incompleto = true;
            break;
        }
        var p = pila.pop();
        var id = p.carpeta.getId();
        if (vistas[id]) continue;
        vistas[id] = true;

        var hijas = [];
        var subs = p.carpeta.getFolders();
        while (subs.hasNext()) hijas.push(subs.next());
        var fs = p.carpeta.getFiles();
        while (fs.hasNext()) {
            var f = fs.next(),
                mime = f.getMimeType(),
                nombre = f.getName(),
                fid = f.getId(),
                kb = Math.round(f.getSize() / 1024);
            if (mime === 'application/vnd.google-apps.shortcut') {
                try {
                    if (f.getTargetMimeType() === 'application/vnd.google-apps.folder') {
                        hijas.push(DriveApp.getFolderById(f.getTargetId()));
                        continue;
                    }
                    var real = DriveApp.getFileById(f.getTargetId());
                    nombre += ' (acceso directo)';
                    mime = real.getMimeType();
                    fid = real.getId();
                    kb = Math.round(real.getSize() / 1024);
                } catch (e) {
                    continue; // acceso directo sin permiso
                }
            }
            var c = clasificarArchivo_(nombre, p.sub, mime);
            var pistas = c.pistas.join(', ');
            var fila = new Array(CAB_ARCHIVOS.length).fill('');
            fila[C['Procedencia']] = procedencia;
            fila[C['OC']] = p.oc ? p.oc.oc : '(sin OC)';
            fila[C['OC u OS']] = p.oc ? p.oc.tipo : '';
            fila[C['Proveedor']] = p.oc ? p.oc.proveedor : '';
            fila[C['Carpeta de proyecto']] = p.proyecto;
            fila[C['Subcarpeta (dentro de la OC)']] = p.sub;
            fila[C['Archivo']] = nombre;
            fila[C['Tipo de archivo']] = tipoDeLectura_(nombre, mime) || mime;
            fila[C['Parece (por el nombre)']] = c.parece;
            fila[C['Serie (por el nombre)']] = c.serie;
            fila[C['Pistas']] = pistas;
            fila[C['Prioridad de lectura']] = prioridadDeLectura_(nombre, mime, c.parece, c.serie, kb, pistas);
            fila[C['Enlace']] = 'https://drive.google.com/file/d/' + fid + '/view';
            fila[C['ID']] = fid;
            filas.push(fila);
        }
        hijas.forEach(function (h) {
            var hn = h.getName();
            if (p.nivel === 0 && SUBCARPETA && hn.toUpperCase().indexOf(SUBCARPETA.toUpperCase()) === -1) return;
            var proyecto = p.nivel === 0 ? hn : p.proyecto;
            // Dentro de una OC, solo es OTRA OC si el nombre EMPIEZA con OC/OS y es otro número.
            var leida = carpetaDeOC_(hn, !!p.oc, procedencia);
            if (leida && (!p.oc || leida.oc !== p.oc.oc)) {
                pila.push({ carpeta: h, nivel: p.nivel + 1, proyecto: proyecto, oc: leida, sub: '' });
            } else {
                pila.push({ carpeta: h, nivel: p.nivel + 1, proyecto: proyecto, oc: p.oc, sub: p.oc ? (p.sub ? p.sub + ' / ' : '') + hn : '' });
            }
        });
    }
    escribirArchivos_(procedencia, filas);
    SpreadsheetApp.getActive().toast(
        filas.length + ' archivos de ' + procedencia + (incompleto ? '. NO TERMINÓ (tiempo): usa SUBCARPETA para ir por proyecto.' : '.'),
        'Carpetas de OC',
        10,
    );
}

/** Reemplaza en ARCHIVOS solo las filas de esa procedencia (y conserva lo ya leído por dentro). */
function escribirArchivos_(procedencia, filas) {
    var libro = SpreadsheetApp.getActive();
    var hoja = libro.getSheetByName(HOJA_ARCHIVOS) || libro.insertSheet(HOJA_ARCHIVOS);
    var previas = hoja.getLastRow() > 1 ? hoja.getRange(2, 1, hoja.getLastRow() - 1, CAB_ARCHIVOS.length).getValues() : [];
    var leidas = {};
    previas.forEach(function (r) {
        if (r[C['Leído: estado']]) leidas[r[C['ID']]] = r.slice(C['Leído: estado'], C['Leído: detalle'] + 1);
    });
    filas.forEach(function (r) {
        var l = leidas[r[C['ID']]];
        if (l) for (var i = 0; i < l.length; i++) r[C['Leído: estado'] + i] = l[i];
    });
    var otras = previas.filter(function (r) {
        return r[C['Procedencia']] !== procedencia;
    });
    var todas = otras.concat(filas);
    hoja.clear();
    hoja.getRange(1, 1, 1, CAB_ARCHIVOS.length).setValues([CAB_ARCHIVOS]).setFontWeight('bold');
    hoja.setFrozenRows(1);
    if (todas.length) hoja.getRange(2, 1, todas.length, CAB_ARCHIVOS.length).setValues(todas);
}

/** Abre los archivos con prioridad > 0 que aún no se leyeron, de mayor a menor prioridad, hasta el tiempo. */
function leerPorDentroPendientes() {
    var limite = Date.now() + MINUTOS * 60 * 1000;
    var hoja = SpreadsheetApp.getActive().getSheetByName(HOJA_ARCHIVOS);
    if (!hoja || hoja.getLastRow() < 2) return SpreadsheetApp.getActive().toast('Primero el paso 1 o 2.');
    var datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, CAB_ARCHIVOS.length).getValues();
    var pendientes = [];
    datos.forEach(function (r, i) {
        if (Number(r[C['Prioridad de lectura']]) > 0 && !r[C['Leído: estado']]) pendientes.push(i);
    });
    pendientes.sort(function (a, b) {
        return datos[b][C['Prioridad de lectura']] - datos[a][C['Prioridad de lectura']];
    });
    var it = DriveApp.getFoldersByName(CARPETA_TEMPORAL);
    var temporalId = (it.hasNext() ? it.next() : DriveApp.createFolder(CARPETA_TEMPORAL)).getId();
    var hechas = 0;
    for (var k = 0; k < pendientes.length && Date.now() < limite; k++) {
        var i = pendientes[k],
            r = datos[i];
        var mime =
            {
                XML: 'text/xml',
                ZIP: 'application/zip',
                PDF: 'application/pdf',
                IMAGEN: 'image/jpeg',
                'DOCUMENTO DE GOOGLE': 'application/vnd.google-apps.document',
            }[r[C['Tipo de archivo']]] || '';
        var l = leerArchivo_(r[C['ID']], r[C['Archivo']], mime, temporalId);
        hoja.getRange(i + 2, C['Leído: estado'] + 1, 1, 8).setValues([
            [l.estado, l.metodo, l.tipo, l.serie, l.ruc, l.claves.join(', '), l.ocReferencia, l.detalle],
        ]);
        hechas++;
    }
    SpreadsheetApp.getActive().toast(
        hechas + ' leídos; quedan ' + (pendientes.length - hechas) + '. Si quedan, vuelve a correr el paso 3.',
        'Carpetas de OC',
        10,
    );
}

/** Una fila por OC con sus documentos, lo que le falta y su estado. */
function armarLegajo() {
    var libro = SpreadsheetApp.getActive();
    var hoja = libro.getSheetByName(HOJA_ARCHIVOS);
    if (!hoja || hoja.getLastRow() < 2) return libro.toast('Primero el paso 1 o 2.');
    var datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, CAB_ARCHIVOS.length).getValues();
    var porOC = {};
    datos.forEach(function (r) {
        if (r[C['OC']] === '(sin OC)') return;
        var clave = r[C['Procedencia']] + '|' + r[C['OC']];
        var o = (porOC[clave] = porOC[clave] || { r: r, archivos: [] });
        var leidas = String(r[C['Leído: documentos que trae']] || '')
            .split(', ')
            .filter(Boolean);
        o.archivos.push({ claves: clavesDeArchivo_(r[C['Parece (por el nombre)']], leidas) });
    });
    var cab = ['Procedencia', 'OC', 'OC u OS', 'Proveedor', 'Carpeta de proyecto', 'Archivos', 'Documentos', 'Le falta', 'Estado'];
    var filas = Object.keys(porOC).map(function (k) {
        var o = porOC[k],
            r = o.r;
        var d = documentosDeOC_(o.archivos, r[C['OC u OS']] === 'OS', r[C['Procedencia']] === 'Importación');
        return [
            r[C['Procedencia']],
            r[C['OC']],
            r[C['OC u OS']],
            r[C['Proveedor']],
            r[C['Carpeta de proyecto']],
            o.archivos.length,
            d.texto,
            d.leFalta.join(', '),
            d.estado,
        ];
    });
    var h = libro.getSheetByName(HOJA_OC) || libro.insertSheet(HOJA_OC);
    h.clear();
    h.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
    h.setFrozenRows(1);
    if (filas.length) h.getRange(2, 1, filas.length, cab.length).setValues(filas);
    libro.toast(filas.length + ' OC en la pestaña ' + HOJA_OC + '.', 'Carpetas de OC', 10);
}
