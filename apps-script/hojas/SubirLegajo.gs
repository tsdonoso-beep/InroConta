/**
 * Subir el legajo por OC a la base v2
 * --------------------------------------------------------------------------
 *
 * Va en el MISMO proyecto que LegajoPorOC.gs (usa sus constantes y
 * funciones). Manda a la base v2, para la empresa del legajo (Inroprin, la
 * que tiene comprobantes de SUNAT), con las funciones de
 * docs/database/v2/005_escrituras_oc.sql (y la 014):
 *   · guardar_fuente_oc('LEGAJO'): una fila por OC con lo que dice el cuadro
 *     de aprobaciones (situación del pago, comprador, área, centro de costo,
 *     qué le falta) y cada carpeta que el cuadro le da (orden_compra_legajo);
 *   · guardar_carpetas_oc('LEGAJO') y cerrar_recorrido_oc: las carpetas que
 *     enlaza el cuadro y los archivos que sirven para unir la OC con su factura
 *     de SUNAT (los que cuentan como factura o traen una serie-número, del
 *     nombre o leída por dentro). Lo que el cuadro ya no enlaza deja de ser
 *     del legajo.
 *
 * El cruce con SUNAT lo calcula cada noche el robot de carpetas (carpetas-oc).
 *
 * Se sube solo cada noche, cuando los revisores terminan. También a mano:
 * menú «Legajo por OC» → «Subir el legajo a la base (hojas de SUNAT)».
 *
 * ── Instalación ──
 * 1. En el proyecto de Apps Script de la hoja: + → Script → «SubirLegajo» →
 *    pega esto → guarda.
 * 2. Engranaje (Configuración del proyecto) → Propiedades del script:
 *    SUPABASE_URL_V2 (https://….supabase.co) y SUPABASE_SECRET_KEY (la llave
 *    secreta de la base v2), las mismas de CarpetaMadre.gs. Nunca en el código:
 *    el repositorio es público. Las viejas (SUPABASE_URL, SUPABASE_ANON_KEY,
 *    ROBOT_CORREO, ROBOT_CLAVE) ya no se usan: se pueden borrar.
 */

var LEGAJO_RUC_POR_UNIDAD = { INROPRIN: '20512201611' };
var LEGAJO_LOTE = 300;

function subirLegajoALaBase() {
    var ui = SpreadsheetApp.getUi();
    var r = subirLegajo_();
    if (r.error) {
        ui.alert('No se pudo subir', r.error, ui.ButtonSet.OK);
        return;
    }
    ui.alert('Legajo subido', r.texto + '\n\nLas columnas aparecen en las hojas con la próxima corrida del robot de carpetas.', ui.ButtonSet.OK);
}

/**
 * Sube el legajo. No lanza: devuelve { texto } o { error }, para que la
 * subida automática de la noche no tumbe la tanda que la llama.
 */
function subirLegajo_() {
    if (!hayCredencialesDeLaBase_()) {
        return {
            error:
                'Faltan las Propiedades del script SUPABASE_URL_V2 y SUPABASE_SECRET_KEY. ' +
                'En Apps Script → engranaje → Propiedades del script (las mismas de CarpetaMadre.gs).',
        };
    }
    try {
        var cfg = configuracionLegajo_();
        var datos = filasDelLegajo_(SpreadsheetApp.getActiveSpreadsheet());
        // Lo que este recorrido no vuelva a ver desde aquí deja de ser del legajo al cerrarlo
        // (con margen por si el reloj de Google y el de la base no coinciden).
        var inicio = new Date(Date.now() - 5 * 60000).toISOString();
        var textos = [];
        Object.keys(datos).forEach(function (ruc) {
            var d = datos[ruc];
            var f = rpcLegajo_(cfg, 'guardar_fuente_oc', { p_empresa_ruc: ruc, p_fuente: 'LEGAJO', p_filas: d.ocs, p_completa: true });
            var carpetas = 0,
                archivos = 0;
            // Todas las carpetas antes que cualquier archivo: la base une un archivo a su carpeta solo si ya está.
            for (var i = 0; i < d.carpetas.length; i += LEGAJO_LOTE)
                carpetas += rpcLegajo_(cfg, 'guardar_carpetas_oc', {
                    p_empresa_ruc: ruc,
                    p_recorrido: 'LEGAJO',
                    p_carpetas: d.carpetas.slice(i, i + LEGAJO_LOTE),
                }).carpetas;
            for (var j = 0; j < d.archivos.length; j += LEGAJO_LOTE)
                archivos += rpcLegajo_(cfg, 'guardar_carpetas_oc', {
                    p_empresa_ruc: ruc,
                    p_recorrido: 'LEGAJO',
                    p_archivos: d.archivos.slice(j, j + LEGAJO_LOTE),
                }).archivos;
            var c = rpcLegajo_(cfg, 'cerrar_recorrido_oc', { p_empresa_ruc: ruc, p_recorrido: 'LEGAJO', p_procedencia: null, p_inicio: inicio });
            textos.push(
                f.filas +
                    ' OC (' +
                    f.quitadas +
                    ' ya no están en el cuadro), ' +
                    carpetas +
                    ' carpetas y ' +
                    archivos +
                    ' archivos de factura' +
                    (c.carpetas_quitadas || c.archivos_quitados
                        ? '; quitados ' + c.carpetas_quitadas + ' carpetas y ' + c.archivos_quitados + ' archivos que el cuadro ya no enlaza'
                        : '') +
                    (d.saltadas.length
                        ? '; sin subir ' + d.saltadas.length + ' filas con una OC que no se entiende (' + d.saltadas.slice(0, 5).join(', ') + ')'
                        : ''),
            );
        });
        var texto = 'Subido a la base v2: ' + textos.join('; ') + '.';
        PropertiesService.getDocumentProperties().setProperty(
            'LEGAJO_ULTIMA_SUBIDA',
            Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') + ' — ' + texto,
        );
        return { texto: texto };
    } catch (e) {
        Logger.log(e && e.stack ? e.stack : e);
        return { error: String(e.message || e) };
    }
}

/** ¿Están las credenciales? Para que la subida automática no avise de más. */
function hayCredencialesDeLaBase_() {
    var c = configuracionLegajo_();
    return !!(c.url && c.key);
}

// ── Qué se sube ──

/** «0172-2026» o «172-2026»: lo demás («2603-0028») no es una OC y no se sube. */
var LEGAJO_OC = /^\d{3,4}-20\d\d$/;

/** «Importación» → IMPORTACION; sin procedencia, la OC de 3 dígitos es de importación (como CG). */
function procedenciaLegajo_(texto, oc) {
    var t = normalizar_(texto);
    if (/IMPO/.test(t)) return 'IMPORTACION';
    if (/NAC/.test(t)) return 'NACIONAL';
    return /^\d{3}-/.test(oc) ? 'IMPORTACION' : 'NACIONAL';
}

/** Una fecha de la TABLA como «aaaa-mm-dd» (un Date o «dd/mm/aaaa»); null si no es fecha. */
function isoLegajo_(v, zona) {
    if (v instanceof Date) return Utilities.formatDate(v, zona, 'yyyy-MM-dd');
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v || '').trim());
    return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : null;
}

/**
 * Por empresa (RUC): una fila por OC de la TABLA (si el cuadro la lista en varias carpetas, manda
 * la revisada más hace poco, como hizo db:mudanza, y cada carpeta va en `carpetas`), las carpetas
 * que enlaza y sus archivos útiles de ARCHIVOS. Se lee por el NOMBRE de las columnas, no por su posición.
 */
function filasDelLegajo_(libro) {
    var hojaT = libro.getSheetByName('TABLA');
    if (!hojaT || hojaT.getLastRow() < 2) throw new Error('Todavía no hay TABLA: primero arma el legajo.');
    var t = hojaT.getDataRange().getValues();
    var cab = t[0].map(String);
    var c = function (n) {
        return cab.indexOf(n);
    };
    var zona = Session.getScriptTimeZone();
    var txt = function (v) {
        if (v instanceof Date) return Utilities.formatDate(v, zona, 'dd/MM/yyyy');
        return v == null ? '' : String(v).trim();
    };
    var nulo = function (v) {
        var s = txt(v);
        return s === '' ? null : s;
    };
    var lista = function (v) {
        return txt(v)
            .split(/\s*,\s*/)
            .filter(Boolean);
    };

    var porRuc = {},
        deQuien = {}; // «OC|id de carpeta» → { ruc, proc }
    t.slice(1).forEach(function (f) {
        var ruc = LEGAJO_RUC_POR_UNIDAD[normalizar_(f[c('Unidad de negocio')])];
        var oc = txt(f[c('OC')]);
        if (!ruc || !oc) return;
        var d = porRuc[ruc] || (porRuc[ruc] = { porOc: {}, carpetas: {}, archivos: [], saltadas: [] });
        if (!LEGAJO_OC.test(oc)) {
            d.saltadas.push(oc);
            return;
        }
        var proc = procedenciaLegajo_(f[c('Procedencia')], oc);
        var url = txt(f[c('Enlace de la carpeta')]);
        var carpetaId = idDeDrive_(url);
        var documentos = {};
        DOCS.forEach(function (doc) {
            documentos[doc.col] = txt(f[c(doc.col)]);
        });
        var revisado = f[c('Revisado en')];
        var monto = typeof f[c('Monto en soles')] === 'number' ? f[c('Monto en soles')] : null;
        var fila = {
            carpeta_id: carpetaId,
            carpeta_url: url || null,
            unidad: nulo(f[c('Unidad de negocio')]),
            proyecto: nulo(f[c('Proyecto')]),
            proveedor: nulo(f[c('Proveedor')]),
            proveedor_ruc: nulo(f[c('RUC (CG)')]),
            comprador: nulo(f[c('Comprador')]),
            area: nulo(f[c('Área que la completa')]),
            situacion_pago: nulo(f[c('Situación del pago')]),
            estatus: nulo(f[c('Estatus (aprobaciones)')]),
            estado_aprobacion: nulo(f[c('Estado de aprobación')]),
            fecha_oc: isoLegajo_(f[c('Fecha OC')], zona),
            monto_soles: monto,
            forma_pago: nulo(f[c('Forma de pago')]),
            cc_codigo: nulo(f[c('Centro de costo (CG)')]),
            cc_nombre: nulo(f[c('Nombre del centro de costo (CG)')]),
            estado_revision: nulo(txt(f[c('Estado de la revisión')]).split(' — ')[0]),
            le_falta: lista(f[c('Le falta')]),
            documentos: documentos,
            revisado_en: revisado instanceof Date ? revisado.toISOString() : null,
        };
        var k = proc + '|' + oc;
        var o = d.porOc[k];
        if (!o) o = d.porOc[k] = { procedencia: proc, oc: oc, carpetas: [], ultima: null };
        o.carpetas.push(fila);
        if (!o.ultima || String(fila.revisado_en || '') >= String(o.ultima.revisado_en || '')) o.ultima = fila;
        if (carpetaId) {
            d.carpetas[carpetaId] = d.carpetas[carpetaId] || {
                drive_id: carpetaId,
                procedencia: proc,
                oc: oc,
                // El nombre de verdad lo pone el robot de carpetas; la base no pisa uno que ya tenga.
                nombre: 'Legajo ' + oc,
                proveedor: fila.proveedor,
                proyecto: fila.proyecto,
            };
            deQuien[oc + '|' + carpetaId] = { ruc: ruc };
        }
    });

    var hojaA = libro.getSheetByName('ARCHIVOS');
    if (hojaA && hojaA.getLastRow() > 1) {
        var a = hojaA.getDataRange().getValues();
        var ca = a[0].map(String);
        var ia = function (n) {
            return ca.indexOf(n);
        };
        a.slice(1).forEach(function (f) {
            var oc = txt(f[ia('OC')]),
                carpetaId = idDeDrive_(txt(f[ia('Enlace carpeta OC')]));
            var q = deQuien[oc + '|' + carpetaId];
            var id = idDeDrive_(txt(f[ia('Enlace del archivo')]));
            if (!q || !id) return;
            var nombre = txt(f[ia('Nombre del archivo')]),
                cuenta = txt(f[ia('Cuenta como')]);
            var esFactura = /(^|, )1\. Factura/.test(cuenta);
            // La serie leída por dentro va en «Cuenta como»; si no, la del nombre (la base vieja guardaba las dos así).
            var leida = /leído por dentro: [^)]*?\b([FBE][A-Z0-9]{3}-\d{1,8})\b/.exec(cuenta);
            var serie = leida ? leida[1] : serieEnNombre_(nombre);
            if (!esFactura && !serie) return; // solo lo que sirve para unir con SUNAT
            porRuc[q.ruc].archivos.push({
                drive_id: id,
                carpeta_id: carpetaId,
                nombre: nombre || id,
                mime: nulo(f[ia('Tipo de archivo')]),
                parece: esFactura ? 'FACTURA' : nulo(f[ia('Parece ser')]),
                serie_en_nombre: serie || null,
                rucs_en_nombre: [],
            });
        });
    }

    var salida = {};
    Object.keys(porRuc).forEach(function (ruc) {
        var d = porRuc[ruc];
        salida[ruc] = {
            ocs: Object.keys(d.porOc).map(function (k) {
                var o = d.porOc[k],
                    u = o.ultima;
                // Lo que la fila más reciente deja vacío, de la más reciente que lo diga (como db:mudanza).
                var porFecha = o.carpetas.slice().sort(function (a, b) {
                    return String(b.revisado_en || '').localeCompare(String(a.revisado_en || ''));
                });
                var dato = function (campo) {
                    if (u[campo] != null) return u[campo];
                    for (var i = 0; i < porFecha.length; i++) if (porFecha[i][campo] != null) return porFecha[i][campo];
                    return null;
                };
                var cc = u.cc_codigo
                    ? u
                    : porFecha.filter(function (x) {
                          return x.cc_codigo;
                      })[0] || u;
                return {
                    procedencia: o.procedencia,
                    oc: o.oc,
                    area: dato('area'),
                    situacion_pago: u.situacion_pago,
                    estatus: u.estatus,
                    estado_aprobacion: u.estado_aprobacion,
                    forma_pago: dato('forma_pago'),
                    legajo_revision: u.estado_revision,
                    legajo_le_falta: u.le_falta,
                    comprador: dato('comprador'),
                    proveedor_ruc: dato('proveedor_ruc'),
                    proveedor_nombre: dato('proveedor'),
                    fecha_oc: dato('fecha_oc'),
                    monto_pen: dato('monto_soles'),
                    cc_codigo: cc.cc_codigo,
                    cc_nombre: cc.cc_codigo ? cc.cc_nombre : null,
                    carpetas: o.carpetas,
                };
            }),
            carpetas: Object.keys(d.carpetas).map(function (id) {
                return d.carpetas[id];
            }),
            archivos: d.archivos,
            saltadas: d.saltadas,
        };
    });
    return salida;
}

// ── La base v2 ──

function configuracionLegajo_() {
    var p = PropertiesService.getScriptProperties();
    var limpio = function (k) {
        return String(p.getProperty(k) || '')
            .trim()
            .replace(/^["'«“]+|["'»”]+$/g, '')
            .trim();
    };
    return { url: limpio('SUPABASE_URL_V2').replace(/\/+$/, ''), key: limpio('SUPABASE_SECRET_KEY') };
}

/** Una función de escritura de la v2; su error, crudo al registro y con el nombre de la función. */
function rpcLegajo_(cfg, funcion, args) {
    var resp = UrlFetchApp.fetch(cfg.url + '/rest/v1/rpc/' + funcion, {
        method: 'post',
        contentType: 'application/json',
        headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key },
        payload: JSON.stringify(args),
        muteHttpExceptions: true,
    });
    var codigo = resp.getResponseCode();
    if (codigo === 401 || codigo === 403)
        throw new Error('La base v2 rechazó SUPABASE_SECRET_KEY (error ' + codigo + '). Cópiala exacta, sin espacios ni comillas.');
    if (codigo >= 300) {
        Logger.log(funcion + ' → ' + codigo + ': ' + resp.getContentText());
        throw new Error(funcion + ' falló (error ' + codigo + '): ' + resp.getContentText().slice(0, 300));
    }
    return JSON.parse(resp.getContentText());
}
