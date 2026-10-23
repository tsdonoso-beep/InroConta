/**
 * Las filas de FACTURAS SIN OC, desde la base v2
 * --------------------------------------------------------------------------
 *
 * La señal (ALTA / MEDIA), su razón y el área probable ya vienen guardadas en
 * cada comprobante (columnas sin_oc_*, las calcula el robot de las carpetas).
 * Aquí se suma lo que la pestaña muestra del proveedor: cuántas facturas
 * tiene, cuántas unidas a una OC, sus OC y el comprador que más le compra.
 * Mismos campos que facturas_sin_oc_json() de la base vieja.
 */

/** The rows of FACTURAS SIN OC: ALTA first, then MEDIA, from the largest amount (in soles at 3.75). */
function cmSinOcV2_(d) {
    var unidas = {};
    d.vinculos.forEach(function (v) {
        unidas[v.comprobante_id] = true;
    });
    // The supplier's 2026 invoices and how many are tied to an OC.
    var conteo = {};
    d.facturas.forEach(function (f) {
        var c = conteo[f.emisor_ruc] || (conteo[f.emisor_ruc] = { n: 0, conOc: 0 });
        c.n++;
        if (unidas[f.id]) c.conOc++;
    });
    // Its OCs and the (area, buyer) of the approvals table that appears most among them.
    var proveedor = {};
    d.vinculos.forEach(function (v) {
        var ruc = v.comprobante && v.comprobante.emisor_ruc;
        var o = v.orden_compra || {};
        var p = proveedor[ruc] || (proveedor[ruc] = { ocs: {}, quien: {} });
        if (o.codigo) p.ocs[o.codigo] = true;
        var comprador = o.comprador_segun === 'LEGAJO' ? o.comprador || '' : '';
        var area = o.legajo_en ? o.area || '' : '';
        if (comprador || area) {
            var k = area + '\u0001' + comprador;
            p.quien[k] = (p.quien[k] || 0) + 1;
        }
    });
    var soles = function (f) {
        return (Number(f.total) || 0) * (f.moneda === 'USD' ? 3.75 : 1);
    };
    var filas = d.sinOc.slice().sort(function (a, z) {
        var r = (a.sin_oc_senal === 'ALTA' ? 0 : 1) - (z.sin_oc_senal === 'ALTA' ? 0 : 1);
        if (r) return r;
        if (soles(z) !== soles(a)) return soles(z) - soles(a);
        var x = [a.emisor_ruc, a.serie, a.numero].join('|'),
            y = [z.emisor_ruc, z.serie, z.numero].join('|');
        return x < y ? -1 : x > y ? 1 : 0;
    });
    return filas.map(function (f) {
        var p = proveedor[f.emisor_ruc];
        var c = conteo[f.emisor_ruc] || { n: 0, conOc: 0 };
        var quien = '';
        if (p) {
            var mas = 0;
            Object.keys(p.quien).forEach(function (k) {
                if (p.quien[k] > mas) {
                    mas = p.quien[k];
                    quien = k;
                }
            });
        }
        return {
            senal: f.sin_oc_senal,
            razon: f.sin_oc_razon || '',
            area_probable: f.area_probable || '',
            comprador_probable: quien ? quien.split('\u0001')[1] : '',
            fecha_emision: f.fecha_emision,
            proveedor_ruc: f.emisor_ruc,
            proveedor_nombre: f.emisor_nombre || (f.emisor && f.emisor.razon_social) || '',
            serie: f.serie,
            numero: f.numero,
            moneda: f.moneda,
            total: f.total,
            facturas_del_proveedor: c.n,
            con_oc_del_proveedor: c.conOc,
            ocs_del_proveedor: p ? Object.keys(p.ocs).sort().join(', ') : '',
            enlace_pdf: f.pdf_drive_id ? 'https://drive.google.com/file/d/' + f.pdf_drive_id + '/view?usp=drivesdk' : null,
        };
    });
}
