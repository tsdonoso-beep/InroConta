/**
 * Condición del RUC en el Sheet — Buen Contribuyente / Agente de Retención
 * --------------------------------------------------------------------------
 *
 * El registro de compras no dice si a un proveedor le corresponde o no la
 * retención del IGV: eso depende de si está en el Padrón de Buenos
 * Contribuyentes o en el de Agentes de Retención/Percepción de SUNAT, algo
 * que hoy Contabilidad revisa a mano, RUC por RUC, en
 * e-consultaruc.sunat.gob.pe.
 *
 * ESTA CONSULTA NO SE PUEDE HACER DESDE APPS SCRIPT: se probó primero con
 * `UrlFetchApp` (una versión anterior de este archivo) y falló — esa pantalla
 * tiene reCAPTCHA v3. El campo «token» del formulario llega vacío del
 * servidor y solo se llena cuando `grecaptcha.execute(...)` corre en un
 * navegador de verdad, al hacer clic en «Buscar». `UrlFetchApp` no ejecuta
 * JavaScript, así que no hay forma de conseguir ese token desde acá.
 *
 * Por eso la consulta la hace un scraper de Playwright
 * (`scripts/consultar-padron-ruc.mts`), corriendo en GitHub Actions —un
 * navegador real resuelve el captcha en silencio, igual que lo haría una
 * persona— y guarda cada resultado en la tabla `contribuyente` de la base v2
 * (antes `padron_ruc` y `ruc_domicilio` de la base vieja).
 *
 * El trabajo de ESTE archivo es más simple: traer esa tabla a una pestaña
 * PADRÓN RUC de esta misma hoja, para que Contabilidad la vea ahí mismo, sin
 * entrar a la aplicación ni a Supabase. Lee la base v2 con BaseV2.gs: necesita
 * las Propiedades del script SUPABASE_URL_V2 y SUPABASE_SECRET_KEY.
 *
 * IMPORTANTE: esto solo muestra la condición del proveedor. Si corresponde
 * retenerle o no depende además de si INROPRIN está designada Agente de
 * Retención, de si la operación supera S/ 700, y de si no está sujeta a
 * detracción — ese cálculo no lo hace este archivo.
 */

// ── Configuración ──────────────────────────────────────────────────

/** La pestaña donde se refleja el padrón. No es la de datos: sobrevive a la publicación diaria. */
var PESTANA_PADRON = 'PADRÓN RUC';

var CABECERAS_PADRON = [
    'RUC',
    'Razón social',
    'Estado',
    'Condición',
    'Buen Contribuyente',
    'Agente de Retención',
    'Agente de Percepción',
    'Padrones (detalle)',
    'Consultado el',
    // The fiscal address (SUNAT's reduced roll; the columns of contribuyente in v2).
    'Domicilio fiscal',
    'Distrito',
    'Provincia',
    'Departamento',
];

// ── Menú (se engancha desde onOpen de Codigo.gs) ──────────────────

/** Los ítems de este archivo. Codigo.gs lo llama desde su onOpen. */
function itemsMenuPadron_(menu) {
    return menu
        .addSeparator()
        .addItem('Traer el padrón de RUC desde la base', 'sincronizarPadronRuc')
        .addItem('Activar sincronización automática diaria', 'instalarPadronAutomatico')
        .addItem('Desactivar sincronización automática', 'quitarPadronAutomatico');
}

// ── Orquestación ──────────────────────────────────────────────────

/**
 * Trae de la base v2 los RUC consultados (tabla `contribuyente`) y reemplaza
 * la pestaña con ellos. Se reescribe entera —no fila por fila— porque la base
 * ya es la fuente de verdad: es más simple y más correcto que ir upseando acá
 * también.
 */
function sincronizarPadronRuc() {
    try {
        var filas = padronDesdeBase_();
        escribirPadronCompleto_(filas);

        var msg = filas.length + ' RUC en el padrón, traídos de la base.';
        Logger.log(msg);
        try {
            SpreadsheetApp.getUi().alert(msg);
        } catch (e) {}
    } catch (e) {
        Logger.log('Error: ' + e.message);
        try {
            SpreadsheetApp.getUi().alert('No se pudo traer el padrón: ' + e.message);
        } catch (e2) {}
    }
}

/**
 * Los RUC que consultó la Consulta RUC (padron_en) o el padrón reducido
 * (domicilio_en), por RUC: una fila de `contribuyente` por RUC con su
 * condición y su domicilio. Los que tienen domicilio pero todavía no se
 * consultaron en la Consulta RUC van igual, con la condición «Sin consultar».
 */
function padronDesdeBase_() {
    var d = v2Leer_({
        contribuyentes:
            'contribuyente?select=ruc,razon_social,estado,condicion,buen_contribuyente,agente_retencion,agente_percepcion,padrones_detalle,padron_en,' +
            'direccion,distrito,provincia,departamento&or=(padron_en.not.is.null,domicilio_en.not.is.null)&order=ruc',
    });
    return d.contribuyentes.map(function (c) {
        return {
            ruc: c.ruc,
            razon_social: c.razon_social,
            estado: c.estado,
            condicion: c.condicion,
            buen_contribuyente: c.buen_contribuyente,
            agente_retencion: c.agente_retencion,
            agente_percepcion: c.agente_percepcion,
            padrones_detalle: c.padrones_detalle,
            consultado_en: c.padron_en,
            sinConsultar: !c.padron_en,
            domicilio: c,
        };
    });
}

function hojaPadron_() {
    var libro = SpreadsheetApp.getActiveSpreadsheet();
    var hoja = libro.getSheetByName(PESTANA_PADRON);
    if (!hoja) hoja = libro.insertSheet(PESTANA_PADRON);
    return hoja;
}

function escribirPadronCompleto_(filas) {
    var hoja = hojaPadron_();
    hoja.clear();
    hoja.appendRow(CABECERAS_PADRON);
    hoja.setFrozenRows(1);
    if (!filas || filas.length === 0) return;

    var valores = valoresPadron_(filas);
    // Todo como texto (que el RUC no se vuelva número), menos la fecha de consulta.
    hoja.getRange(2, 1, valores.length, CABECERAS_PADRON.length).setNumberFormat('@');
    hoja.getRange(2, 9, valores.length, 1).setNumberFormat('dd/mm/yyyy');
    hoja.getRange(2, 1, valores.length, CABECERAS_PADRON.length).setValues(valores);
}

/** The tab's cells, one row per RUC, in the order of CABECERAS_PADRON. */
function valoresPadron_(filas) {
    return filas.map(function (r) {
        var siNo = function (v) {
            return r.sinConsultar ? 'Sin consultar' : v ? 'Sí' : 'No';
        };
        var d = r.domicilio || {};
        return [
            r.ruc || '',
            r.razon_social || '',
            r.estado || '',
            r.condicion || '',
            siNo(r.buen_contribuyente),
            siNo(r.agente_retencion),
            siNo(r.agente_percepcion),
            r.padrones_detalle || '',
            r.consultado_en ? new Date(r.consultado_en) : '',
            d.direccion || '',
            d.distrito || '',
            d.provincia || '',
            d.departamento || '',
        ];
    });
}

// ── El disparador automático ────────────────────────────────────────

function instalarPadronAutomatico() {
    quitarPadronAutomatico();
    ScriptApp.newTrigger('sincronizarPadronRuc').timeBased().atHour(8).everyDays(1).create();
    SpreadsheetApp.getUi().alert(
        'Listo. Todos los días a las 8 de la mañana esta pestaña se pone al día con lo que haya ' + 'consultado el scraper de SUNAT hasta ese momento.',
    );
}

function quitarPadronAutomatico() {
    ScriptApp.getProjectTriggers().forEach(function (t) {
        if (t.getHandlerFunction() === 'sincronizarPadronRuc') ScriptApp.deleteTrigger(t);
    });
}
