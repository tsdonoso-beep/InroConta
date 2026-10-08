-- Las pestañas DETRACCIONES y DETRACCIONES SIN CONSTANCIA, para rastrear los casos atípicos
--
-- La constancia ya está en la hoja DETALLE (migración 066), pero ahí solo se
-- ven las de facturas con XML y del período de la hoja (desde 202601). La
-- primera carga (08/10/2026) trajo 634 constancias: 72 sin XML y depósitos de
-- facturas de 2025 pagados en 2026. Pedido del usuario el mismo día: tenerlas
-- además en pestañas propias, una fila por constancia, con el caso marcado.
--
-- detracciones_hoja(): una fila por constancia (TODAS), con su factura del SIRE
-- (compras) y del XML (compras y ventas), y la columna «caso», la primera que
-- calce de:
--   Revisar monto              lo depositado difiere en más de S/ 1 de la detracción
--                              de la factura (XML, o SIRE si no hay XML); SUNAT
--                              redondea el depósito a soles
--   Factura de AAAA            el período es anterior a p_desde (pago de un año anterior;
--                              «factura_en» dice si se la encontró)
--   Sin factura                no está ni en el SIRE ni en los XML
--   Sin XML                    está en el SIRE pero no hay XML (no sale en el DETALLE)
--   XML no declara detracción  hay XML y no trae la detracción
--   Pago 2+ meses después      se pagó dos meses o más después del período
--                              (lo normal: hasta el 5.° día hábil del mes siguiente
--                              a la anotación en el Registro de Compras)
--   Normal
--
-- detracciones_sin_constancia(): facturas con detracción (en el XML, o en el
-- SIRE si no hay XML) desde p_desde, de compra y de venta, sin constancia.

create or replace function detracciones_hoja(p_empresa_ruc text, p_desde text default '202601')
returns table (
  caso text, periodo text, sentido text, fecha_pago date, meses_hasta_pago integer, numero_constancia text,
  tipo_comprobante text, serie text, numero text, proveedor_ruc text, proveedor_nombre text,
  adquiriente_numero text, adquiriente_nombre text, codigo_bien_servicio text, monto numeric,
  detraccion_factura numeric, factura_en text, total_factura numeric, moneda text,
  numero_cuenta text, cuenta_xml text, numero_operacion text,
  pdf_constancia text, html_constancia text, pdf_factura text, fecha_hora_pago text
)
language sql
stable
security definer
set search_path = public, seguridad, pg_temp
as $$
  with b as (
    select d.*,
           s.id s_id, s.total s_total, s.moneda s_moneda, s.detraccion s_det,
           c.id c_id, c.total c_total, c.moneda c_moneda, c.detraccion_monto c_det,
           c.detraccion_cuenta_banco c_cuenta, c.pdf_drive_url c_pdf,
           case when d.periodo ~ '^\d{6}$' and d.fecha_pago is not null then
             (extract(year from d.fecha_pago)::int * 12 + extract(month from d.fecha_pago)::int)
             - (substr(d.periodo, 1, 4)::int * 12 + substr(d.periodo, 5, 2)::int)
           end meses
      from detraccion_constancia d
      left join lateral (
        select x.id, x.total, x.moneda, x.detraccion
          from comprobantes_sunat x
         where d.sentido = 'COMPRA' and x.empresa_ruc = d.empresa_ruc and x.proveedor_ruc = d.proveedor_ruc
           and x.tipo_comprobante = d.tipo_comprobante and upper(x.serie) = upper(d.serie)
           and numero_comparable(x.numero) = numero_comparable(d.numero)
         order by x.ultima_vez desc
         limit 1
      ) s on true
      left join lateral (
        select y.id, y.total, y.moneda, y.detraccion_monto, y.detraccion_cuenta_banco, y.pdf_drive_url
          from cpe_comprobante y
         where y.empresa_ruc = d.empresa_ruc and y.proveedor_ruc = d.proveedor_ruc
           and y.tipo_comprobante = d.tipo_comprobante and upper(y.serie) = upper(d.serie)
           and numero_comparable(y.numero) = numero_comparable(d.numero)
         limit 1
      ) c on true
     where d.empresa_ruc = p_empresa_ruc and (select seguridad.puede_ver_todo())
  )
  select case
           when coalesce(b.c_det, b.s_det) > 0 and abs(b.monto - coalesce(b.c_det, b.s_det)) > 1 then 'Revisar monto'
           when b.periodo < p_desde then 'Factura de ' || left(b.periodo, 4)
           when b.s_id is null and b.c_id is null then 'Sin factura'
           when b.c_id is null then 'Sin XML'
           when coalesce(b.c_det, 0) <= 0 then 'XML no declara detracción'
           when b.meses >= 2 then 'Pago 2+ meses después'
           else 'Normal'
         end,
         b.periodo, case b.sentido when 'COMPRA' then 'Compra' else 'Venta' end, b.fecha_pago, b.meses, b.numero_constancia,
         b.tipo_comprobante, b.serie, b.numero, b.proveedor_ruc, b.proveedor_nombre,
         b.adquiriente_numero, b.adquiriente_nombre, b.codigo_bien_servicio, b.monto,
         coalesce(b.c_det, b.s_det),
         case when b.s_id is not null and b.c_id is not null then 'SIRE y XML'
              when b.c_id is not null then 'XML'
              when b.s_id is not null then 'SIRE'
              else 'No encontrada' end,
         coalesce(b.c_total, b.s_total), coalesce(b.c_moneda, b.s_moneda),
         b.numero_cuenta, b.c_cuenta, b.numero_operacion,
         b.pdf_drive_url, b.html_drive_url, b.c_pdf,
         to_char(b.fecha_hora_pago at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI:SS')
    from b
   order by b.periodo desc, b.fecha_pago desc, b.numero_constancia;
$$;

create or replace function detracciones_sin_constancia(p_empresa_ruc text, p_desde text default '202601')
returns table (
  sentido text, periodo text, fecha_emision date, meses_desde_emision integer, ruc text, nombre text,
  tipo_comprobante text, serie text, numero text, total numeric, moneda text, detraccion numeric,
  detraccion_segun text, pdf_factura text
)
language sql
stable
security definer
set search_path = public, seguridad, pg_temp
as $$
  with xml as (
    select case when c.origen = 'EMITIDO' then 'Venta' else 'Compra' end sentido, c.periodo, c.fecha_emision,
           case when c.origen = 'EMITIDO' then c.adquiriente_ruc else c.proveedor_ruc end ruc,
           case when c.origen = 'EMITIDO' then c.adquiriente_nombre else c.proveedor_nombre end nombre,
           c.proveedor_ruc emisor, c.tipo_comprobante, c.serie, c.numero, c.total, c.moneda,
           c.detraccion_monto detraccion, 'XML' segun, c.pdf_drive_url pdf
      from cpe_comprobante c
     where c.empresa_ruc = p_empresa_ruc and c.origen in ('RECIBIDO', 'EMITIDO')
       and coalesce(c.detraccion_monto, 0) > 0 and c.periodo >= p_desde
  ),
  sire as (
    select distinct on (s.proveedor_ruc, s.tipo_comprobante, upper(s.serie), numero_comparable(s.numero))
           'Compra' sentido, s.periodo, s.fecha_emision, s.proveedor_ruc ruc, s.proveedor_nombre nombre,
           s.proveedor_ruc emisor, s.tipo_comprobante, s.serie, s.numero, s.total, s.moneda,
           s.detraccion, 'SIRE' segun, null::text pdf
      from comprobantes_sunat s
     where s.empresa_ruc = p_empresa_ruc and coalesce(s.detraccion, 0) > 0 and s.periodo >= p_desde
       and not exists (
         select 1 from cpe_comprobante c
          where c.empresa_ruc = s.empresa_ruc and c.proveedor_ruc = s.proveedor_ruc and c.tipo_comprobante = s.tipo_comprobante
            and upper(c.serie) = upper(s.serie) and numero_comparable(c.numero) = numero_comparable(s.numero)
       )
     order by s.proveedor_ruc, s.tipo_comprobante, upper(s.serie), numero_comparable(s.numero), s.ultima_vez desc
  ),
  f as (select * from xml union all select * from sire)
  select f.sentido, f.periodo, f.fecha_emision,
         case when f.fecha_emision is null then null else
           (extract(year from (now() at time zone 'America/Lima'))::int * 12 + extract(month from (now() at time zone 'America/Lima'))::int)
           - (extract(year from f.fecha_emision)::int * 12 + extract(month from f.fecha_emision)::int) end,
         f.ruc, f.nombre, f.tipo_comprobante, f.serie, f.numero, f.total, f.moneda, f.detraccion, f.segun, f.pdf
    from f
   where (select seguridad.puede_ver_todo())
     and not exists (
       select 1 from detraccion_constancia d
        where d.empresa_ruc = p_empresa_ruc and d.proveedor_ruc = f.emisor and d.tipo_comprobante = f.tipo_comprobante
          and upper(d.serie) = upper(f.serie) and numero_comparable(d.numero) = numero_comparable(f.numero)
     )
   order by f.periodo, f.fecha_emision, f.serie, f.numero, f.emisor, f.tipo_comprobante;
$$;

revoke execute on function detracciones_hoja(text, text) from public, anon;
grant execute on function detracciones_hoja(text, text) to authenticated;
revoke execute on function detracciones_sin_constancia(text, text) from public, anon;
grant execute on function detracciones_sin_constancia(text, text) to authenticated;
