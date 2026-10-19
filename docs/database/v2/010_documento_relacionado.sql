-- ════════════════════════════════════════════════════════════════
-- 010 · EL DOCUMENTO RELACIONADO DEL XML
--
-- guardar_cpe (004) metía el «documento relacionado» del XML en
-- modifica_tipo / modifica_serie / modifica_numero. Pero el lector
-- (src/shared/lib/sunat/cpe-xml.ts) lo saca de AdditionalDocumentReference:
-- es el anticipo que se descuenta (DocumentType = 'ANTICIPO'), no la factura
-- que modifica una nota. 'ANTICIPO' no cabe en modifica_tipo char(2), así que
-- el lote entero fallaba (166 comprobantes en la base vieja, 19/10/2026), y
-- de caber, habría pisado la nota.
--
-- Ahora va en sus propias columnas (la hoja DETALLE lo muestra, ver
-- src/shared/lib/export/items-sunat.ts). A qué comprobante modifica una nota
-- lo sigue diciendo el SIRE (guardar_comprobantes_sunat).
--
-- Se puede correr dos veces: `add column if not exists` y `create or replace`.
-- ════════════════════════════════════════════════════════════════

alter table comprobante
  add column if not exists documento_relacionado      text,   -- E001-2216
  add column if not exists documento_relacionado_tipo text;   -- ANTICIPO…

create or replace function guardar_cpe(p_empresa_ruc text, p_docs jsonb)
returns table (nuevos integer, actualizados integer, items integer)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  drop table if exists _d;
  create temp table _d on commit drop as
  select distinct on (emisor, tipo, serie, numero) *
  from (
    select e->>'origen'                                   origen,
           coalesce(nullif(e->>'proveedorRuc', ''), '0')   emisor,
           nullif(e->>'proveedorNombre', '')               emisor_nombre,
           nullif(nullif(e->>'adquirienteRuc', ''), '-')   receptor,
           nullif(e->>'adquirienteNombre', '')             receptor_nombre,
           e->>'tipoComprobante'                           tipo,
           upper(e->>'serie')                              serie,
           ltrim(e->>'numero', '0')                        numero,
           nullif(e->>'fechaEmision', '')::date            fecha,
           moneda_valida(e->>'moneda')                     moneda,
           nullif(e->>'subtotal', '')::numeric             subtotal,
           nullif(e->>'igv', '')::numeric                  igv,
           nullif(e->>'total', '')::numeric                total,
           nullif(e->>'anticipoAplicado', '')::numeric     anticipo,
           nullif(e->>'tipoCambio', '')::numeric           tipo_cambio,
           drive_id_de(e->>'xmlDriveUrl')                  xml_id,
           drive_id_de(e->>'pdfDriveUrl')                  pdf_id,
           nullif(e->>'formaPago', '')                     forma_pago,
           nullif(e->>'guiaRemision', '')                  guia,
           nullif(e->>'ordenCompra', '')                   oc,
           nullif(e->>'detraccionCodigoBienServicio', '')  det_codigo,
           nullif(e->>'detraccionPorcentaje', '')::numeric det_pct,
           nullif(e->>'detraccionMonto', '')::numeric      det_monto,
           nullif(e->>'detraccionCuentaBanco', '')         det_cuenta,
           nullif(trim(e->>'documentoRelacionado'), '')    rel_doc,
           nullif(trim(e->>'tipoDocumentoRelacionado'), '') rel_tipo,
           coalesce(e->'items', '[]')                      items_json,
           coalesce(e->'cuotas', '[]')                     cuotas_json
    from jsonb_array_elements(p_docs) e
    where coalesce(e->>'serie', '') <> '' and coalesce(e->>'numero', '') <> ''
      and e->>'tipoComprobante' ~ '^\d{2}$' and e->>'origen' in ('RECIBIDO', 'EMITIDO')
  ) x
  order by emisor, tipo, serie, numero;

  -- 1. Emisores y receptores.
  insert into contribuyente as c (ruc, tipo_documento, razon_social, ssco)
  select distinct on (r.ruc) r.ruc, tipo_documento_de(r.ruc), r.nombre,
         exists (select 1 from lista_ssco l where l.ruc = r.ruc)
  from (select d.emisor ruc, d.emisor_nombre nombre from _d d
        union all select d.receptor, d.receptor_nombre from _d d where d.receptor is not null) r
  order by r.ruc, r.nombre nulls last
  on conflict (ruc) do update set razon_social = coalesce(c.razon_social, excluded.razon_social);

  -- 2. El comprobante, con lo que dice el XML. modifica_* no se toca: es del SIRE.
  drop table if exists _k;
  create temp table _k on commit drop as
  with up as (
    insert into comprobante as k (
      empresa_ruc, origen, emisor_ruc, receptor_ruc, tipo, serie, numero, fecha_emision, moneda,
      subtotal, igv, total, anticipo_aplicado, tipo_cambio, forma_pago, guia_remision, orden_compra_xml,
      detraccion_codigo, detraccion_porcentaje, detraccion_monto, detraccion_cuenta,
      documento_relacionado, documento_relacionado_tipo,
      xml_estado, xml_drive_id, pdf_drive_id, xml_en, pdf_en)
    select p_empresa_ruc, origen, emisor, receptor, tipo, serie, numero, fecha, moneda,
           subtotal, igv, total, anticipo, tipo_cambio, forma_pago, guia, oc,
           det_codigo, det_pct, det_monto, det_cuenta, rel_doc, rel_tipo,
           'OK', xml_id, pdf_id, now(), case when pdf_id is not null then now() end
    from _d
    on conflict (empresa_ruc, emisor_ruc, tipo, serie, numero) do update set
      origen = excluded.origen, receptor_ruc = coalesce(excluded.receptor_ruc, k.receptor_ruc),
      fecha_emision = excluded.fecha_emision, moneda = excluded.moneda,
      subtotal = excluded.subtotal, igv = excluded.igv, total = excluded.total,
      anticipo_aplicado = excluded.anticipo_aplicado,
      tipo_cambio = coalesce(excluded.tipo_cambio, k.tipo_cambio),
      forma_pago = excluded.forma_pago, guia_remision = excluded.guia_remision,
      orden_compra_xml = excluded.orden_compra_xml,
      detraccion_codigo = excluded.detraccion_codigo, detraccion_porcentaje = excluded.detraccion_porcentaje,
      detraccion_monto = excluded.detraccion_monto, detraccion_cuenta = excluded.detraccion_cuenta,
      documento_relacionado = excluded.documento_relacionado,
      documento_relacionado_tipo = excluded.documento_relacionado_tipo,
      xml_estado = 'OK',
      xml_drive_id = coalesce(excluded.xml_drive_id, k.xml_drive_id),
      pdf_drive_id = coalesce(excluded.pdf_drive_id, k.pdf_drive_id),
      xml_en = coalesce(k.xml_en, now()),
      pdf_en = case when excluded.pdf_drive_id is not null and k.pdf_drive_id is null then now() else k.pdf_en end,
      descarga_error = null,
      actualizado_en = now()
    returning id, emisor_ruc, tipo, serie, numero, (xmax = 0) nuevo
  )
  select * from up;

  select count(*) filter (where nuevo), count(*) filter (where not nuevo)
    into nuevos, actualizados from _k;

  -- 3. Ítems y cuotas: se reemplazan enteros.
  delete from comprobante_item i using _k where i.comprobante_id = _k.id;
  delete from comprobante_cuota q using _k where q.comprobante_id = _k.id;

  insert into comprobante_item (comprobante_id, linea, descripcion, cantidad, unidad, precio_unitario, importe)
  select distinct on (k.id, coalesce((it->>'linea')::int, n::int))
         k.id, coalesce((it->>'linea')::int, n::int), nullif(it->>'descripcion', ''),
         nullif(it->>'cantidad', '')::numeric, nullif(it->>'unidad', ''),
         nullif(it->>'precioUnitario', '')::numeric, nullif(it->>'importe', '')::numeric
  from _d d
  join _k k on (k.emisor_ruc, k.tipo, k.serie, k.numero) = (d.emisor, d.tipo, d.serie, d.numero)
  cross join lateral jsonb_array_elements(d.items_json) with ordinality as t(it, n)
  order by k.id, coalesce((it->>'linea')::int, n::int);
  get diagnostics items = row_count;

  insert into comprobante_cuota (comprobante_id, numero, monto, fecha_vencimiento)
  select distinct on (k.id, (cu->>'numero')::int)
         k.id, (cu->>'numero')::int, nullif(cu->>'monto', '')::numeric, nullif(cu->>'fechaVencimiento', '')::date
  from _d d
  join _k k on (k.emisor_ruc, k.tipo, k.serie, k.numero) = (d.emisor, d.tipo, d.serie, d.numero)
  cross join lateral jsonb_array_elements(d.cuotas_json) cu
  where cu->>'numero' is not null
  order by k.id, (cu->>'numero')::int;

  return next;
end;
$$;

-- PostgREST ve las columnas nuevas sin esperar.
notify pgrst, 'reload schema';
