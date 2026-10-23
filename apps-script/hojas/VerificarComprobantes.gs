/**
 * Verificar contra SUNAT una lista de comprobantes antes de cargarla al CONCAR
 *
 * Para la hoja donde se arma la carga masiva (por ejemplo, la tabla que arma
 * la IA con los correos de rendiciones de Rosa). Menú «SUNAT → Verificar esta
 * pestaña»: lee las columnas de RUC, serie, número y total de la pestaña
 * abierta y escribe al costado, en cada fila:
 *
 *   SUNAT: verificación   OK: emitida en SUNAT / Ojo: tiene nota de crédito /
 *                         Ojo: ya no aparece en el SIRE (¿dada de baja?) /
 *                         Ojo: el monto de SUNAT es otro / No está en SUNAT (todavía)
 *   SUNAT: total          el total según SUNAT
 *   SUNAT: notas de crédito   las que modifican ese comprobante
 *   Duplicado             si el mismo comprobante está dos veces en la pestaña,
 *                         o ya está en la pestaña «REGISTRO CONCAR»
 *
 * Duplicados contra lo ya cargado: pegar en una pestaña llamada «REGISTRO CONCAR»
 * el registro de compras exportado del CONCAR (con columnas de RUC, serie y
 * número). Se compara DENTRO de la hoja: el registro del CONCAR no se sube a
 * ningún lado.
 *
 * Las columnas se reconocen por su título, sin importar el orden ni las
 * tildes: «RUC»; «Serie» y «Número» (o una sola columna «Comprobante» o
 * «Documento» con F001-123); «Tipo» (opcional); «Total», «Importe» o «Monto».
 *
 * Instalación (una vez):
 *   1. En la hoja: Extensiones → Apps Script → pegar este archivo.
 *   2. Engranaje → Propiedades del script: SUPABASE_URL_V2 y SUPABASE_SECRET_KEY
 *      (los mismos de CarpetaMadre.gs; nunca en el código: el repositorio es público).
 *   3. Recargar la hoja: aparece el menú «SUNAT».
 *
 * Lee la base v2 (comprobante y registro_compras): la regla es la de
 * verificar_comprobantes_json de la base vieja (migración 064), ahora aquí abajo.
 */

var VC_CONCAR = 'REGISTRO CONCAR';
var VC_TITULOS = ['SUNAT: verificación', 'SUNAT: total', 'SUNAT: notas de crédito', 'Duplicado'];

function onOpen() {
    SpreadsheetApp.getUi().createMenu('SUNAT').addItem('Verificar esta pestaña', 'verificarComprobantes').addToUi();
}

function verificarComprobantes() {
    var ui = SpreadsheetApp.getUi();
    var hoja = SpreadsheetApp.getActiveSheet();
    try {
        var t = leerTablaVC_(hoja);
        if (!t) {
            ui.alert(
                'No encontré las columnas',
                'La pestaña «' +
                    hoja.getName() +
                    '» necesita columnas con título RUC, Serie y Número ' +
                    '(o una columna Comprobante con F001-123). Total es opcional.',
                ui.ButtonSet.OK,
            );
            return;
        }
        // Duplicados: dentro de la pestaña y contra el registro del CONCAR (si está la pestaña).
        var vistas = {},
            concar = {};
        var reg = hoja.getParent().getSheetByName(VC_CONCAR);
        if (reg && reg.getSheetId() !== hoja.getSheetId()) {
            var tc = leerTablaVC_(reg);
            if (tc)
                tc.filas.forEach(function (f) {
                    if (f.clave) concar[f.clave] = concar[f.clave] || f.fila;
                });
        }
        var duplicado = t.filas.map(function (f) {
            if (!f.clave) return '';
            var d = [];
            if (vistas[f.clave]) d.push('Repetido en esta pestaña (fila ' + vistas[f.clave] + ')');
            else vistas[f.clave] = f.fila;
            if (concar[f.clave]) d.push('Ya está en el CONCAR (fila ' + concar[f.clave] + ' de «' + VC_CONCAR + '»)');
            return d.join(' · ');
        });

        // SUNAT, según la base v2.
        var cfg = configVC_();
        var resultado = {};
        verificarEnV2_(
            cfg,
            t.filas.map(function (f, k) {
                return { i: k, ruc: f.ruc, tipo: f.tipo, serie: f.serie, numero: f.numero, total: f.total };
            }),
        ).forEach(function (r) {
            resultado[r.i] = r;
        });

        // Las cuatro columnas al costado (si ya estaban, se reescriben).
        var col = t.columnas.salida;
        hoja.getRange(t.filaTitulo, col, 1, VC_TITULOS.length).setValues([VC_TITULOS]).setFontWeight('bold');
        var valores = [],
            fondos = [];
        t.filas.forEach(function (f, k) {
            var r = resultado[k] || {};
            var alerta = f.clave ? r.alerta || '' : '';
            valores.push([alerta, r.total_sunat == null ? '' : Number(r.total_sunat), r.notas || '', duplicado[k]]);
            var color = /^OK/.test(alerta) ? '#d9ead3' : /^Ojo/.test(alerta) ? '#fff2cc' : /^No está/.test(alerta) ? '#f4cccc' : null;
            fondos.push([color, null, null, duplicado[k] ? '#f4cccc' : null]);
        });
        if (valores.length) {
            var rango = hoja.getRange(t.filas[0].fila, col, valores.length, VC_TITULOS.length);
            rango.setValues(valores).setBackgrounds(fondos);
            hoja.getRange(t.filas[0].fila, col + 1, valores.length, 1).setNumberFormat('#,##0.00');
        }
        var cuenta = function (re) {
            return valores.filter(function (v) {
                return re.test(v[0]);
            }).length;
        };
        var dups = duplicado.filter(Boolean).length;
        ui.alert(
            'Verificación lista',
            valores.length +
                ' comprobantes:\n' +
                '• OK: ' +
                cuenta(/^OK/) +
                '\n• Ojo (nota de crédito, monto o baja): ' +
                cuenta(/^Ojo/) +
                '\n• No están en SUNAT: ' +
                cuenta(/^No está/) +
                '\n• Duplicados: ' +
                dups +
                (reg ? '' : '\n\nPara ver duplicados contra lo ya cargado, pega el registro del CONCAR en una pestaña «' + VC_CONCAR + '».'),
            ui.ButtonSet.OK,
        );
    } catch (e) {
        ui.alert('No se pudo verificar', String(e.message || e), ui.ButtonSet.OK);
    }
}

// ── Leer la pestaña ──

/** Sin tildes, en mayúsculas y sin signos: «Número» → «NUMERO», «N°» → «N». */
function planoVC_(t) {
    return String(t == null ? '' : t)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Busca la fila de títulos (en las 15 primeras) y las columnas; null si no las encuentra. */
function leerTablaVC_(hoja) {
    var valores = hoja.getDataRange().getValues();
    for (var r = 0; r < Math.min(15, valores.length); r++) {
        var cab = valores[r].map(planoVC_);
        var buscar = function (prueba) {
            for (var c = 0; c < cab.length; c++) if (cab[c] && prueba(cab[c])) return c;
            return -1;
        };
        var col = {
            ruc: buscar(function (h) {
                return /\bRUC\b/.test(h) && !/RAZON|NOMBRE/.test(h);
            }),
            serie: buscar(function (h) {
                return /\bSERIE\b/.test(h) && !/NUMERO/.test(h);
            }),
            numero: buscar(function (h) {
                return /^(N|NRO|NUM|NUMERO|N DOC|NRO DOC|NUMERO DOC|NUMERO DE DOCUMENTO|NUMERO DEL COMPROBANTE|NRO COMPROBANTE|CORRELATIVO)$/.test(h);
            }),
            comprobante: buscar(function (h) {
                return /COMPROBANTE|DOCUMENTO|SERIE NUMERO|SERIE Y NUMERO/.test(h) && !/TIPO|FECHA|RUC/.test(h);
            }),
            tipo: buscar(function (h) {
                return /^(TIPO|TD|T D|TIPO DOC|TIPO DE DOC|TIPO DE DOCUMENTO|TIPO DE COMPROBANTE|TIPO COMPROBANTE)$/.test(h);
            }),
            total: buscar(function (h) {
                return /^TOTAL\b|IMPORTE TOTAL|^IMPORTE$|^MONTO|TOTAL COMPROBANTE/.test(h);
            }),
        };
        if (col.ruc < 0 || (col.serie < 0 && col.comprobante < 0)) continue;
        if (col.serie >= 0 && col.numero < 0 && col.comprobante < 0) continue;
        // Dónde escribir: si ya están los títulos de una corrida anterior, ahí; si no, después de la última columna con título.
        var crudo = valores[r].map(function (v) {
            return String(v || '').trim();
        });
        var previa = crudo.indexOf(VC_TITULOS[0]);
        var ultima = 0;
        crudo.forEach(function (v, i) {
            if (v) ultima = i;
        });
        col.salida = (previa >= 0 ? previa : ultima + 1) + 1;
        var filas = [];
        for (var f = r + 1; f < valores.length; f++) {
            var v = valores[f],
                ruc = String(v[col.ruc] || '').replace(/\D/g, ''),
                serie = '',
                numero = '';
            if (col.serie >= 0 && col.numero >= 0) {
                serie = String(v[col.serie] || '')
                    .trim()
                    .toUpperCase();
                numero = String(v[col.numero] || '').replace(/\D/g, '');
            } else {
                var m = /([A-Z0-9]{3,4})\s*-\s*0*(\d+)/i.exec(String(v[col.comprobante] || ''));
                if (m) {
                    serie = m[1].toUpperCase();
                    numero = m[2];
                }
            }
            if (!ruc && !serie && !numero) continue;
            numero = numero.replace(/^0+(?=\d)/, '');
            filas.push({
                fila: f + 1,
                ruc: ruc,
                serie: serie,
                numero: numero,
                tipo: col.tipo >= 0 ? String(v[col.tipo] || '') : '',
                total: col.total >= 0 && v[col.total] !== '' ? String(v[col.total]) : '',
                clave: ruc && serie && numero ? ruc + '|' + serie + '|' + numero : '',
            });
        }
        return { filaTitulo: r + 1, columnas: col, filas: filas };
    }
    return null;
}

// ── La base v2 ──
//
// La v2 no tiene funciones de lectura y solo la llave de servicio la lee (docs/database/v2/README.md,
// «Reglas del diseño» 6 y 7): se leen sus tablas por REST y aquí se aplica la regla que antes hacía
// verificar_comprobantes_json en la base vieja (migración 064), en el mismo orden de alertas.

var VC_EMPRESA = '20512201611';
var VC_PAGINA = 1000;
var VC_RUCS_POR_PEDIDO = 40;

function configVC_() {
    var p = PropertiesService.getScriptProperties();
    var limpio = function (k) {
        return String(p.getProperty(k) || '')
            .trim()
            .replace(/^["'«“]+|["'»”]+$/g, '')
            .trim();
    };
    var cfg = { url: limpio('SUPABASE_URL_V2').replace(/\/+$/, ''), key: limpio('SUPABASE_SECRET_KEY') };
    var faltan = [];
    if (!cfg.url) faltan.push('SUPABASE_URL_V2');
    if (!cfg.key) faltan.push('SUPABASE_SECRET_KEY');
    if (faltan.length) throw new Error('Faltan las Propiedades del script: ' + faltan.join(' y ') + ' (Apps Script → engranaje → Propiedades del script).');
    return cfg;
}

/** Cada consulta ('tabla?select=…&order=…', con un orden único) entera, de a 1000 filas; las primeras páginas en paralelo. */
function leerVC_(cfg, consultas) {
    var pedido = function (ruta, desde) {
        return {
            url: cfg.url + '/rest/v1/' + ruta + (/[?&]limit=/.test(ruta) ? '' : '&limit=' + VC_PAGINA + '&offset=' + desde),
            method: 'get',
            headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key },
            muteHttpExceptions: true,
        };
    };
    var leer = function (resp) {
        var codigo = resp.getResponseCode();
        if (codigo === 401 || codigo === 403)
            throw new Error('La base v2 rechazó SUPABASE_SECRET_KEY (error ' + codigo + '). Cópiala exacta, sin espacios ni comillas.');
        if (codigo >= 300) {
            Logger.log('lectura v2 → ' + codigo + ': ' + resp.getContentText());
            throw new Error('No se pudo leer la base v2 (error ' + codigo + '): ' + resp.getContentText().slice(0, 300));
        }
        return JSON.parse(resp.getContentText());
    };
    var primeras = UrlFetchApp.fetchAll(
        consultas.map(function (q) {
            return pedido(q, 0);
        }),
    );
    return consultas.map(function (q, i) {
        var filas = leer(primeras[i]);
        for (var desde = VC_PAGINA, ultima = filas.length; ultima === VC_PAGINA && !/[?&]limit=/.test(q); desde += VC_PAGINA) {
            var r = pedido(q, desde);
            var pagina = leer(UrlFetchApp.fetch(r.url, r));
            filas = filas.concat(pagina);
            ultima = pagina.length;
        }
        return filas;
    });
}

/** «F», «Factura», «NC», «1» → '01', '07', '01'… (tipo_comprobante_codigo de la base vieja). */
function tipoVC_(p) {
    var t = String(p == null ? '' : p)
        .trim()
        .toUpperCase();
    if (/^\d{1,2}$/.test(t)) return ('0' + t).slice(-2);
    if (/^(F|FACT|FACTURA)/.test(t)) return '01';
    if (/^(B|BV|BOL|BOLETA)/.test(t)) return '03';
    if (/^(NC|NOTA DE CR|NOTA CR)/.test(t)) return '07';
    if (/^(ND|NOTA DE D|NOTA D)/.test(t)) return '08';
    if (/^(RH|RXH|R X H|RECIBO POR HON|HONORARIOS)/.test(t)) return '02';
    if (/^(TK|TICKET)/.test(t)) return '12';
    return t;
}

var sinCerosVC_ = function (n) {
    return (
        String(n == null ? '' : n)
            .replace(/\D/g, '')
            .replace(/^0+/, '') || '0'
    );
};

/** 1234.5 → «1,234.50» (como to_char(…, 'FM999G999G990D00') de la base vieja). */
function montoVC_(n) {
    var s = Math.abs(Number(n)).toFixed(2).split('.');
    return (Number(n) < 0 ? '-' : '') + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + s[1];
}

/** Lo que SUNAT sabe de cada fila: [{i, en_sire, en_xml, total_sunat, notas, ya_no_esta, alerta}]. */
function verificarEnV2_(cfg, filas) {
    var f = filas.map(function (x) {
        var total = String(x.total == null ? '' : x.total).replace(/[^\d.\-]/g, '');
        return {
            i: x.i,
            ruc: String(x.ruc || '').replace(/\D/g, ''),
            tipo: tipoVC_(x.tipo),
            serie: String(x.serie || '')
                .trim()
                .toUpperCase(),
            numero: sinCerosVC_(x.numero),
            total: total === '' || isNaN(Number(total)) ? null : Number(total),
        };
    });
    var rucs = [];
    f.forEach(function (x) {
        if (/^\d{11}$/.test(x.ruc) && rucs.indexOf(x.ruc) < 0) rucs.push(x.ruc);
    });
    var consultas = [];
    for (var k = 0; k < rucs.length; k += VC_RUCS_POR_PEDIDO)
        consultas.push(
            'comprobante?select=id,emisor_ruc,tipo,serie,numero,moneda,total,xml_estado,modifica_serie,modifica_numero,' +
                'registro_compras(periodo,total,ultima_vez)' +
                '&empresa_ruc=eq.' +
                VC_EMPRESA +
                '&origen=eq.RECIBIDO&emisor_ruc=in.(' +
                rucs.slice(k, k + VC_RUCS_POR_PEDIDO).join(',') +
                ')&order=id',
        );
    var docs = consultas.length ? [].concat.apply([], leerVC_(cfg, consultas)) : [];

    var porClave = {},
        notasDe = {};
    docs.forEach(function (d) {
        var clave = d.emisor_ruc + '|' + String(d.serie).toUpperCase() + '|' + sinCerosVC_(d.numero);
        (porClave[clave] = porClave[clave] || []).push(d);
        if (d.tipo === '07' && d.modifica_serie) {
            var mod = d.emisor_ruc + '|' + String(d.modifica_serie).toUpperCase() + '|' + sinCerosVC_(d.modifica_numero);
            // El total que dice el SIRE (negativo en una nota), como lo mostraba la base vieja.
            var s = (d.registro_compras || []).slice().sort(function (a, b) {
                return String(b.ultima_vez).localeCompare(String(a.ultima_vez));
            })[0];
            var monto = s && s.total != null ? s.total : d.total;
            var texto = String(d.serie).toUpperCase() + '-' + sinCerosVC_(d.numero) + ' ' + (d.moneda || '') + ' ' + (monto == null ? '' : montoVC_(monto));
            var n = (notasDe[mod] = notasDe[mod] || []);
            if (n.indexOf(texto) < 0) n.push(texto);
        }
    });
    // El registro del SIRE más reciente de cada comprobante, y la última lectura de cada mes.
    var sire = function (d) {
        return (d.registro_compras || []).slice().sort(function (a, b) {
            return String(b.ultima_vez).localeCompare(String(a.ultima_vez));
        })[0];
    };
    var periodos = [];
    docs.forEach(function (d) {
        var s = sire(d);
        if (s && periodos.indexOf(s.periodo) < 0) periodos.push(s.periodo);
    });
    var ultimaDe = {};
    if (periodos.length) {
        var u = leerVC_(
            cfg,
            periodos.map(function (p) {
                return 'registro_compras?select=ultima_vez&empresa_ruc=eq.' + VC_EMPRESA + '&periodo=eq.' + p + '&order=ultima_vez.desc&limit=1';
            }),
        );
        periodos.forEach(function (p, i) {
            ultimaDe[p] = u[i][0] ? u[i][0].ultima_vez : null;
        });
    }

    return f.map(function (x) {
        var candidatos = (porClave[x.ruc + '|' + x.serie + '|' + x.numero] || []).filter(function (d) {
            return x.tipo === '' || d.tipo === x.tipo;
        });
        // Como la base vieja: el que el SIRE vio más hace poco.
        candidatos.sort(function (a, b) {
            var sa = sire(a),
                sb = sire(b);
            return String(sb ? sb.ultima_vez : '').localeCompare(String(sa ? sa.ultima_vez : ''));
        });
        var d = candidatos[0];
        var s = d ? sire(d) : null;
        var sTotal = s && s.total != null ? Number(s.total) : null;
        var xTotal = d && d.xml_estado === 'OK' && d.total != null ? Number(d.total) : null;
        var totalSunat = sTotal != null ? sTotal : xTotal;
        var notas = (notasDe[x.ruc + '|' + x.serie + '|' + x.numero] || []).sort().join(' | ');
        var ultima = s ? ultimaDe[s.periodo] : null;
        var yaNoEsta = !!(s && ultima && Date.parse(ultima) > Date.parse(s.ultima_vez) + 2 * 86400000);
        var alerta;
        if (!/^\d{11}$/.test(x.ruc) || x.serie === '') alerta = 'Revisar: falta RUC o serie';
        else if (yaNoEsta) alerta = 'Ojo: ya no aparece en el SIRE (¿dada de baja?)';
        else if (notas) alerta = 'Ojo: tiene nota de crédito';
        else if (totalSunat != null && x.total != null && Math.abs(Math.abs(totalSunat) - Math.abs(x.total)) > 1) alerta = 'Ojo: el monto de SUNAT es otro';
        else if (sTotal != null || xTotal != null) alerta = 'OK: emitida en SUNAT';
        else if (x.tipo === '02' || x.tipo === '12') alerta = 'No va al SIRE de compras (RxH / ticket)';
        else alerta = 'No está en SUNAT (todavía)';
        return { i: x.i, en_sire: sTotal != null, en_xml: xTotal != null, total_sunat: totalSunat, notas: notas, ya_no_esta: yaNoEsta, alerta: alerta };
    });
}
