-- ════════════════════════════════════════════════════════════════
-- 016 · EL KARDEX COMPLETO Y SU SEGUIMIENTO DIARIO
--
-- Contabilidad (reunión del 27/10/2026): lo que cuenta es el cierre
-- mensual, pero el kardex de Almacén se sigue tocando después (del 1 al 5
-- del mes siguiente, y a veces meses atrás). José cuadra el kardex al
-- cierre: cada movimiento que entra, cambia o se borra en un mes ya
-- terminado le mueve ese cuadre. Se lee TODO el kardex (ingresos y salidas)
-- dos veces al día y se anota cada cambio.
--
--   kardex_movimiento  una fila por producto de un vale (el ID de la app de
--                      Almacén). vale_almacen sigue siendo la cabecera de los
--                      ingresos que cruzan con una OC: no se toca.
--   guardar_kardex     guarda lo nuevo o cambiado, borra lo que ya no está y
--                      anota los cambios en `cambio` (entidad 'kardex'). La
--                      comparación la hace el script
--                      (src/shared/lib/kardex/movimientos.ts): aquí solo se
--                      escribe, de a lotes.
--   kardex_mes         el resumen por mes (movimientos, vales, ingresos y
--                      salidas), que calcula el script. La pantalla Kardex lee
--                      esto y los cambios de `cambio` directo (sin funciones
--                      de lectura: README, regla 6).
--
-- Se puede correr dos veces.
-- ════════════════════════════════════════════════════════════════

create table if not exists kardex_movimiento (
  id                text primary key,           -- ID de la fila en la app de Almacén
  empresa_ruc       char(11) not null references empresa(ruc),
  vale              text,
  fecha_registro    date,
  fecha_operacion   date,
  movimiento        text,                       -- INGRESO / SALIDA / ANULADO
  operacion         text,
  anexo             text,                       -- «PROVEEDOR: ACME SAC», «PROYECTO: …»
  numero_documento  text,
  numero_orden      text,
  proyecto          text,
  sede              text,
  responsable       text,
  sku               text,                       -- CODIGO SIDIGE
  producto          text,
  unidad            text,
  categoria         text,
  ingreso           numeric(16,4),
  salida            numeric(16,4),
  visto_desde       timestamptz not null default now(),
  cargado_en        timestamptz not null default now()
);
create index if not exists kardex_movimiento_mes_ix on kardex_movimiento (empresa_ruc, fecha_operacion);
create index if not exists kardex_movimiento_vale_ix on kardex_movimiento (vale);
alter table kardex_movimiento enable row level security;
revoke all on kardex_movimiento from anon, authenticated;
grant all on kardex_movimiento to service_role;

-- ── Guardar ─────────────────────────────────────────────────────
-- p_filas: los movimientos nuevos o cambiados (MovimientoKardex, en camelCase).
-- p_borrar: los ID que ya no están. p_cambios: CambioKardex. p_corrida: la
-- corrida del job 'kardex' (la abre el script) o null.

create or replace function guardar_kardex(p_empresa_ruc text, p_filas jsonb, p_borrar text[], p_cambios jsonb, p_corrida bigint default null)
returns table (guardadas integer, borradas integer, cambios integer)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into kardex_movimiento as k (id, empresa_ruc, vale, fecha_registro, fecha_operacion, movimiento, operacion, anexo,
    numero_documento, numero_orden, proyecto, sede, responsable, sku, producto, unidad, categoria, ingreso, salida)
  select f->>'id', p_empresa_ruc, nullif(f->>'vale', ''), nullif(f->>'fechaRegistro', '')::date, nullif(f->>'fechaOperacion', '')::date,
         nullif(f->>'movimiento', ''), nullif(f->>'operacion', ''), nullif(f->>'anexo', ''), nullif(f->>'numeroDocumento', ''),
         nullif(f->>'numeroOrden', ''), nullif(f->>'proyecto', ''), nullif(f->>'sede', ''), nullif(f->>'responsable', ''),
         nullif(f->>'sku', ''), nullif(f->>'producto', ''), nullif(f->>'unidad', ''), nullif(f->>'categoria', ''),
         nullif(f->>'ingreso', '')::numeric, nullif(f->>'salida', '')::numeric
  from jsonb_array_elements(coalesce(p_filas, '[]')) f
  where coalesce(f->>'id', '') <> ''
  on conflict (id) do update set
    vale = excluded.vale, fecha_registro = excluded.fecha_registro, fecha_operacion = excluded.fecha_operacion,
    movimiento = excluded.movimiento, operacion = excluded.operacion, anexo = excluded.anexo,
    numero_documento = excluded.numero_documento, numero_orden = excluded.numero_orden, proyecto = excluded.proyecto,
    sede = excluded.sede, responsable = excluded.responsable, sku = excluded.sku, producto = excluded.producto,
    unidad = excluded.unidad, categoria = excluded.categoria, ingreso = excluded.ingreso, salida = excluded.salida,
    cargado_en = now();
  get diagnostics guardadas = row_count;

  delete from kardex_movimiento where empresa_ruc = p_empresa_ruc and id = any(coalesce(p_borrar, '{}'));
  get diagnostics borradas = row_count;

  insert into cambio (entidad, clave, tipo, campo, antes, despues, detalle, corrida_id)
  select 'kardex', c->>'clave', c->>'tipo', nullif(c->>'campo', ''), c->>'antes', c->>'despues',
         coalesce(c->'detalle', '{}') || jsonb_build_object('empresa_ruc', p_empresa_ruc), p_corrida
  from jsonb_array_elements(coalesce(p_cambios, '[]')) c;
  get diagnostics cambios = row_count;

  return next;
end;
$$;

-- ── Resumen por mes ─────────────────────────────────────────────
-- Lo calcula el script con el kardex que ya tiene en memoria (README, reglas
-- 1 y 2) y lo reemplaza entero en cada lectura completa, con .upsert(); la
-- pantalla lo lee tal cual, sin recorrer las decenas de miles de movimientos.

create table if not exists kardex_mes (
  empresa_ruc   char(11) not null references empresa(ruc),
  mes           text not null check (mes ~ '^\d{4}-\d{2}$'),   -- yyyy-mm de la fecha de operación
  movimientos   integer not null,
  vales         integer not null,
  ingresos      numeric(18,4) not null,
  salidas       numeric(18,4) not null,
  anulados      integer not null,
  calculado_en  timestamptz not null default now(),
  primary key (empresa_ruc, mes)
);
alter table kardex_mes enable row level security;
revoke all on kardex_mes from anon, authenticated;
grant all on kardex_mes to service_role;

revoke all on function guardar_kardex(text, jsonb, text[], jsonb, bigint) from public, anon, authenticated;
grant execute on function guardar_kardex(text, jsonb, text[], jsonb, bigint) to service_role;

notify pgrst, 'reload schema';
