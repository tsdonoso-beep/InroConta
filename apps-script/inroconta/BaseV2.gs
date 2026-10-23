/**
 * Lectura de la base v2 (la de ahora), compartida por CarpetaMadre.gs y PadronRuc.gs
 * --------------------------------------------------------------------------
 *
 * La base v2 no tiene funciones de lectura y solo la llave de servicio puede
 * leerla (docs/database/v2/README.md, «Reglas del diseño» 6 y 7): aquí se
 * leen sus tablas por REST, de a 1000 filas.
 *
 * Propiedades del script (Apps Script → engranaje → Propiedades del script):
 *   SUPABASE_URL_V2      https://<proyecto>.supabase.co
 *   SUPABASE_SECRET_KEY  la llave secreta (sb_secret_…) o la service_role
 * Nunca en el código: el repositorio es público.
 */

var V2_PAGINA = 1000;

/** URL and key of the v2 base, from the Script Properties; throws a Spanish message if one is missing. */
function v2Config_() {
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
    if (faltan.length) {
        throw new Error(
            'Faltan las Propiedades del script: ' +
                faltan.join(' y ') +
                '. En Apps Script → engranaje (Configuración del proyecto) → Propiedades del script: ' +
                'SUPABASE_URL_V2 (https://….supabase.co) y SUPABASE_SECRET_KEY (la llave secreta de la base v2).',
        );
    }
    return cfg;
}

/** One page of a read, as a UrlFetchApp.fetchAll request. */
function v2Pedido_(cfg, ruta, desde, contar) {
    var headers = { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key };
    if (contar) headers.Prefer = 'count=exact';
    // A read that sets its own limit is not paged.
    var pagina = /[?&]limit=/.test(ruta) ? '' : (ruta.indexOf('?') < 0 ? '?' : '&') + 'limit=' + V2_PAGINA + '&offset=' + desde;
    return {
        url: cfg.url + '/rest/v1/' + ruta + pagina,
        method: 'get',
        headers: headers,
        muteHttpExceptions: true,
    };
}

function v2Respuesta_(nombre, resp) {
    var codigo = resp.getResponseCode();
    if (codigo === 401 || codigo === 403) {
        throw new Error('La base v2 rechazó SUPABASE_SECRET_KEY (error ' + codigo + '). Cópiala exacta, sin espacios ni comillas.');
    }
    if (codigo >= 300) throw new Error('No se pudo leer ' + nombre + ' de la base v2 (error ' + codigo + '): ' + resp.getContentText().slice(0, 300));
    return JSON.parse(resp.getContentText());
}

/** The total of a counted answer, from «Content-Range: 0-999/14176»; null if it does not say. */
function v2Total_(resp) {
    var h = resp.getHeaders() || {};
    var rango = h['Content-Range'] || h['content-range'] || '';
    var m = /\/(\d+)$/.exec(String(rango));
    return m ? Number(m[1]) : null;
}

/**
 * Every row of several reads at once: `consultas` is { nombre: 'tabla?select=…&order=…' } (the
 * order must be unique, or two pages could overlap). Two rounds of parallel requests: the first
 * page of each read with its total, then all the remaining pages. Returns { nombre: [filas] }.
 */
function v2Leer_(consultas) {
    var cfg = v2Config_();
    var nombres = Object.keys(consultas);
    var primeras = UrlFetchApp.fetchAll(
        nombres.map(function (n) {
            return v2Pedido_(cfg, consultas[n], 0, true);
        }),
    );
    var datos = {};
    var resto = [];
    nombres.forEach(function (n, i) {
        datos[n] = v2Respuesta_(n, primeras[i]);
        if (datos[n].length < V2_PAGINA) return;
        var total = v2Total_(primeras[i]);
        if (total === null) {
            // Without a total, page by page until a short page.
            for (var desde = V2_PAGINA; ; desde += V2_PAGINA) {
                var pagina = v2Respuesta_(n, UrlFetchApp.fetchAll([v2Pedido_(cfg, consultas[n], desde, false)])[0]);
                datos[n] = datos[n].concat(pagina);
                if (pagina.length < V2_PAGINA) break;
            }
            return;
        }
        for (var d = V2_PAGINA; d < total; d += V2_PAGINA) resto.push({ nombre: n, desde: d });
    });
    if (resto.length) {
        var respuestas = UrlFetchApp.fetchAll(
            resto.map(function (r) {
                return v2Pedido_(cfg, consultas[r.nombre], r.desde, false);
            }),
        );
        // In page order, so each read keeps its order.
        resto.forEach(function (r, i) {
            datos[r.nombre] = datos[r.nombre].concat(v2Respuesta_(r.nombre, respuestas[i]));
        });
    }
    return datos;
}
