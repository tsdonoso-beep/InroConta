-- ════════════════════════════════════════════════════════════════
-- 008 · APLICACIONES DE ESCRITORIO Y SUS ACTUALIZACIONES
--
-- Las apps de escritorio de la empresa (hoy dos) preguntan al arrancar si
-- hay una versión nueva y, si la hay, la bajan e instalan solas.
--
--   aplicacion          cada app (código, nombre)
--   aplicacion_version  cada versión publicada, por plataforma y canal, con
--                       el enlace al instalador, su huella y si es obligatoria
--   aplicacion_equipo   cada PC donde está instalada y la última vez que
--                       preguntó (para saber quién quedó atrás)
--
-- La pregunta: la app NO habla con la base (no puede llevar la llave de
-- servicio dentro). Llama a una ruta del servidor de INROCONTA en Vercel,
-- p. ej. GET /api/apps/<codigo>/actualizacion?version=1.4.2&plataforma=windows-x64
-- &canal=estable&equipo=<id>, y la ruta llama a buscar_actualizacion() y
-- arma la respuesta en el formato que espere el actualizador de la app.
-- Es una consulta por índice y un upsert de una fila: liviana.
--
-- Los instaladores no van en la base: van donde se suben (GitHub Releases,
-- Supabase Storage o Drive) y aquí queda el enlace y su huella SHA-256,
-- para que la app compruebe que bajó el archivo correcto. `firma` es para
-- actualizadores que exigen el instalador firmado (Tauri, por ejemplo).
-- ════════════════════════════════════════════════════════════════

create table aplicacion (
  codigo       text primary key check (codigo ~ '^[a-z0-9-]+$'),   -- 'inro-escaner', …
  nombre       text not null,
  descripcion  text,
  repositorio  text,                       -- de dónde sale (GitHub)
  activa       boolean not null default true,
  creado_en    timestamptz not null default now()
);

-- Una fila por versión × plataforma. Las versiones son x.y.z (semver sin
-- sufijos): las partes numéricas se generan para ordenarlas bien
-- (1.10.0 va después de 1.9.3, cosa que el orden de texto no hace).
--   canal: 'estable' la reciben todos; 'beta' solo los equipos en beta,
--          que además reciben las estables.
--   obligatoria: quien tenga una versión anterior DEBE actualizar (no puede
--          posponerla). Útil cuando cambia la base o hay un error grave.
--   retirada: una versión que salió mal deja de ofrecerse sin borrarla.

create table aplicacion_version (
  id              uuid primary key default gen_random_uuid(),
  aplicacion      text not null references aplicacion(codigo),
  version         text not null check (version ~ '^\d+\.\d+\.\d+$'),
  mayor           integer generated always as (split_part(version, '.', 1)::integer) stored,
  menor           integer generated always as (split_part(version, '.', 2)::integer) stored,
  parche          integer generated always as (split_part(version, '.', 3)::integer) stored,
  plataforma      text not null check (plataforma in ('windows-x64', 'windows-arm64', 'macos-x64', 'macos-arm64', 'linux-x64')),
  canal           text not null default 'estable' check (canal in ('estable', 'beta')),
  url             text not null,          -- el instalador o paquete de actualización
  sha256          text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  tamano_bytes    bigint check (tamano_bytes > 0),
  firma           text,
  notas           text,                   -- qué trae (se muestra al usuario)
  obligatoria     boolean not null default false,
  retirada        boolean not null default false,
  publicada_por   text,                   -- correo de quien la publicó
  publicada_en    timestamptz not null default now(),
  unique (aplicacion, version, plataforma)
);
create index aplicacion_version_busqueda_ix
  on aplicacion_version (aplicacion, plataforma, mayor desc, menor desc, parche desc)
  where not retirada;

-- Cada PC con la app. `equipo` es un identificador que la app genera la
-- primera vez y guarda (no el nombre del usuario ni datos personales).
create table aplicacion_equipo (
  aplicacion        text not null references aplicacion(codigo),
  equipo            text not null check (length(equipo) between 8 and 100),
  nombre_equipo     text,                 -- el nombre de la PC, si la app lo manda
  plataforma        text,
  canal             text not null default 'estable' check (canal in ('estable', 'beta')),
  version           text,                 -- la que tenía al preguntar
  primera_consulta  timestamptz not null default now(),
  ultima_consulta   timestamptz not null default now(),
  primary key (aplicacion, equipo)
);
create index aplicacion_equipo_version_ix on aplicacion_equipo (aplicacion, version);

-- Compara dos versiones x.y.z: negativo, 0 o positivo.
create function comparar_version(a text, b text) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case
    when split_part(a, '.', 1)::int <> split_part(b, '.', 1)::int then sign(split_part(a, '.', 1)::int - split_part(b, '.', 1)::int)
    when split_part(a, '.', 2)::int <> split_part(b, '.', 2)::int then sign(split_part(a, '.', 2)::int - split_part(b, '.', 2)::int)
    else sign(split_part(a, '.', 3)::int - split_part(b, '.', 3)::int) end::integer
$$;

-- La llamada de «¿hay actualización?». Anota que el equipo preguntó y
-- devuelve la última versión publicada (no retirada) de su plataforma y
-- canal, si es más nueva que la que tiene:
--   {"hay": false}
--   {"hay": true, "version", "url", "sha256", "tamano_bytes", "firma", "notas",
--    "publicada_en", "obligatoria"}
-- `obligatoria` es true si CUALQUIER versión entre la suya y la última lo
-- es (saltarse una obligatoria no vale).
-- Si el equipo está marcado en beta (aplicacion_equipo.canal), recibe beta.

create function buscar_actualizacion(p_aplicacion text, p_plataforma text, p_version text,
                                     p_equipo text default null, p_nombre_equipo text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_canal text := 'estable';
  v       aplicacion_version%rowtype;
begin
  if not exists (select 1 from aplicacion where codigo = p_aplicacion and activa) then
    raise exception 'Aplicación desconocida: %', p_aplicacion;
  end if;
  if p_version !~ '^\d+\.\d+\.\d+$' then
    raise exception 'Versión inválida: %', p_version;
  end if;

  if p_equipo is not null then
    insert into aplicacion_equipo as e (aplicacion, equipo, nombre_equipo, plataforma, version)
    values (p_aplicacion, p_equipo, p_nombre_equipo, p_plataforma, p_version)
    on conflict (aplicacion, equipo) do update set
      nombre_equipo = coalesce(excluded.nombre_equipo, e.nombre_equipo),
      plataforma = excluded.plataforma, version = excluded.version, ultima_consulta = now()
    returning canal into v_canal;
  end if;

  select * into v from aplicacion_version
   where aplicacion = p_aplicacion and plataforma = p_plataforma and not retirada
     and (canal = 'estable' or v_canal = 'beta')
   order by mayor desc, menor desc, parche desc
   limit 1;

  if v.id is null or comparar_version(v.version, p_version) <= 0 then
    return jsonb_build_object('hay', false);
  end if;

  return jsonb_build_object(
    'hay', true, 'version', v.version, 'url', v.url, 'sha256', v.sha256,
    'tamano_bytes', v.tamano_bytes, 'firma', v.firma, 'notas', v.notas, 'publicada_en', v.publicada_en,
    'obligatoria', exists (
      select 1 from aplicacion_version x
       where x.aplicacion = p_aplicacion and x.plataforma = p_plataforma and not x.retirada and x.obligatoria
         and (x.canal = 'estable' or v_canal = 'beta')
         and comparar_version(x.version, p_version) > 0
         and comparar_version(x.version, v.version) <= 0));
end;
$$;

-- Publicar una versión es un insert directo desde el script de release
-- (GitHub Actions) con la llave de servicio; retirarla, un update de
-- `retirada`. Poner un equipo en beta: update de aplicacion_equipo.canal.
