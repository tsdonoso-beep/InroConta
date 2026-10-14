-- Los comprobantes de retención del IGV (CRE), al lado de las constancias de detracción
--
-- Pedido de Contabilidad (Franco, 14/10/2026): la retención de cada factura en el libro, «las mismas
-- columnas que has hecho para detracción»: el comprobante, la fecha de pago, el monto, el enlace a su
-- PDF y a su XML, y si fue emitido o revertido. Una factura tiene detracción o retención, no las dos.
--
-- INROPRIN es agente de retención desde el 01/09/2010 (R.S. 217-2010): al pagar a un proveedor le
-- retiene el 3 % y emite el CRE (serie E001, SEE-SOL). Los clientes no le retienen (consulta de
-- recibidos vacía, 14/10/2026), pero la tabla guarda el sentido por si eso cambia.
--
-- scripts/local/retenciones/retenciones.mts los baja de SOL («Consultar Emisión y Recepción», opción
-- 11.5.8 del menú de siempre, por la API de su página: buscarComprobanteEmiRec y
-- cargarDetalleComprobante), sube el PDF y el XML a Drive (Retenciones/Compras/AAAA-MM) y guarda aquí
-- una fila por CRE y una por cada factura que el CRE cubre. Es muchos a muchos: un CRE puede cubrir
-- varias facturas y una factura pagada en partes tiene varios CRE.
--
-- Un CRE se reconoce por su serie y número: repetir la corrida actualiza, no duplica. Un CRE que se
-- revierte cambia de estado (EMITIDO → REVERTIDO) y la corrida siguiente lo actualiza. Los enlaces de
-- Drive no se pisan con vacío.

begin;

create table if not exists retencion_comprobante (
  id                bigserial primary key,
  empresa_ruc       text not null,
  sentido           text not null check (sentido in ('COMPRA', 'VENTA')),
  serie             text not null,
  numero            integer not null,
  fecha_emision     date,
  emisor_ruc        text not null,
  receptor_ruc      text,
  receptor_nombre   text,
  regimen           text,
  monto_retenido    numeric(14, 2),
  monto_pagado      numeric(14, 2),
  monto_base        numeric(14, 2),
  estado            text not null check (estado in ('EMITIDO', 'REVERTIDO')),
  fecha_reversion   date,
  motivo_reversion  text,
  periodo           text,
  ticket            text,
  pdf_drive_url     text,
  xml_drive_url     text,
  primera_vez       timestamptz not null default now(),
  ultima_vez        timestamptz not null default now(),
  unique (empresa_ruc, emisor_ruc, serie, numero)
);

comment on table retencion_comprobante is
  'Comprobantes de retención del IGV (CRE) de «Consultar Emisión y Recepción» de SOL, con enlace a su PDF y XML en Drive. Los llena scripts/local/retenciones/retenciones.mts.';

create table if not exists retencion_documento (
  id                 bigserial primary key,
  empresa_ruc        text not null,
  emisor_ruc         text not null,
  cre_serie          text not null,
  cre_numero         integer not null,
  tipo_comprobante   text not null,
  serie              text not null,
  numero             text not null,
  fecha_emision      date,
  total              numeric(14, 2),
  moneda             text,
  numero_pago        text not null default '1',
  fecha_pago         date,
  monto_pago         numeric(14, 2),
  moneda_pago        text,
  monto_retenido     numeric(14, 2),
  fecha_retencion    date,
  monto_pagado       numeric(14, 2),
  tipo_cambio        numeric(12, 6),
  unique (empresa_ruc, emisor_ruc, cre_serie, cre_numero, tipo_comprobante, serie, numero, numero_pago),
  foreign key (empresa_ruc, emisor_ruc, cre_serie, cre_numero)
    references retencion_comprobante (empresa_ruc, emisor_ruc, serie, numero) on delete cascade
);

comment on table retencion_documento is
  'Cada factura (o nota de débito) que cubre un comprobante de retención, con su pago y lo retenido. Muchos a muchos con las facturas.';

create index if not exists retencion_comprobante_receptor_idx on retencion_comprobante (empresa_ruc, receptor_ruc);
create index if not exists retencion_documento_factura_idx
  on retencion_documento (empresa_ruc, tipo_comprobante, serie, numero);

alter table retencion_comprobante enable row level security;
alter table retencion_documento enable row level security;
drop policy if exists retencion_comprobante_lectura on retencion_comprobante;
create policy retencion_comprobante_lectura on retencion_comprobante for select using (seguridad.puede_ver_todo());
drop policy if exists retencion_documento_lectura on retencion_documento;
create policy retencion_documento_lectura on retencion_documento for select using (seguridad.puede_ver_todo());
revoke all on retencion_comprobante, retencion_documento from anon;
-- Solo leer: lo escriben las funciones de abajo (security definer).
revoke all on retencion_comprobante, retencion_documento from authenticated;
grant select on retencion_comprobante, retencion_documento to authenticated;

-- Guarda un lote de CRE con sus facturas (idempotente). Las facturas de cada CRE del lote se
-- reescriben: un CRE no cambia sus facturas, pero así una corrida que se cortó a mitad no deja restos.
create or replace function guardar_retenciones(p_empresa_ruc text, p_filas jsonb)
returns table (nuevos integer, actualizados integer)
language plpgsql
security definer
set search_path = public, seguridad, pg_temp
as $$
declare
  v_antes integer;
  v_total integer;
begin
  if seguridad.usuario_actual() is null then
    raise exception 'No hay sesión.';
  end if;
  if not seguridad.tiene_rol('ADMIN_SISTEMA') then
    raise exception 'Solo Administración del sistema guarda comprobantes de retención.';
  end if;

  select count(*) into v_antes
    from retencion_comprobante c
    join jsonb_array_elements(p_filas) f
      on c.empresa_ruc = p_empresa_ruc and c.emisor_ruc = f->>'emisorRuc'
     and c.serie = upper(f->>'serie') and c.numero = (f->>'numero')::integer;

  insert into retencion_comprobante as c (
    empresa_ruc, sentido, serie, numero, fecha_emision, emisor_ruc, receptor_ruc, receptor_nombre, regimen,
    monto_retenido, monto_pagado, monto_base, estado, fecha_reversion, motivo_reversion, periodo, ticket,
    pdf_drive_url, xml_drive_url
  )
  select p_empresa_ruc, f->>'sentido', upper(f->>'serie'), (f->>'numero')::integer, nullif(f->>'fechaEmision', '')::date,
         f->>'emisorRuc', nullif(f->>'receptorRuc', ''), nullif(f->>'receptorNombre', ''), nullif(f->>'regimen', ''),
         nullif(f->>'montoRetenido', '')::numeric, nullif(f->>'montoPagado', '')::numeric, nullif(f->>'montoBase', '')::numeric,
         f->>'estado', nullif(f->>'fechaReversion', '')::date, nullif(f->>'motivoReversion', ''), nullif(f->>'periodo', ''),
         nullif(f->>'ticket', ''), nullif(f->>'pdfDriveUrl', ''), nullif(f->>'xmlDriveUrl', '')
    from jsonb_array_elements(p_filas) f
   where f->>'sentido' in ('COMPRA', 'VENTA') and f->>'estado' in ('EMITIDO', 'REVERTIDO')
     and coalesce(f->>'serie', '') <> '' and coalesce(f->>'numero', '') ~ '^\d+$' and coalesce(f->>'emisorRuc', '') <> ''
  on conflict (empresa_ruc, emisor_ruc, serie, numero) do update set
    sentido = excluded.sentido, fecha_emision = excluded.fecha_emision, receptor_ruc = excluded.receptor_ruc,
    receptor_nombre = coalesce(excluded.receptor_nombre, c.receptor_nombre), regimen = excluded.regimen,
    monto_retenido = excluded.monto_retenido, monto_pagado = excluded.monto_pagado, monto_base = excluded.monto_base,
    estado = excluded.estado, fecha_reversion = excluded.fecha_reversion,
    motivo_reversion = coalesce(excluded.motivo_reversion, c.motivo_reversion), periodo = excluded.periodo,
    ticket = coalesce(excluded.ticket, c.ticket),
    pdf_drive_url = coalesce(excluded.pdf_drive_url, c.pdf_drive_url),
    xml_drive_url = coalesce(excluded.xml_drive_url, c.xml_drive_url),
    ultima_vez = now();
  get diagnostics v_total = row_count;

  delete from retencion_documento d
   using jsonb_array_elements(p_filas) f
   where d.empresa_ruc = p_empresa_ruc and d.emisor_ruc = f->>'emisorRuc'
     and d.cre_serie = upper(f->>'serie') and d.cre_numero = (f->>'numero')::integer
     and jsonb_array_length(coalesce(f->'documentos', '[]'::jsonb)) > 0;

  insert into retencion_documento (
    empresa_ruc, emisor_ruc, cre_serie, cre_numero, tipo_comprobante, serie, numero, fecha_emision, total, moneda,
    numero_pago, fecha_pago, monto_pago, moneda_pago, monto_retenido, fecha_retencion, monto_pagado, tipo_cambio
  )
  select p_empresa_ruc, f->>'emisorRuc', upper(f->>'serie'), (f->>'numero')::integer, d->>'tipoComprobante',
         upper(d->>'serie'), d->>'numero', nullif(d->>'fechaEmision', '')::date, nullif(d->>'total', '')::numeric,
         nullif(d->>'moneda', ''), coalesce(nullif(btrim(d->>'numeroPago'), ''), '1'), nullif(d->>'fechaPago', '')::date,
         nullif(d->>'montoPago', '')::numeric, nullif(d->>'monedaPago', ''), nullif(d->>'montoRetenido', '')::numeric,
         nullif(d->>'fechaRetencion', '')::date, nullif(d->>'montoPagado', '')::numeric, nullif(d->>'tipoCambio', '')::numeric
    from jsonb_array_elements(p_filas) f
    cross join jsonb_array_elements(coalesce(f->'documentos', '[]'::jsonb)) d
   where coalesce(f->>'numero', '') ~ '^\d+$'
     and exists (select 1 from retencion_comprobante c
                  where c.empresa_ruc = p_empresa_ruc and c.emisor_ruc = f->>'emisorRuc'
                    and c.serie = upper(f->>'serie') and c.numero = (f->>'numero')::integer)
  on conflict do nothing;

  return query select v_total - v_antes, v_antes;
end;
$$;

-- Los CRE ya guardados con sus facturas, su estado y si tienen PDF y XML en Drive: la corrida no vuelve
-- a bajar uno que esté igual (un EMITIDO que pasó a REVERTIDO sí se vuelve a leer).
create or replace function retenciones_guardadas(p_empresa_ruc text)
returns table (emisor_ruc text, serie text, numero integer, estado text, con_archivos boolean)
language sql
stable
security definer
set search_path = public, seguridad, pg_temp
as $$
  select c.emisor_ruc, c.serie, c.numero, c.estado,
         (c.pdf_drive_url is not null and c.xml_drive_url is not null) or c.estado = 'REVERTIDO'
    from retencion_comprobante c
   where c.empresa_ruc = p_empresa_ruc and (select seguridad.puede_ver_todo())
     and exists (select 1 from retencion_documento d
                  where d.empresa_ruc = c.empresa_ruc and d.emisor_ruc = c.emisor_ruc
                    and d.cre_serie = c.serie and d.cre_numero = c.numero);
$$;

-- detalle_cpe_hoja_con_retencion(): detalle_cpe_hoja_con_detraccion() (migración 066, sin tocar) con
-- seis columnas más AL FINAL, al lado de las de detracción, de los CRE que cubren cada factura de
-- compra. Si hay más de uno —pagos parciales—, van todos:
--   retencion_comprobante   los CRE, «E001-2764 / E001-2801»
--   retencion_fecha_pago    la del último pago con retención
--   retencion_monto         lo retenido (de los CRE emitidos; un CRE revertido ya no retiene)
--   retencion_pdf / _xml    el enlace al último CRE emitido en Drive
--   retencion_estado        «Emitido», «Revertido», «Emitido y revertido» (uno de cada uno), o vacío;
--                           con « · revisar: también tiene detracción» si la factura tiene las dos
--                           (no puede: una operación con detracción no lleva retención).
-- Función nueva y no la de detracción rehecha: cambiar lo que devuelve obliga a borrarla y crearla.
create or replace function detalle_cpe_hoja_con_retencion(p_periodo text default null)
returns table (
  periodo text, origen text, proveedor_ruc text, proveedor_nombre text, tipo_comprobante text, serie text,
  numero text, fecha_emision date, moneda text, linea integer, descripcion text, cantidad numeric, unidad text,
  precio_unitario numeric, importe numeric, total_comprobante numeric, enlace_xml text, enlace_pdf text,
  forma_pago text, guia_remision text, orden_compra text, detraccion_porcentaje numeric, detraccion_monto numeric,
  detraccion_cuenta_banco text, detraccion_codigo_bien_servicio text, anticipo_aplicado numeric,
  documento_relacionado text, tipo_documento_relacionado text, oc_carpeta text, centro_costo_cg text,
  codigo_concar text, archivo_oc text, archivo_oc_url text, situacion_pago_oc text, comprador_oc text,
  area_oc text, legajo_oc text, carpeta_oc_url text,
  proyecto_oc text, centro_costo_segun text, documentos_oc text,
  base_gravada numeric, igv_comprobante numeric, no_gravado numeric, desglose_segun text,
  tipo_cambio numeric, total_soles numeric, detraccion_revisar text,
  detraccion_constancia text, detraccion_fecha_pago date, detraccion_depositado numeric,
  detraccion_pdf text, detraccion_html text, detraccion_constancia_estado text,
  retencion_comprobante text, retencion_fecha_pago date, retencion_monto numeric,
  retencion_pdf text, retencion_xml text, retencion_estado text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with h as materialized (
    select * from detalle_cpe_hoja_con_detraccion(p_periodo)
  ),
  ret as (
    select c.receptor_ruc proveedor_ruc, d.tipo_comprobante, d.serie, numero_comparable(d.numero) numero,
           string_agg(distinct c.serie || '-' || c.numero, ' / ') comprobantes,
           max(d.fecha_pago) filter (where c.estado = 'EMITIDO') fecha_pago,
           sum(d.monto_retenido) filter (where c.estado = 'EMITIDO') monto,
           (array_agg(c.pdf_drive_url order by d.fecha_pago desc, c.numero desc) filter (where c.estado = 'EMITIDO' and c.pdf_drive_url is not null))[1] pdf,
           (array_agg(c.xml_drive_url order by d.fecha_pago desc, c.numero desc) filter (where c.estado = 'EMITIDO' and c.xml_drive_url is not null))[1] xml,
           bool_or(c.estado = 'EMITIDO') emitido, bool_or(c.estado = 'REVERTIDO') revertido
      from retencion_documento d
      join retencion_comprobante c
        on c.empresa_ruc = d.empresa_ruc and c.emisor_ruc = d.emisor_ruc and c.serie = d.cre_serie and c.numero = d.cre_numero
     where d.empresa_ruc = '20512201611' and c.sentido = 'COMPRA' and (select seguridad.puede_ver_todo())
     group by 1, 2, 3, 4
  )
  select h.*,
         r.comprobantes, r.fecha_pago, r.monto, r.pdf, r.xml,
         case when r.comprobantes is null then ''
              else case when r.emitido and r.revertido then 'Emitido y revertido' when r.emitido then 'Emitido' else 'Revertido' end
                   || case when r.emitido and (coalesce(h.detraccion_monto, 0) > 0 or h.detraccion_constancia is not null)
                             then ' · revisar: también tiene detracción' else '' end
         end
    from h
    left join ret r on h.origen = 'RECIBIDO' and r.proveedor_ruc = h.proveedor_ruc and r.tipo_comprobante = h.tipo_comprobante
                   and r.serie = upper(h.serie) and r.numero = numero_comparable(h.numero)
   order by h.fecha_emision, h.serie, h.numero, h.linea;
$$;

revoke execute on function guardar_retenciones(text, jsonb) from public, anon;
grant execute on function guardar_retenciones(text, jsonb) to authenticated;
revoke execute on function retenciones_guardadas(text) from public, anon;
grant execute on function retenciones_guardadas(text) to authenticated;
revoke execute on function detalle_cpe_hoja_con_retencion(text) from public, anon;
grant execute on function detalle_cpe_hoja_con_retencion(text) to authenticated;

commit;
