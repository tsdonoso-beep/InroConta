-- ════════════════════════════════════════════════════════════════
-- 004 · ESCRITURAS DE COMPROBANTES, RETENCIONES Y RUC
--
-- Sin funciones de lectura: la app (Next.js) y los scripts leen las tablas
-- directo con supabase-js. Las FK permiten traer lo relacionado en una sola
-- llamada (`.select('*, contribuyente(*), registro_compras(*)')`) y lo que
-- pase de 1000 filas se pagina con `.range()`. Agrupar y armar lo que muestra
-- cada pantalla es trabajo de Next.js (o del script que publica el libro).
--
-- Funciones solo donde hacen falta, que es cuando una escritura:
--   1. toca varias tablas y tiene que quedar todo o nada (una transacción;
--      supabase-js no puede abrir una), o
--   2. tiene que protegerse de un archivo malo (p. ej. una lista cortada), o
--   3. solo debe ACTUALIZAR lo que ya existe (un upsert intenta insertar, y
--      Postgres revisa las columnas obligatorias antes de ver si ya existía).
-- Lo demás es `.upsert()` / `.insert()` directo desde el script:
--
--   padrón y ficha del RUC  → upsert en contribuyente (solo sus columnas)
--   domicilio fiscal        → upsert en contribuyente (solo sus columnas)
--   corridas y cambios      → insert en corrida / cambio
--
-- Las de OC (fuentes, carpetas, legajo, cálculos) están en 005.
--
-- Todas: una sentencia por tabla, sin bucles fila por fila; solo para
-- service_role (los servidores, ver 009). Reciben el mismo JSON que hoy
-- mandan los scripts, para que cambiarlos sea mínimo.
-- ════════════════════════════════════════════════════════════════

-- Tipo de documento SUNAT (catálogo 06) a partir del número.
create function tipo_documento_de(p_numero text) returns char(1)
language sql immutable set search_path = public, pg_temp as $$
  select case when p_numero ~ '^\d{11}$' then '6'
              when p_numero ~ '^\d{8}$'  then '1'
              else '0' end
$$;

-- Una moneda ISO (PEN, USD…) o null: el SIRE trajo una vez «12.58» en una
-- línea mal leída, y eso no puede tumbar el lote entero.
create function moneda_valida(p text) returns char(3)
language sql immutable set search_path = public, pg_temp as $$
  select case when upper(trim(p)) ~ '^[A-Z]{3}$' then upper(trim(p)) end
$$;

-- El id de un archivo de Drive a partir de su enlace (o el id tal cual).
create function drive_id_de(p text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(substring(p from '/d/([\w-]+)'), substring(p from '[?&]id=([\w-]+)'), nullif(p, ''))
$$;

-- ── Registro de Compras (SIRE) ──────────────────────────────────
-- Lo llama sunat-diario.mts con las filas de un período, como hoy.
-- Guarda en orden: contribuyente → comprobante → registro_compras, y anota
-- en `cambio` el estado o el total que llegó distinto del mismo mes.
-- Los impuestos no se anotan como cambio (como hoy: llenarlos por primera
-- vez marcaría miles de cambios falsos).

create function guardar_comprobantes_sunat(p_empresa_ruc text, p_periodo text, p_filas jsonb)
returns table (nuevos integer, cambiados integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_periodo integer := p_periodo::integer;
begin
  drop table if exists _f;
  create temp table _f on commit drop as
  select distinct on (llave) *
  from (
    select coalesce(nullif(trim(e->>'carSunat'), ''),
                    concat_ws('|', coalesce(nullif(e->>'ruc', ''), '0'), e->>'tipoComprobante',
                              upper(e->>'serie'), ltrim(e->>'numero', '0'))) llave,
           nullif(trim(e->>'carSunat'), '')            car,
           coalesce(nullif(e->>'ruc', ''), '0')        ruc,
           nullif(e->>'razonSocial', '')               razon_social,
           e->>'tipoComprobante'                       tipo,
           upper(e->>'serie')                          serie,
           ltrim(e->>'numero', '0')                    numero,
           nullif(e->>'fechaEmision', '')::date        fecha,
           nullif(e->>'total', '')::numeric(14,2)      total,
           moneda_valida(e->>'moneda')                 moneda,
           nullif(trim(e->>'estado'), '')              estado,
           nullif(e->>'tipoNota', '')                  tipo_nota,
           nullif(e#>>'{modifica,tipo}', '')           m_tipo,
           upper(nullif(e#>>'{modifica,serie}', ''))   m_serie,
           ltrim(nullif(e#>>'{modifica,numero}', ''), '0') m_numero,
           nullif(e#>>'{modifica,fechaEmision}', '')::date m_fecha,
           nullif(e#>>'{impuestos,baseDg}', '')::numeric   base_dg,
           nullif(e#>>'{impuestos,igvDg}', '')::numeric    igv_dg,
           nullif(e#>>'{impuestos,baseDgng}', '')::numeric base_dgng,
           nullif(e#>>'{impuestos,igvDgng}', '')::numeric  igv_dgng,
           nullif(e#>>'{impuestos,baseDng}', '')::numeric  base_dng,
           nullif(e#>>'{impuestos,igvDng}', '')::numeric   igv_dng,
           nullif(e->>'detraccion', '')::numeric       detraccion,
           nullif(e->>'tipoCambio', '')::numeric       tipo_cambio
    from jsonb_array_elements(p_filas) e
    where coalesce(e->>'serie', '') <> '' and coalesce(e->>'numero', '') <> ''
      and e->>'tipoComprobante' ~ '^\d{2}$'
  ) x
  order by llave;

  -- 1. Los RUC (y la empresa, que es el receptor). En las DUA y DAM (50-54)
  --    el SIRE pone «0» o el código de 8 dígitos del proveedor extranjero:
  --    no es un DNI, es «otro documento».
  insert into contribuyente as c (ruc, tipo_documento, razon_social, ssco)
  select distinct on (r.ruc) r.ruc, r.tipo_documento, r.razon_social,
         exists (select 1 from lista_ssco l where l.ruc = r.ruc)
  from (select f.ruc, f.razon_social,
               case when f.tipo between '50' and '54' and f.ruc !~ '^\d{11}$' then '0'
                    else tipo_documento_de(f.ruc) end tipo_documento
        from _f f
        union all select e.ruc, e.razon_social, '6' from empresa e where e.ruc = p_empresa_ruc) r
  order by r.ruc, r.razon_social nulls last
  on conflict (ruc) do update set razon_social = coalesce(c.razon_social, excluded.razon_social);

  -- 2. El comprobante: solo lo que es del documento (fecha, moneda, a qué
  --    nota modifica), sin pisar lo que ya trajo el XML. El total NO: el del
  --    comprobante sale del XML; lo declarado en cada mes vive en
  --    registro_compras (en una DUA cambia de un mes a otro).
  insert into comprobante as k (empresa_ruc, origen, emisor_ruc, receptor_ruc, tipo, serie, numero,
                                fecha_emision, moneda, tipo_cambio, tipo_nota,
                                modifica_tipo, modifica_serie, modifica_numero, modifica_fecha, xml_estado)
  select distinct on (ruc, tipo, serie, numero)
         p_empresa_ruc, 'RECIBIDO', ruc, p_empresa_ruc, tipo, serie, numero,
         fecha, moneda, tipo_cambio, tipo_nota, m_tipo, m_serie, m_numero, m_fecha,
         case when tipo in ('01', '03', '07', '08') and ruc <> '0' then 'PENDIENTE' else 'NO_APLICA' end
  from _f
  order by ruc, tipo, serie, numero
  on conflict (empresa_ruc, emisor_ruc, tipo, serie, numero) do update set
    fecha_emision   = coalesce(k.fecha_emision, excluded.fecha_emision),
    moneda          = coalesce(k.moneda, excluded.moneda),
    tipo_cambio     = coalesce(k.tipo_cambio, excluded.tipo_cambio),
    tipo_nota       = coalesce(k.tipo_nota, excluded.tipo_nota),
    modifica_tipo   = coalesce(k.modifica_tipo, excluded.modifica_tipo),
    modifica_serie  = coalesce(k.modifica_serie, excluded.modifica_serie),
    modifica_numero = coalesce(k.modifica_numero, excluded.modifica_numero),
    modifica_fecha  = coalesce(k.modifica_fecha, excluded.modifica_fecha),
    actualizado_en  = now();

  -- 3. Lo que cambió desde la consulta anterior del MISMO mes.
  insert into cambio (entidad, clave, tipo, campo, antes, despues)
  select 'registro_compras', v_periodo || '|' || f.llave, 'CAMBIO', x.campo, x.antes, x.despues
  from _f f
  join registro_compras r on r.empresa_ruc = p_empresa_ruc and r.periodo = v_periodo and r.llave = f.llave
  cross join lateral (values ('estado', r.estado, f.estado),
                             ('total',  r.total::text, f.total::text)) x(campo, antes, despues)
  where x.antes is distinct from x.despues;
  get diagnostics cambiados = row_count;

  -- 4. La línea del registro.
  with up as (
    insert into registro_compras as r (empresa_ruc, periodo, llave, car_sunat, comprobante_id, estado, total,
                                       tipo_cambio, base_dg, igv_dg, base_dgng, igv_dgng, base_dng, igv_dng, detraccion)
    select p_empresa_ruc, v_periodo, f.llave, f.car, k.id, f.estado, f.total, f.tipo_cambio,
           f.base_dg, f.igv_dg, f.base_dgng, f.igv_dgng, f.base_dng, f.igv_dng, f.detraccion
    from _f f
    join comprobante k on k.empresa_ruc = p_empresa_ruc and k.emisor_ruc = f.ruc
                      and k.tipo = f.tipo and k.serie = f.serie and k.numero = f.numero
    on conflict (empresa_ruc, periodo, llave) do update set
      estado = excluded.estado, total = excluded.total, tipo_cambio = excluded.tipo_cambio,
      base_dg = excluded.base_dg, igv_dg = excluded.igv_dg, base_dgng = excluded.base_dgng,
      igv_dgng = excluded.igv_dgng, base_dng = excluded.base_dng, igv_dng = excluded.igv_dng,
      detraccion = excluded.detraccion, ultima_vez = now()
    returning (xmax = 0) nuevo
  )
  select count(*) filter (where nuevo) into nuevos from up;

  return next;
end;
$$;

-- ── XML de comprobantes ─────────────────────────────────────────
-- Lo llaman descargar-cpe.mts, consultar-cpe-individual.mts, el pipeline
-- local y OrdenarCPE.gs, con el mismo JSON que hoy (uno por XML, con sus
-- ítems y cuotas). Nuevo y opcional: `tipoCambio` (para los montos en soles).
-- El comprobante queda con xml_estado = OK; ítems y cuotas se reemplazan
-- enteros (la verdad es el XML recién leído). Los enlaces no se pisan con vacío.

create function guardar_cpe(p_empresa_ruc text, p_docs jsonb)
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
           nullif(e->>'tipoDocumentoRelacionado', '')      m_tipo,
           upper(nullif(split_part(e->>'documentoRelacionado', '-', 1), '')) m_serie,
           ltrim(nullif(split_part(e->>'documentoRelacionado', '-', 2), ''), '0') m_numero,
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

  -- 2. El comprobante, con lo que dice el XML.
  drop table if exists _k;
  create temp table _k on commit drop as
  with up as (
    insert into comprobante as k (
      empresa_ruc, origen, emisor_ruc, receptor_ruc, tipo, serie, numero, fecha_emision, moneda,
      subtotal, igv, total, anticipo_aplicado, tipo_cambio, forma_pago, guia_remision, orden_compra_xml,
      detraccion_codigo, detraccion_porcentaje, detraccion_monto, detraccion_cuenta,
      modifica_tipo, modifica_serie, modifica_numero,
      xml_estado, xml_drive_id, pdf_drive_id, xml_en, pdf_en)
    select p_empresa_ruc, origen, emisor, receptor, tipo, serie, numero, fecha, moneda,
           subtotal, igv, total, anticipo, tipo_cambio, forma_pago, guia, oc,
           det_codigo, det_pct, det_monto, det_cuenta, m_tipo, m_serie, m_numero,
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
      modifica_tipo   = coalesce(excluded.modifica_tipo, k.modifica_tipo),
      modifica_serie  = coalesce(excluded.modifica_serie, k.modifica_serie),
      modifica_numero = coalesce(excluded.modifica_numero, k.modifica_numero),
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

-- ── Comprobantes de retención (CRE) ─────────────────────────────
-- Lo llama scripts/local/retenciones/guardar.mts con el mismo JSON que hoy:
-- [{sentido, emisorRuc, serie, numero, fechaEmision, receptorRuc, receptorNombre,
--   regimen, montoRetenido, montoPagado, montoBase, estado, fechaReversion,
--   motivoReversion, periodo, ticket, pdfDriveUrl, xmlDriveUrl,
--   documentos: [{tipoComprobante, serie, numero, numeroPago, fechaPago, montoPago,
--                 monedaPago, montoRetenido, fechaRetencion, montoPagado, tipoCambio}]}]
-- Un CRE que se revierte cambia de estado y la corrida siguiente lo
-- actualiza. Las facturas de cada CRE se reescriben (así una corrida cortada
-- no deja restos). Los enlaces de Drive no se pisan con vacío.
-- retenciones_guardadas() desaparece: el script lee la tabla directo.

create function guardar_retenciones(p_empresa_ruc text, p_filas jsonb)
returns table (nuevos integer, actualizados integer)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  drop table if exists _r;
  create temp table _r on commit drop as
  select distinct on (emisor, serie, numero) *
  from (
    select f->>'sentido' sentido, f->>'emisorRuc' emisor, upper(f->>'serie') serie, (f->>'numero')::integer numero,
           nullif(f->>'fechaEmision', '')::date fecha, nullif(f->>'receptorRuc', '') receptor,
           nullif(f->>'receptorNombre', '') receptor_nombre, nullif(f->>'regimen', '') regimen,
           nullif(f->>'montoRetenido', '')::numeric retenido, nullif(f->>'montoPagado', '')::numeric pagado,
           nullif(f->>'montoBase', '')::numeric base, f->>'estado' estado,
           nullif(f->>'fechaReversion', '')::date fecha_reversion, nullif(f->>'motivoReversion', '') motivo,
           nullif(f->>'periodo', '')::integer periodo, nullif(f->>'ticket', '') ticket,
           drive_id_de(f->>'pdfDriveUrl') pdf_id, drive_id_de(f->>'xmlDriveUrl') xml_id,
           coalesce(f->'documentos', '[]') documentos
    from jsonb_array_elements(p_filas) f
    where f->>'sentido' in ('COMPRA', 'VENTA') and f->>'estado' in ('EMITIDO', 'REVERTIDO')
      and coalesce(f->>'serie', '') <> '' and coalesce(f->>'numero', '') ~ '^\d+$'
      and coalesce(f->>'emisorRuc', '') <> ''
  ) x
  order by emisor, serie, numero;

  -- 1. Emisor y receptor.
  insert into contribuyente as c (ruc, tipo_documento, razon_social, ssco)
  select distinct on (r.ruc) r.ruc, tipo_documento_de(r.ruc), r.nombre,
         exists (select 1 from lista_ssco l where l.ruc = r.ruc)
  from (select emisor ruc, null::text nombre from _r
        union all select receptor, receptor_nombre from _r where receptor is not null) r
  order by r.ruc, r.nombre nulls last
  on conflict (ruc) do update set razon_social = coalesce(c.razon_social, excluded.razon_social);

  -- 2. El CRE.
  drop table if exists _rc;
  create temp table _rc on commit drop as
  with up as (
    insert into retencion_comprobante as c (empresa_ruc, sentido, emisor_ruc, receptor_ruc, serie, numero,
      fecha_emision, periodo, regimen, monto_base, monto_retenido, monto_pagado, estado, fecha_reversion,
      motivo_reversion, ticket, pdf_drive_id, xml_drive_id)
    select p_empresa_ruc, sentido, emisor, receptor, serie, numero, fecha, periodo, regimen, base, retenido,
           pagado, estado, fecha_reversion, motivo, ticket, pdf_id, xml_id
    from _r
    on conflict (empresa_ruc, emisor_ruc, serie, numero) do update set
      sentido = excluded.sentido, receptor_ruc = excluded.receptor_ruc, fecha_emision = excluded.fecha_emision,
      periodo = excluded.periodo, regimen = excluded.regimen, monto_base = excluded.monto_base,
      monto_retenido = excluded.monto_retenido, monto_pagado = excluded.monto_pagado, estado = excluded.estado,
      fecha_reversion = excluded.fecha_reversion,
      motivo_reversion = coalesce(excluded.motivo_reversion, c.motivo_reversion),
      ticket = coalesce(excluded.ticket, c.ticket),
      pdf_drive_id = coalesce(excluded.pdf_drive_id, c.pdf_drive_id),
      xml_drive_id = coalesce(excluded.xml_drive_id, c.xml_drive_id),
      ultima_vez = now()
    returning id, emisor_ruc, serie, numero, receptor_ruc, sentido, (xmax = 0) nuevo
  )
  select * from up;

  select count(*) filter (where nuevo), count(*) filter (where not nuevo) into nuevos, actualizados from _rc;

  -- 3. Sus facturas: se reescriben las de los CRE que traen documentos.
  delete from retencion_documento d
   using _rc join _r on (_r.emisor, _r.serie, _r.numero) = (_rc.emisor_ruc, _rc.serie, _rc.numero)
   where d.retencion_id = _rc.id and jsonb_array_length(_r.documentos) > 0;

  insert into retencion_documento (retencion_id, tipo, serie, numero, numero_pago, comprobante_id, fecha_pago,
    monto_pago, moneda_pago, monto_retenido, fecha_retencion, monto_pagado, tipo_cambio)
  select distinct on (_rc.id, d->>'tipoComprobante', upper(d->>'serie'), ltrim(d->>'numero', '0'),
                      coalesce(nullif(btrim(d->>'numeroPago'), ''), '1'))
         _rc.id, d->>'tipoComprobante', upper(d->>'serie'), ltrim(d->>'numero', '0'),
         coalesce(nullif(btrim(d->>'numeroPago'), ''), '1'),
         -- La factura es del proveedor: en una COMPRA, el receptor del CRE; en una VENTA, nosotros.
         (select k.id from comprobante k
           where k.empresa_ruc = p_empresa_ruc
             and k.emisor_ruc = case when _rc.sentido = 'COMPRA' then _rc.receptor_ruc else p_empresa_ruc end
             and k.tipo = d->>'tipoComprobante' and k.serie = upper(d->>'serie')
             and k.numero = ltrim(d->>'numero', '0')),
         nullif(d->>'fechaPago', '')::date, nullif(d->>'montoPago', '')::numeric, nullif(d->>'monedaPago', ''),
         nullif(d->>'montoRetenido', '')::numeric, nullif(d->>'fechaRetencion', '')::date,
         nullif(d->>'montoPagado', '')::numeric, nullif(d->>'tipoCambio', '')::numeric
  from _rc
  join _r on (_r.emisor, _r.serie, _r.numero) = (_rc.emisor_ruc, _rc.serie, _rc.numero)
  cross join lateral jsonb_array_elements(_r.documentos) d
  where coalesce(d->>'serie', '') <> '' and coalesce(d->>'numero', '') <> ''
  order by _rc.id, d->>'tipoComprobante', upper(d->>'serie'), ltrim(d->>'numero', '0'),
           coalesce(nullif(btrim(d->>'numeroPago'), ''), '1');

  return next;
end;
$$;

-- ── Constancias de detracción (SPOT) ────────────────────────────
-- Lo llama scripts/local/detracciones/guardar.mts con el mismo JSON que hoy
-- (numeroConstancia, sentido, proveedorRuc, proveedorNombre, adquirienteTipoDoc,
-- adquirienteNumero, adquirienteNombre, tipoComprobante, serie, numero, …,
-- pdfDriveUrl, htmlDriveUrl). Crea a proveedor y adquiriente en
-- contribuyente, une la constancia con su factura si ya está y no pisa los
-- enlaces con vacío. detracciones_guardadas() desaparece: se lee la tabla.

create function guardar_detracciones(p_empresa_ruc text, p_filas jsonb)
returns table (nuevos integer, actualizados integer)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  drop table if exists _t;
  create temp table _t on commit drop as
  select distinct on (f->>'numeroConstancia')
         f->>'numeroConstancia' constancia, f->>'sentido' sentido,
         nullif(f->>'proveedorRuc', '') emisor, nullif(f->>'proveedorNombre', '') emisor_nombre,
         nullif(f->>'adquirienteNumero', '') adquiriente, nullif(f->>'adquirienteNombre', '') adquiriente_nombre,
         nullif(f->>'adquirienteTipoDoc', '') adquiriente_tipo_doc,
         nullif(f->>'tipoComprobante', '') tipo, nullif(upper(f->>'serie'), '') serie,
         nullif(ltrim(f->>'numero', '0'), '') numero, f
  from jsonb_array_elements(p_filas) f
  where coalesce(f->>'numeroConstancia', '') <> '' and f->>'sentido' in ('COMPRA', 'VENTA')
  order by f->>'numeroConstancia';

  -- 1. Proveedor y adquiriente.
  insert into contribuyente as c (ruc, tipo_documento, razon_social, ssco)
  select distinct on (r.ruc) r.ruc, r.tipo_documento, r.nombre,
         exists (select 1 from lista_ssco l where l.ruc = r.ruc)
  from (select emisor ruc, tipo_documento_de(emisor) tipo_documento, emisor_nombre nombre from _t where emisor is not null
        union all
        select adquiriente, case when adquiriente_tipo_doc in ('0','1','4','6','7','A') and
                                      (adquiriente_tipo_doc <> '6' or adquiriente ~ '^\d{11}$')
                                 then adquiriente_tipo_doc else tipo_documento_de(adquiriente) end,
               adquiriente_nombre
          from _t where adquiriente is not null) r
  order by r.ruc, r.nombre nulls last
  on conflict (ruc) do update set razon_social = coalesce(c.razon_social, excluded.razon_social);

  -- 2. La constancia, unida a su factura si ya está (en COMPRA la emite el
  --    proveedor; en VENTA, nosotros).
  with up as (
    insert into detraccion_constancia as d (numero_constancia, empresa_ruc, sentido, comprobante_id,
      emisor_ruc, tipo, serie, numero, adquiriente_ruc, tipo_cuenta, numero_cuenta, fecha_pago, fecha_hora_pago,
      periodo, tipo_operacion, codigo_bien_servicio, monto, numero_operacion, numero_pago_detracciones,
      origen, usuario_sol, tipo_consulta, pdf_drive_id, html_drive_id)
    select t.constancia, p_empresa_ruc, t.sentido,
           (select k.id from comprobante k
             where k.empresa_ruc = p_empresa_ruc and k.emisor_ruc = coalesce(t.emisor, p_empresa_ruc)
               and k.tipo = t.tipo and k.serie = t.serie and k.numero = t.numero),
           t.emisor, t.tipo, t.serie, t.numero, t.adquiriente,
           nullif(f->>'tipoCuenta', ''), nullif(f->>'numeroCuenta', ''),
           nullif(f->>'fechaPago', '')::date, nullif(f->>'fechaHoraPago', '')::timestamptz,
           nullif(f->>'periodo', '')::integer, nullif(f->>'tipoOperacion', ''), nullif(f->>'codigoBienServicio', ''),
           nullif(f->>'monto', '')::numeric, nullif(f->>'numeroOperacion', ''),
           nullif(btrim(f->>'numeroPagoDetracciones'), ''), nullif(f->>'origen', ''), nullif(f->>'usuarioSol', ''),
           nullif(f->>'tipoConsulta', ''), drive_id_de(f->>'pdfDriveUrl'), drive_id_de(f->>'htmlDriveUrl')
    from _t t
    on conflict (numero_constancia) do update set
      sentido = excluded.sentido, comprobante_id = coalesce(excluded.comprobante_id, d.comprobante_id),
      emisor_ruc = excluded.emisor_ruc, tipo = excluded.tipo, serie = excluded.serie, numero = excluded.numero,
      adquiriente_ruc = excluded.adquiriente_ruc, tipo_cuenta = excluded.tipo_cuenta,
      numero_cuenta = excluded.numero_cuenta, fecha_pago = excluded.fecha_pago,
      fecha_hora_pago = coalesce(excluded.fecha_hora_pago, d.fecha_hora_pago), periodo = excluded.periodo,
      tipo_operacion = excluded.tipo_operacion, codigo_bien_servicio = excluded.codigo_bien_servicio,
      monto = excluded.monto, numero_operacion = excluded.numero_operacion,
      numero_pago_detracciones = excluded.numero_pago_detracciones, origen = excluded.origen,
      usuario_sol = coalesce(excluded.usuario_sol, d.usuario_sol), tipo_consulta = excluded.tipo_consulta,
      pdf_drive_id = coalesce(excluded.pdf_drive_id, d.pdf_drive_id),
      html_drive_id = coalesce(excluded.html_drive_id, d.html_drive_id),
      ultima_vez = now()
    returning (xmax = 0) nuevo
  )
  select count(*) filter (where nuevo), count(*) filter (where not nuevo) into nuevos, actualizados from up;

  -- 3. Las constancias guardadas antes que su factura: se unen ahora si ya llegó.
  update detraccion_constancia d set comprobante_id = k.id
    from comprobante k
   where d.empresa_ruc = p_empresa_ruc and d.comprobante_id is null
     and k.empresa_ruc = d.empresa_ruc
     and k.emisor_ruc = coalesce(d.emisor_ruc, p_empresa_ruc)
     and k.tipo = d.tipo and k.serie = d.serie and k.numero = d.numero;

  return next;
end;
$$;

-- ── Descargas de XML y PDF que no salieron ──────────────────────
-- Lo que hoy queda en el archivo local cpe-no-existe.jsonl de la laptop:
-- el pipeline de CPE avisa aquí qué no pudo bajar, para que la próxima
-- corrida (en cualquier máquina) no lo vuelva a pedir o lo reintente.
-- p_filas: [{emisor_ruc, tipo, serie, numero, estado: 'NO_EXISTE'|'ERROR', error}]
-- Lo bajado bien no pasa por aquí: lo marca guardar_cpe (xml_estado = OK).

create function marcar_descargas_cpe(p_empresa_ruc text, p_filas jsonb)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  update comprobante k set
    xml_estado = f->>'estado',
    descarga_error = nullif(f->>'error', ''),
    descarga_intentos = k.descarga_intentos + 1,
    descarga_ultimo_intento = now()
  from jsonb_array_elements(p_filas) f
  where f->>'estado' in ('NO_EXISTE', 'ERROR')
    and k.xml_estado <> 'OK'                      -- lo ya bajado no retrocede
    and k.empresa_ruc = p_empresa_ruc and k.emisor_ruc = f->>'emisor_ruc'
    and k.tipo = f->>'tipo' and k.serie = upper(f->>'serie') and k.numero = ltrim(f->>'numero', '0');
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ── Lista SSCO ──────────────────────────────────────────────────
-- Lo llama load-ssco-db.mts con el Excel de SUNAT, como hoy. Reemplaza la
-- lista entera y, en la misma transacción, marca contribuyente.ssco.
-- Rechaza una lista con menos de la mitad de los RUC ya cargados: es un
-- archivo cortado, no SUNAT sacando media lista.

create function load_ssco(p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_nuevos   integer;
  v_antes    integer;
  v_quitados integer;
  v_cargados integer;
  v_marcados integer;
begin
  select count(distinct e->>'ruc') into v_nuevos from jsonb_array_elements(p_rows) e where e->>'ruc' ~ '^\d{11}$';
  select count(*) into v_antes from lista_ssco;
  if v_nuevos = 0 or v_nuevos < v_antes / 2.0 then
    raise exception 'La lista nueva trae % RUC y la cargada tiene %: no se reemplaza (¿archivo incompleto?).', v_nuevos, v_antes;
  end if;

  delete from lista_ssco l
   where not exists (select 1 from jsonb_array_elements(p_rows) e where e->>'ruc' = l.ruc);
  get diagnostics v_quitados = row_count;

  insert into lista_ssco as l (ruc, razon_social, domicilio, resolucion, resolucion_fecha, firme_desde,
                               publicado_el, representante_documento, representante_nombre, cargado_en)
  select distinct on (e->>'ruc')
         e->>'ruc', e->>'businessName', nullif(e->>'taxAddress', ''), e->>'resolution',
         nullif(e->>'resolutionDate', '')::date, nullif(e->>'finalDate', '')::date,
         nullif(e->>'publishedOn', '')::date, nullif(e->>'representativeDocument', ''),
         nullif(e->>'representativeName', ''), now()
  from jsonb_array_elements(p_rows) e
  where e->>'ruc' ~ '^\d{11}$'
  order by e->>'ruc', nullif(e->>'publishedOn', '')::date desc nulls last
  on conflict (ruc) do update set
    razon_social = excluded.razon_social, domicilio = excluded.domicilio, resolucion = excluded.resolucion,
    resolucion_fecha = excluded.resolucion_fecha, firme_desde = excluded.firme_desde,
    publicado_el = excluded.publicado_el, representante_documento = excluded.representante_documento,
    representante_nombre = excluded.representante_nombre, cargado_en = excluded.cargado_en;
  get diagnostics v_cargados = row_count;

  update contribuyente c
     set ssco = exists (select 1 from lista_ssco l where l.ruc = c.ruc)
   where c.ssco is distinct from exists (select 1 from lista_ssco l where l.ruc = c.ruc);
  get diagnostics v_marcados = row_count;

  return jsonb_build_object('loaded', v_cargados, 'removed', v_quitados, 'flagsChanged', v_marcados);
end;
$$;
