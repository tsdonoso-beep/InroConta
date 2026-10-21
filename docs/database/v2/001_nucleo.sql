-- ════════════════════════════════════════════════════════════════
-- 001 · NÚCLEO
-- Empresa, centros de costo, corridas de los jobs e historial de cambios.
--
-- Todo en `public`. Cada tabla se llama como lo que es; las hijas llevan el
-- nombre del padre (comprobante → comprobante_item). Sin triggers.
--
-- Las personas, roles y áreas están en 006 (viáticos): INROCONTA no las
-- usa. Su app web entra con Google (@inroprin.com) y saca permisos de
-- usuario_inroconta (013, src/shared/auth/access.ts).
--
-- Acceso: solo servidores. La app (servidor de Vercel) y los workflows usan
-- la llave de servicio (service_role), que pasa por encima del RLS. Toda
-- tabla tiene RLS activado y NINGUNA política: anon y authenticated no ven
-- nada. Sin políticas no hay funciones evaluadas por fila: el problema que
-- dejaba a cpe_comprobante sin responder (base.mts) no puede ocurrir.
-- Todo el acceso se declara junto, al final, en 009_acceso.sql.
-- ════════════════════════════════════════════════════════════════

-- ── Empresa ─────────────────────────────────────────────────────
-- El RUC es la llave en toda la base (antes convivían empresa_id y empresa_ruc).

create table empresa (
  ruc               char(11) primary key check (ruc ~ '^\d{11}$'),
  razon_social      text not null,
  abreviatura       text not null unique,
  activa            boolean not null default true,
  sunat_secret_ref  text,                 -- nombre del secreto, nunca la clave
  creado_en         timestamptz not null default now()
);

insert into empresa (ruc, razon_social, abreviatura)
values ('20512201611', 'INDUSTRIAS ROLAND PRINT S.A.C.', 'INROPRIN');

-- ── Centros de costo ────────────────────────────────────────────
-- Los de la base de Control de Gestión: proyectos (PROY-2025-189 …) y áreas
-- administrativas (en CG vienen con código «-» y el nombre del área; aquí
-- el código es el nombre). `concar_codigo` absorbe equivalencia_centro_costo.

create table centro_costo (
  id               uuid primary key default gen_random_uuid(),
  empresa_ruc      char(11) not null references empresa(ruc),
  codigo           text not null,
  nombre           text not null,
  es_area          boolean not null default false,   -- área administrativa, no proyecto
  abreviatura      text,
  concar_codigo    text,                  -- código en CONCAR (contabilidad)
  estado           text not null default 'ACTIVO'
                   check (estado in ('ACTIVO', 'MANTENIMIENTO', 'CERRADO')),
  creado_en        timestamptz not null default now(),
  -- Para cruzar con hojas que escriben "PROY-2024- 032" o en minúsculas.
  codigo_normal    text generated always as
                   (upper(regexp_replace(codigo, '\s+', '', 'g'))) stored,
  unique (empresa_ruc, codigo),
  unique (empresa_ruc, codigo_normal)
);
create unique index centro_costo_concar_uq
  on centro_costo (empresa_ruc, concar_codigo) where concar_codigo is not null;

-- ── Corridas de los jobs ────────────────────────────────────────
-- Una fila por ejecución de un workflow, script de laptop o copia de hoja.
-- Reemplaza a consultas_sunat (cuadre del SIRE) y fuente_copia (copia de
-- hojas). Lo propio de cada job va en `resumen`. La copia de pestañas de
-- CopiarFuentes.gs (antes la fuente «COPIA» de cargar_fuentes_compras) es
-- una corrida por pestaña: job 'copia-fuentes', resumen = {pestana, origen,
-- inicio, fin}; «la última copia de cada pestaña» es un select con
-- distinct on (resumen->>'pestana').

create table corrida (
  id            bigint generated always as identity primary key,
  job           text not null,            -- 'sire', 'cpe-api', 'padron', 'carpetas-oc', 'copia-fuentes', …
  empresa_ruc   char(11) references empresa(ruc),
  periodo       integer check (periodo between 200001 and 209912),  -- AAAAMM, si aplica
  iniciada_en   timestamptz not null default now(),
  terminada_en  timestamptz,
  resultado     text check (resultado in ('OK', 'PARCIAL', 'ERROR')),
  filas         integer,
  resumen       jsonb not null default '{}',   -- p. ej. {cuadran: 120, monto_distinto: 3}
  error         text,
  origen        text                      -- URL de la corrida en Actions, o 'laptop'
);
create index corrida_job_ix on corrida (job, iniciada_en desc);
create index corrida_empresa_ix on corrida (empresa_ruc);

-- ── Historial de cambios ────────────────────────────────────────
-- Uno solo para todo (antes: cambios_comprobante_sunat, carpeta_cambio,
-- fuente_cambio). Lo escribe la función que guarda, con lo que el script ya
-- comparó; nunca un trigger.
--   entidad: 'registro_compras', 'orden_compra', 'carpeta_oc', 'vale_almacen', …
--   clave:   la llave natural como texto, p. ej. '202609|20100047218-01-F001-123'
--   detalle: lo que la pantalla necesita mostrar (procedencia, enlace, carpeta)

create table cambio (
  id           bigint generated always as identity primary key,
  entidad      text not null,
  clave        text not null,
  tipo         text not null,              -- NUEVO, CAMBIO, ELIMINADO, ARCHIVO RENOMBRADO, COMPLETÓ…
  campo        text,                       -- qué columna cambió; null cuando es la fila entera
  antes        text,
  despues      text,
  detalle      jsonb,
  hecho_por    text,                       -- correo de quien lo hizo en la app; null si fue un job
  corrida_id   bigint references corrida(id),
  ocurrido_en  timestamptz not null default now()
);
create index cambio_entidad_ix   on cambio (entidad, clave, ocurrido_en desc);
create index cambio_recientes_ix on cambio (ocurrido_en desc);
create index cambio_corrida_ix   on cambio (corrida_id);
