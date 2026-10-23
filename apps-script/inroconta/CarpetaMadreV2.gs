/**
 * Las filas de CARPETA MADRE y FACTURAS SIN OC, armadas desde las tablas de la base v2
 * --------------------------------------------------------------------------
 *
 * Antes las armaban en la base vieja carpetas_madre_fuentes_json() y
 * facturas_sin_oc_json(). La v2 no tiene funciones de lectura: lo que esas
 * funciones recalculaban en cada lectura ya está guardado (el vínculo factura
 * ↔ OC en comprobante_oc, la señal de factura sin OC en comprobante.sin_oc_*)
 * y aquí solo se juntan las tablas. Cada fila trae los mismos campos que
 * traía la función vieja, así CarpetaMadre.gs escribe las pestañas igual.
 * Lee con BaseV2.gs. Lo mismo hace la app web en
 * src/modules/legajo/infrastructure/folder-list.ts.
 */

// The legajo's order of documents (src/shared/lib/drive/legajo-carpeta.ts, DOCUMENTOS).
var CM_DOCUMENTOS = [
    'Factura',
    'OC',
    'SWIFT',
    'Guía de remisión',
    'DAM',
    'Cuadro de costeo',
    'Requerimiento',
    'Contrato',
    'Cotización',
    'Proforma',
    'Correos',
    'Acta de conformidad',
];
var CM_CC_SEGUN = {
    CG: 'Control de Gestión',
    CUADRO: 'Cuadro de aprobaciones',
    LEGAJO: 'Cuadro de aprobaciones',
    NOMBRE: 'Nombre de la carpeta del proyecto',
    ADMINISTRATIVO: 'Carpeta administrativa (área general)',
    MANUAL: 'Corregido a mano',
    SIN_ASIGNAR: 'Sin asignar',
};
var CM_COMPRADOR_SEGUN = { LEGAJO: 'Legajo por OC', COMEX: 'STATUS de COMEX', COMPRAS: 'Base de Compras' };

/** The v2 reads both tabs need (BaseV2.gs, v2Leer_). */
function cmConsultasV2_(ruc) {
    var e = '&empresa_ruc=eq.' + ruc;
    var cc = 'centro_costo:centro_costo_id(codigo,nombre,es_area)';
    var hace30 = new Date(Date.now() - 30 * 86400000).toISOString();
    return {
        carpetas:
            'carpeta_oc?select=drive_id,orden_compra_id,procedencia,nombre,tipo,proveedor,proyecto_carpeta,documentos,le_falta,estado,archivos,series,centro_costo_segun,visto_carpeta_en,' +
            cc +
            e +
            '&visto_carpeta_en=not.is.null&order=drive_id',
        ocs:
            'orden_compra?select=id,codigo,area,comprador,comprador_segun,situacion_pago,forma_pago,condicion_pago,legajo_en,compras_en,comex_en,cg_en,consorcio,fecha_oc,monto_pen,comex_estado,llegada_planta,dam,costeo,centro_costo_segun,' +
            cc +
            e +
            '&order=id',
        vales:
            'vale_almacen?select=id,orden_compra_id,vale,fecha_operacion,fecha_registro,operacion,tipo_documento,numero_documento' +
            e +
            '&movimiento=eq.INGRESO&orden_compra_id=not.is.null&order=id',
        duas: 'orden_compra_dua?select=orden_compra_id,dua,fecha&order=orden_compra_id,dua',
        vinculos:
            'comprobante_oc?select=comprobante_id,orden_compra_id,archivo:archivo_id(carpeta_id),comprobante:comprobante_id(serie,numero,emisor_ruc),' +
            'orden_compra:orden_compra_id(codigo,comprador,comprador_segun,area,legajo_en)&order=comprobante_id,orden_compra_id',
        cambiosCarpeta: 'cambio?select=id,clave,tipo,despues,ocurrido_en&entidad=eq.carpeta_oc&order=ocurrido_en.desc,id.desc',
        cambiosFuentes: 'cambio?select=id,clave&entidad=in.(orden_compra,vale_almacen)&ocurrido_en=gt.' + hace30 + '&order=id',
        sinOc:
            'comprobante?select=id,fecha_emision,emisor_ruc,emisor_nombre,serie,numero,moneda,total,pdf_drive_id,sin_oc_senal,sin_oc_razon,area_probable,emisor:emisor_ruc(razon_social)' +
            e +
            '&sin_oc_senal=in.(ALTA,MEDIA)&order=id',
        // The received invoices of 2026 (what facturas_sin_oc counted per supplier).
        facturas: 'comprobante?select=id,emisor_ruc' + e + '&origen=eq.RECIBIDO&tipo=eq.01&fecha_emision=gte.2026-01-01&order=id',
    };
}

/** The latest robot read of the folders (cheap: one row), to skip rewriting when nothing is new. */
function cmUltimaLecturaV2_(ruc) {
    var d = v2Leer_({ u: 'carpeta_oc?select=visto_carpeta_en&empresa_ruc=eq.' + ruc + '&visto_carpeta_en=not.is.null&order=visto_carpeta_en.desc&limit=1' });
    return d.u.length ? d.u[0].visto_carpeta_en : '';
}

function cmPorClave_(filas, clave) {
    var m = {};
    filas.forEach(function (f) {
        var k = String(f[clave]);
        (m[k] = m[k] || []).push(f);
    });
    return m;
}

function cmDma_(d) {
    return d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : 's/f';
}

/** The kardex purchase entries of the OC (evidencias_de_fuentes, GUIA): { texto, fecha } or null. */
function cmGuiaAlmacen_(vales) {
    var ingresos = (vales || [])
        .filter(function (v) {
            return /(COMPRA|ORDEN DE SERVICIO)/.test(v.operacion || '');
        })
        .sort(function (a, z) {
            var fa = a.fecha_operacion || '9999',
                fz = z.fecha_operacion || '9999';
            return fa < fz ? -1 : fa > fz ? 1 : String(a.vale) < String(z.vale) ? -1 : String(a.vale) > String(z.vale) ? 1 : 0;
        });
    if (!ingresos.length) return null;
    var fechas = ingresos
        .map(function (v) {
            return v.fecha_operacion || v.fecha_registro;
        })
        .filter(Boolean)
        .sort();
    var texto = ingresos
        .map(function (v) {
            return (
                (String(v.tipo_documento || '').indexOf('FACTURA') === 0 ? 'ingresó con factura ' : 'guía ') +
                (v.numero_documento || 's/n') +
                ' (vale ' +
                v.vale +
                ', ' +
                cmDma_(v.fecha_operacion || v.fecha_registro) +
                ')'
            );
        })
        .join('; ');
    return { texto: 'Almacén: ' + texto, fecha: fechas[0] || null };
}

/** COMEX's DAM/DUAs and its cost sheet (evidencias_de_fuentes, DAM and COSTEO). */
function cmEvidenciaComex_(oc, duas) {
    var r = {};
    duas = duas || [];
    if (oc.dam || duas.length) {
        var partes = [
            oc.dam ? 'DAM ' + oc.dam : '',
            duas.length
                ? 'DUA ' +
                  duas
                      .map(function (d) {
                          return d.dua;
                      })
                      .join(' / ')
                : '',
        ];
        r.DAM = 'COMEX: ' + partes.filter(Boolean).join(' · ');
    }
    if (oc.costeo && /COSTEAD/i.test(oc.costeo)) r.COSTEO = 'COMEX: ' + oc.costeo;
    return r;
}

/** {"Factura": 1, "OC": 2} → «Factura 1 · OC 2», in the legajo's order; a national OC's SWIFT is its «Pago de OC». */
function cmDocumentosTexto_(docs, nacional) {
    if (!docs) return '';
    var rango = function (k) {
        var i = CM_DOCUMENTOS.indexOf(k);
        return i < 0 ? 99 : i;
    };
    return Object.keys(docs)
        .sort(function (a, z) {
            return rango(a) - rango(z);
        })
        .map(function (k) {
            return (nacional && k === 'SWIFT' ? 'Pago de OC' : k) + ' ' + docs[k];
        })
        .join(' · ');
}

function cmEmpresaCorta_(nombre) {
    var s = String(nombre || '')
        .toUpperCase()
        .replace(/INDUSTRIAS ROLAND PRINT S\.?A\.?C\.?/g, 'INROPRIN')
        .replace(/INRO ?PL[AÁ]STICOS S\.?A\.?C\.?/g, 'INROPLAS')
        .replace(/\bROLAND PRINT\b/g, 'INROPRIN')
        .replace(/\s+/g, ' ')
        .trim();
    return s || 'INROPRIN';
}

/** The rows of CARPETA MADRE, with the fields carpetas_madre_fuentes_json() returned. */
function cmFilasV2_(d) {
    var ocs = {};
    d.ocs.forEach(function (o) {
        ocs[o.id] = o;
    });
    var vales = cmPorClave_(d.vales, 'orden_compra_id');
    var duas = cmPorClave_(d.duas, 'orden_compra_id');
    var vinculos = cmPorClave_(d.vinculos, 'orden_compra_id');
    var carpetasDe = cmPorClave_(d.carpetas, 'orden_compra_id');
    var ultimo = {};
    d.cambiosCarpeta.forEach(function (c) {
        if (!ultimo[c.clave]) ultimo[c.clave] = c;
    });
    var cambios = {};
    d.cambiosFuentes.forEach(function (c) {
        cambios[c.clave] = (cambios[c.clave] || 0) + 1;
    });

    var filas = d.carpetas.map(function (k) {
        var o = ocs[k.orden_compra_id] || {};
        var imp = k.procedencia === 'IMPORTACION';
        var procedencia = imp ? 'Importación' : 'Nacional';
        var estado = k.estado === 'VACIA' ? 'VACÍA' : k.estado || '';
        var hermanas = carpetasDe[k.orden_compra_id] || [];
        // The OC's invoices: the ones its files in this folder prove, or all if it is the OC's only folder.
        var cpe = {};
        (vinculos[o.id] || []).forEach(function (v) {
            if (hermanas.length !== 1 && !(v.archivo && v.archivo.carpeta_id === k.drive_id)) return;
            cpe[v.comprobante.serie + '-' + v.comprobante.numero + ' (' + v.comprobante.emisor_ruc + ')'] = true;
        });
        var facturas = Object.keys(cpe).sort();
        var guia = cmGuiaAlmacen_(vales[o.id]);
        var comex = imp ? cmEvidenciaComex_(o, duas[o.id]) : {};
        var faltan = k.le_falta || [];
        var porSubir = [],
            sinRastro = [];
        faltan.forEach(function (doc) {
            var ev =
                doc === 'Guía de remisión'
                    ? guia && guia.texto
                    : doc === 'DAM'
                      ? comex.DAM
                      : doc === 'Cuadro de costeo'
                        ? comex.COSTEO
                        : doc === 'Factura' && facturas.length
                          ? 'SUNAT: ' + facturas.join(' / ')
                          : null;
            if (ev) porSubir.push(doc + ' (' + ev + ')');
            else sinRastro.push(doc);
        });
        // The folder's own cost centre (as the old base); the OC's if the folder says nothing.
        var propio = k.centro_costo || k.centro_costo_segun;
        var cc = (propio ? k.centro_costo : o.centro_costo) || null;
        var ccSegun = propio ? k.centro_costo_segun : o.centro_costo_segun;
        // An area has no code: CG writes «-»; the approvals table, nothing.
        var delCuadro = ccSegun === 'CUADRO' || ccSegun === 'LEGAJO' || (ccSegun === 'PROYECTO' && imp);
        var cambio = ultimo[k.drive_id];
        var otras = hermanas
            .filter(function (h) {
                return h.drive_id !== k.drive_id && h.proyecto_carpeta != null;
            })
            .map(function (h) {
                return h.proyecto_carpeta + ' / ' + h.nombre;
            });
        return {
            procedencia: procedencia,
            oc: o.codigo || '',
            empresa: o.consorcio ? cmEmpresaCorta_(o.consorcio) : 'INROPRIN',
            empresa_segun: o.compras_en ? 'Base de Compras' : o.comex_en ? 'STATUS de COMEX' : 'Sin dato en Compras ni COMEX: se asume INROPRIN',
            area_responsable: o.area || (imp ? 'COMEX (importaciones)' : 'Compras nacionales'),
            comprador: o.comprador || '',
            comprador_segun: (o.comprador && CM_COMPRADOR_SEGUN[o.comprador_segun]) || '',
            situacion_pago: o.situacion_pago || '',
            // The approvals table's payment form; if not, Compras' with its condition.
            forma_pago: o.legajo_en && o.forma_pago ? o.forma_pago : [o.forma_pago, o.condicion_pago].filter(Boolean).join(' · '),
            fecha_oc: o.fecha_oc || null,
            monto_soles: o.monto_pen == null ? null : o.monto_pen,
            tipo: k.tipo,
            proveedor: k.proveedor,
            proyecto_carpeta: k.proyecto_carpeta,
            carpeta_nombre: k.nombre,
            carpeta_url: 'https://drive.google.com/drive/folders/' + k.drive_id,
            estado: estado,
            estado_detalle:
                estado === 'OK'
                    ? 'Completo'
                    : estado === 'VACÍA'
                      ? 'Carpeta vacía'
                      : !sinRastro.length && porSubir.length
                        ? 'Por subir'
                        : porSubir.length
                          ? 'Falta y por subir'
                          : 'Falta',
            le_falta: faltan.join(', '),
            falta_sin_rastro: sinRastro.join(', '),
            por_subir: porSubir.join(' | '),
            documentos: cmDocumentosTexto_(k.documentos, !imp),
            archivos: k.archivos,
            series: k.series,
            facturas_sunat: facturas.length ? facturas.join(' / ') : null,
            facturas_sunat_n: facturas.length,
            ingreso_almacen: guia ? guia.fecha : null,
            estado_comex: imp ? o.comex_estado || null : null,
            llegada_planta: imp ? o.llegada_planta || null : null,
            cambios_fuentes: cambios[k.procedencia + '|' + o.codigo] || 0,
            cc_codigo: !cc ? null : !cc.es_area ? cc.codigo : delCuadro ? null : '-',
            cc_nombre: cc ? cc.nombre : null,
            centro_costo_segun: cmTextoCcSegun_(ccSegun, imp),
            en_cg: !!o.cg_en,
            ultimo_cambio: cambio ? cambio.tipo + (cambio.despues ? ': ' + cambio.despues : '') : null,
            ultimo_cambio_fecha: cambio ? cambio.ocurrido_en : null,
            misma_oc_en_otra_carpeta: otras.length ? otras.join(' | ') : null,
            cargado_en: k.visto_carpeta_en,
        };
    });
    // As the old function: nationals first, then by year, OC and folder.
    var clave = function (f) {
        return [f.procedencia === 'Nacional' ? 0 : 1, String(f.oc).split('-')[1] || '', f.oc, f.carpeta_url];
    };
    return filas.sort(function (a, z) {
        var x = clave(a),
            y = clave(z);
        for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
        return 0;
    });
}

/** texto_cc_segun() of the old base. */
function cmTextoCcSegun_(segun, imp) {
    if (segun === 'PROYECTO') return imp ? 'Su carpeta de proyecto (las demás OC, según el cuadro)' : 'Su carpeta de proyecto (las demás OC, según CG)';
    return CM_CC_SEGUN[segun] || null;
}
