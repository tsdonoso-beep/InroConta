-- Las constancias de depósito de detracción (SPOT) y su cruce con las facturas
--
-- Pedido de Contabilidad (07/10/2026): tener cada constancia de depósito de
-- detracción como documento digital, en Drive, para contrastarla con su
-- factura. scripts/local/detracciones/detracciones.mts las baja de la consulta
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
revoke insert, update, delete, truncate, references, trigger on detraccion_constancia from authenticated;

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

-- Una fila por constancia, con su factura: la del SIRE (compras) y la del XML
-- (compras y ventas). Lo que publica la pestaña DETRACCIONES.
--   estado: «Con factura», «Revisar monto» (difiere en más de S/ 1 de la
--   detracción del SIRE o del XML; SUNAT redondea el depósito a soles) o
--   «Sin factura» (no está en el SIRE ni en los XML).
create or replace function detracciones_hoja(p_empresa_ruc text)
returns table (
  periodo text, sentido text, fecha_pago date, numero_constancia text,
  tipo_comprobante text, serie text, numero text,
  proveedor_ruc text, proveedor_nombre text, adquiriente_numero text, adquiriente_nombre text,
  codigo_bien_servicio text, monto numeric, numero_cuenta text, numero_operacion text,
  estado text, total_factura numeric, detraccion_sire numeric, detraccion_xml numeric,
  cuenta_xml text, pdf_constancia text, pdf_factura text, fecha_hora_pago text
)
language sql
stable
security definer
set search_path = public, seguridad, pg_temp
as $$
  select d.periodo, d.sentido, d.fecha_pago, d.numero_constancia,
         d.tipo_comprobante, d.serie, d.numero,
         d.proveedor_ruc, d.proveedor_nombre, d.adquiriente_numero, d.adquiriente_nombre,
         d.codigo_bien_servicio, d.monto, d.numero_cuenta, d.numero_operacion,
         case
           when s.id is null and c.id is null then 'Sin factura'
           when (s.detraccion is not null and abs(s.detraccion - d.monto) > 1)
             or (c.detraccion_monto is not null and abs(c.detraccion_monto - d.monto) > 1) then 'Revisar monto'
           else 'Con factura'
         end,
         coalesce(s.total, c.total), s.detraccion, c.detraccion_monto,
         c.detraccion_cuenta_banco, d.pdf_drive_url, c.pdf_drive_url,
         to_char(d.fecha_hora_pago at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI:SS')
    from detraccion_constancia d
    left join lateral (
      select x.id, x.total, x.detraccion
        from comprobantes_sunat x
       where d.sentido = 'COMPRA' and x.empresa_ruc = d.empresa_ruc and x.proveedor_ruc = d.proveedor_ruc
         and x.tipo_comprobante = d.tipo_comprobante and upper(x.serie) = upper(d.serie)
         and numero_comparable(x.numero) = numero_comparable(d.numero)
       order by x.ultima_vez desc
       limit 1
    ) s on true
    left join lateral (
      select y.id, y.total, y.detraccion_monto, y.detraccion_cuenta_banco, y.pdf_drive_url
        from cpe_comprobante y
       where y.empresa_ruc = d.empresa_ruc and y.proveedor_ruc = d.proveedor_ruc
         and y.tipo_comprobante = d.tipo_comprobante and upper(y.serie) = upper(d.serie)
         and numero_comparable(y.numero) = numero_comparable(d.numero)
       limit 1
    ) c on true
   where d.empresa_ruc = p_empresa_ruc and (select seguridad.puede_ver_todo())
   order by d.periodo desc, d.fecha_pago desc, d.numero_constancia;
$$;

-- Facturas de compra del SIRE con detracción y sin constancia guardada: lo que
-- falta depositar (o la constancia que falta bajar). Desde 202601, como la hoja
-- principal. Lo que publica la pestaña DETRACCIONES SIN CONSTANCIA.
create or replace function detracciones_sin_constancia(p_empresa_ruc text, p_desde text default '202601')
returns table (
  periodo text, fecha_emision date, proveedor_ruc text, proveedor_nombre text,
  tipo_comprobante text, serie text, numero text, total numeric, moneda text, detraccion numeric
)
language sql
stable
security definer
set search_path = public, seguridad, pg_temp
as $$
  select s.periodo, s.fecha_emision, s.proveedor_ruc, s.proveedor_nombre,
         s.tipo_comprobante, s.serie, s.numero, s.total, s.moneda, s.detraccion
    from comprobantes_sunat s
   where s.empresa_ruc = p_empresa_ruc and s.periodo >= p_desde and coalesce(s.detraccion, 0) > 0
     and (select seguridad.puede_ver_todo())
     and not exists (
       select 1 from detraccion_constancia d
        where d.empresa_ruc = s.empresa_ruc and d.sentido = 'COMPRA' and d.proveedor_ruc = s.proveedor_ruc
          and d.tipo_comprobante = s.tipo_comprobante and upper(d.serie) = upper(s.serie)
          and numero_comparable(d.numero) = numero_comparable(s.numero)
     )
   order by s.periodo desc, s.fecha_emision desc, s.proveedor_ruc;
$$;

revoke execute on function guardar_detracciones(text, jsonb) from public, anon;
grant execute on function guardar_detracciones(text, jsonb) to authenticated;
revoke execute on function detracciones_guardadas(text) from public, anon;
grant execute on function detracciones_guardadas(text) to authenticated;
revoke execute on function detracciones_hoja(text) from public, anon;
grant execute on function detracciones_hoja(text) to authenticated;
revoke execute on function detracciones_sin_constancia(text, text) from public, anon;
grant execute on function detracciones_sin_constancia(text, text) to authenticated;
