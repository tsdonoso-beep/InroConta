-- Las constancias de depósito de detracción (SPOT), en el detalle de cada factura
--
-- Pedido de Contabilidad (07/10/2026): tener cada constancia de depósito de
-- detracción como documento digital, en Drive, para contrastarla con su
-- factura. La constancia entra en la MISMA hoja que el resto de la extracción
-- (COMPROBANTES SUNAT - DETALLE, que lee la vista de Apps Script): seis
-- columnas al final, con el enlace a su PDF y a su HTML, que agrega
-- detalle_cpe_hoja_con_detraccion() sobre detalle_cpe_hoja() (que no se toca).
--
-- scripts/local/detracciones/detracciones.mts las baja de la consulta
-- «Consulta de Pago de Detracciones» de SOL (por la API de la página, ver
-- docs/detracciones-spot.md §8), sube el HTML de SUNAT y un PDF a Drive
-- (Detracciones/Compras|Ventas/AAAA-MM) y guarda aquí una fila por constancia.
--
-- Una constancia se reconoce por su número (num_constancia de SUNAT): repetir
-- la corrida actualiza, no duplica. Los enlaces de Drive no se pisan con vacío.
--
-- sentido: COMPRA si nosotros somos el adquiriente (depositamos al proveedor);
-- VENTA si somos el proveedor (un cliente nos depositó).

create table if not exists detraccion_constancia (
  id                        uuid primary key default gen_random_uuid(),
  empresa_ruc               text not null,
  numero_constancia         text not null,
  sentido                   text not null check (sentido in ('COMPRA', 'VENTA')),

  tipo_cuenta               text,
  numero_cuenta             text,
  fecha_pago                date,
  fecha_hora_pago           timestamptz,
  periodo                   text,

  tipo_comprobante          text,
  serie                     text,
  numero                    text,

  proveedor_ruc             text,
  proveedor_nombre          text,
  adquiriente_tipo_doc      text,
  adquiriente_numero        text,
  adquiriente_nombre        text,

  tipo_operacion            text,
  codigo_bien_servicio      text,
  monto                     numeric(14,2),
  numero_operacion          text,
  numero_pago_detracciones  text,
  origen                    text,
  usuario_sol               text,
  tipo_consulta             text,

  pdf_drive_url             text,
  html_drive_url            text,

  primera_vez               timestamptz not null default now(),
  ultima_vez                timestamptz not null default now(),

  constraint detraccion_constancia_unica unique (empresa_ruc, numero_constancia)
);

comment on table detraccion_constancia is
  'Constancias de depósito de detracción (SPOT) de la consulta «Consulta de Pago de Detracciones» de SOL, con enlace al HTML de SUNAT y a su PDF en Drive. Las llena scripts/local/detracciones/detracciones.mts.';

create index if not exists detraccion_constancia_comprobante_idx
  on detraccion_constancia (empresa_ruc, proveedor_ruc, tipo_comprobante, serie, numero);
create index if not exists detraccion_constancia_periodo_idx
  on detraccion_constancia (empresa_ruc, periodo);

alter table detraccion_constancia enable row level security;

create policy detraccion_constancia_lectura on detraccion_constancia for select using (seguridad.puede_ver_todo());

revoke all on detraccion_constancia from anon;
-- Solo leer: lo escriben las funciones de abajo (security definer). Equivale a quitarle todo menos select.
revoke all on detraccion_constancia from authenticated;
grant select on detraccion_constancia to authenticated;

-- Guarda un lote de constancias (idempotente).
create or replace function guardar_detracciones(p_empresa_ruc text, p_filas jsonb)
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
    raise exception 'Solo Administración del sistema guarda constancias de detracción.';
  end if;

  select count(*) into v_antes
    from detraccion_constancia d
   where d.empresa_ruc = p_empresa_ruc
     and d.numero_constancia in (select f->>'numeroConstancia' from jsonb_array_elements(p_filas) f);

  insert into detraccion_constancia as d (
    empresa_ruc, numero_constancia, sentido, tipo_cuenta, numero_cuenta, fecha_pago, fecha_hora_pago, periodo,
    tipo_comprobante, serie, numero, proveedor_ruc, proveedor_nombre, adquiriente_tipo_doc, adquiriente_numero,
    adquiriente_nombre, tipo_operacion, codigo_bien_servicio, monto, numero_operacion, numero_pago_detracciones,
    origen, usuario_sol, tipo_consulta, pdf_drive_url, html_drive_url
  )
  select p_empresa_ruc, f->>'numeroConstancia', f->>'sentido', nullif(f->>'tipoCuenta', ''), nullif(f->>'numeroCuenta', ''),
         nullif(f->>'fechaPago', '')::date, nullif(f->>'fechaHoraPago', '')::timestamptz, nullif(f->>'periodo', ''),
         nullif(f->>'tipoComprobante', ''), nullif(upper(f->>'serie'), ''), nullif(f->>'numero', ''),
         nullif(f->>'proveedorRuc', ''), nullif(f->>'proveedorNombre', ''), nullif(f->>'adquirienteTipoDoc', ''),
         nullif(f->>'adquirienteNumero', ''), nullif(f->>'adquirienteNombre', ''), nullif(f->>'tipoOperacion', ''),
         nullif(f->>'codigoBienServicio', ''), nullif(f->>'monto', '')::numeric, nullif(f->>'numeroOperacion', ''),
         nullif(btrim(f->>'numeroPagoDetracciones'), ''), nullif(f->>'origen', ''), nullif(f->>'usuarioSol', ''),
         nullif(f->>'tipoConsulta', ''), nullif(f->>'pdfDriveUrl', ''), nullif(f->>'htmlDriveUrl', '')
    from jsonb_array_elements(p_filas) f
   where coalesce(f->>'numeroConstancia', '') <> '' and f->>'sentido' in ('COMPRA', 'VENTA')
  on conflict (empresa_ruc, numero_constancia) do update set
    sentido = excluded.sentido, tipo_cuenta = excluded.tipo_cuenta, numero_cuenta = excluded.numero_cuenta,
    fecha_pago = excluded.fecha_pago, fecha_hora_pago = coalesce(excluded.fecha_hora_pago, d.fecha_hora_pago),
    periodo = excluded.periodo, tipo_comprobante = excluded.tipo_comprobante, serie = excluded.serie,
    numero = excluded.numero, proveedor_ruc = excluded.proveedor_ruc, proveedor_nombre = excluded.proveedor_nombre,
    adquiriente_tipo_doc = excluded.adquiriente_tipo_doc, adquiriente_numero = excluded.adquiriente_numero,
    adquiriente_nombre = excluded.adquiriente_nombre, tipo_operacion = excluded.tipo_operacion,
    codigo_bien_servicio = excluded.codigo_bien_servicio, monto = excluded.monto,
    numero_operacion = excluded.numero_operacion, numero_pago_detracciones = excluded.numero_pago_detracciones,
    origen = excluded.origen, usuario_sol = coalesce(excluded.usuario_sol, d.usuario_sol),
    tipo_consulta = excluded.tipo_consulta,
    pdf_drive_url = coalesce(excluded.pdf_drive_url, d.pdf_drive_url),
    html_drive_url = coalesce(excluded.html_drive_url, d.html_drive_url),
    ultima_vez = now();
  get diagnostics v_total = row_count;

  return query select v_total - v_antes, v_antes;
end;
$$;

-- Las que ya están guardadas con su PDF en Drive: la corrida no las vuelve a bajar.
create or replace function detracciones_guardadas(p_empresa_ruc text)
returns table (numero_constancia text)
language sql
stable
security definer
set search_path = public, seguridad, pg_temp
as $$
  select d.numero_constancia
    from detraccion_constancia d
   where d.empresa_ruc = p_empresa_ruc and d.pdf_drive_url is not null and d.html_drive_url is not null
     and (select seguridad.puede_ver_todo());
$$;

-- Número de comprobante comparable: sin ceros a la izquierda (como la cobertura de la guía, §12).
create or replace function numero_comparable(p text)
returns text
language sql
immutable
as $$ select coalesce(nullif(ltrim(coalesce(p, ''), '0'), ''), '0') $$;

-- detalle_cpe_hoja_con_detraccion(): detalle_cpe_hoja() (migración 053, sin
-- tocar) con seis columnas más AL FINAL, de las constancias de cada
-- comprobante. Es la que publica la hoja COMPROBANTES SUNAT - DETALLE. Si hay
-- más de una constancia —depósitos parciales—, van todas:
--   detraccion_constancia         los números, separados por « / »
--   detraccion_fecha_pago         la del último depósito
--   detraccion_depositado         la suma de los depósitos (SUNAT los redondea a soles)
--   detraccion_pdf / _html        el enlace a la constancia en Drive (la del último depósito)
--   detraccion_constancia_estado  «Con constancia», «Revisar monto» (lo depositado difiere en
--                                 más de S/ 1 de la detracción del XML), «Falta constancia» (el
--                                 XML dice que tiene detracción y no hay constancia) o vacío.
-- Función nueva y no detalle_cpe_hoja() rehecha: cambiar lo que devuelve obliga
-- a borrarla y crearla, y así lo que ya funciona queda igual.
create or replace function detalle_cpe_hoja_con_detraccion(p_periodo text default null)
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
  detraccion_pdf text, detraccion_html text, detraccion_constancia_estado text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with h as materialized (
    select * from detalle_cpe_hoja(p_periodo)
  ),
  dtr as (
    select x.proveedor_ruc, x.tipo_comprobante, upper(x.serie) serie, numero_comparable(x.numero) numero,
           string_agg(x.numero_constancia, ' / ' order by x.fecha_pago, x.numero_constancia) constancias,
           max(x.fecha_pago) fecha_pago, sum(x.monto) depositado,
           (array_agg(x.pdf_drive_url order by x.fecha_pago desc, x.numero_constancia desc) filter (where x.pdf_drive_url is not null))[1] pdf,
           (array_agg(x.html_drive_url order by x.fecha_pago desc, x.numero_constancia desc) filter (where x.html_drive_url is not null))[1] html
      from detraccion_constancia x
     where x.empresa_ruc = '20512201611' and (select seguridad.puede_ver_todo())
     group by 1, 2, 3, 4
  )
  select h.*,
         t.constancias, t.fecha_pago, t.depositado, t.pdf, t.html,
         case when t.constancias is not null and coalesce(h.detraccion_monto, 0) > 0 and abs(t.depositado - h.detraccion_monto) > 1
                then 'Revisar monto'
              when t.constancias is not null then 'Con constancia'
              when coalesce(h.detraccion_monto, 0) > 0 or coalesce(h.detraccion_porcentaje, 0) > 0 then 'Falta constancia'
              else '' end
    from h
    left join dtr t on t.proveedor_ruc = h.proveedor_ruc and t.tipo_comprobante = h.tipo_comprobante
                   and t.serie = upper(h.serie) and t.numero = numero_comparable(h.numero)
   order by h.fecha_emision, h.serie, h.numero, h.linea;
$$;

revoke execute on function guardar_detracciones(text, jsonb) from public, anon;
grant execute on function guardar_detracciones(text, jsonb) to authenticated;
revoke execute on function detracciones_guardadas(text) from public, anon;
grant execute on function detracciones_guardadas(text) to authenticated;
revoke execute on function detalle_cpe_hoja_con_detraccion(text) from public, anon;
grant execute on function detalle_cpe_hoja_con_detraccion(text) to authenticated;
