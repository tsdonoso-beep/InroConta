-- ════════════════════════════════════════════════════════════════
-- 006 · VIÁTICOS
-- Personas, memos (con su solicitud), rendición, caja chica, movilidad,
-- liquidación, pagos y devoluciones. Decisión del 15/10/2026: en la misma
-- base que INROCONTA y SOLO DESDE SERVIDOR, igual que el resto (ver 009).
--
-- Solo desde servidor quiere decir: el navegador nunca habla con la base.
-- La app de viáticos (servidor de Next) comprueba quién es la persona y qué
-- puede hacer, y escribe con la llave de servicio. Las funciones de 007
-- reciben `p_usuario` (quién hace la acción) y vuelven a revisar lo que no
-- puede fallar: transiciones por rol, firma de la jefatura, un memo en una
-- sola liquidación vigente…
--
-- Antes (25 tablas)                         Ahora (18 propias + 5 compartidas)
--   usuarios, roles_usuario, areas,
--   datos_bancarios ......................... usuario, usuario_rol, rol, area, usuario_banco
--   memos + solicitudes_memo ................ memo (la solicitud es un memo en SOLICITADO)
--   memo_asignados + solicitud_personas ..... memo_persona
--   autorizaciones_memo ..................... memo_autorizacion
--   transiciones_memo ....................... memo_transicion
--   memo_secuencias ......................... memo_correlativo
--   gastos .................................. gasto (proveedor → contribuyente;
--                                             unido a su comprobante de SUNAT)
--   cajas_chicas, planillas_movilidad ....... caja_chica, planilla_movilidad
--   liquidaciones, liquidacion_memos ........ liquidacion, liquidacion_memo
--   pagos, pago_lineas, devoluciones ........ pago, pago_linea, devolucion
--   parametros .............................. parametro
--   eventos ................................. cambio (001, compartida)
--   empresas, centros_costo ................. empresa, centro_costo (001, compartidas)
--   proyectos, memo_distribucion ............ (se eliminan: vacías y sin uso)
--
-- Columnas que no escribía nadie y se quitan: memos.proyecto_id,
-- fecha_retorno_real, drive_folder_id; gastos.proyecto_id, categoria,
-- dj_motivo, dj_lugar, mov_origen, registrado_en, validacion_sunat (el
-- vínculo con SUNAT es ahora gasto.comprobante_id).
-- ════════════════════════════════════════════════════════════════

-- ── Personas ────────────────────────────────────────────────────
-- La persona; `auth_id` es su cuenta de Supabase Auth, si entra a la app.
-- Se entra con el DNI: el servidor arma el correo sintético
-- <dni>@sin-correo.local (antes lo hacía correo_de_acceso() en la base).

create table area (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null unique,
  responsable_id  uuid,                    -- FK más abajo (referencia circular)
  creado_en       timestamptz not null default now()
);

create table usuario (
  id               uuid primary key default gen_random_uuid(),
  auth_id          uuid unique references auth.users(id) on delete set null,
  dni              text not null unique check (dni ~ '^\d{8,12}$'),
  dni_provisional  boolean not null default false,   -- relleno hasta tener el real
  nombre           text not null,
  email            text,                             -- solo contacto
  cargo            text,                             -- como firma en el memo
  area_id          uuid references area(id),
  jefatura_id      uuid references usuario(id),      -- jefe directo
  activo           boolean not null default true,
  creado_en        timestamptz not null default now(),
  check (jefatura_id is distinct from id)
);
create index usuario_area_ix     on usuario (area_id);
create index usuario_jefatura_ix on usuario (jefatura_id);

alter table area add foreign key (responsable_id) references usuario(id);
create index area_responsable_ix on area (responsable_id);

-- Catálogo de roles. `ve_todo` reemplaza la lista fija de puede_ver_todo().
create table rol (
  codigo       text primary key,
  descripcion  text not null,
  ve_todo      boolean not null default false
);
insert into rol (codigo, descripcion, ve_todo) values
  ('RENDIDOR',       'Rinde sus gastos',                               false),
  ('JEFATURA',       'Responde solicitudes y da el visto bueno de su gente', false),
  ('ADMIN_MEMOS',    'Emite memos, registra pagos',                    true),
  ('REVISOR_COSTOS', 'Revisa y aprueba rendiciones',                   true),
  ('CONTABILIDAD',   'Contabiliza, liquida, registra el pago',         true),
  ('ADMIN_SISTEMA',  'Administra personas, catálogos y parámetros',    true);

create table usuario_rol (
  usuario_id  uuid not null references usuario(id) on delete cascade,
  rol         text not null references rol(codigo),
  primary key (usuario_id, rol)
);
create index usuario_rol_rol_ix on usuario_rol (rol);

-- Cuenta para pagarle a la persona.
create table usuario_banco (
  usuario_id       uuid primary key references usuario(id) on delete cascade,
  banco            text not null,
  cuenta           text not null,
  cci              text check (cci is null or cci ~ '^\d{20}$'),
  actualizado_por  uuid references usuario(id),
  actualizado_en   timestamptz not null default now()
);
create index usuario_banco_actualizado_ix on usuario_banco (actualizado_por);

-- ── Parámetros ──────────────────────────────────────────────────
-- null = pendiente de definir; la app lo trata como «sin tope» y lo avisa.

create table parametro (
  clave            text primary key,
  valor            jsonb not null,
  descripcion      text,
  actualizado_por  uuid references usuario(id),
  actualizado_en   timestamptz not null default now()
);
create index parametro_actualizado_ix on parametro (actualizado_por);

insert into parametro (clave, valor, descripcion) values
  ('tope_declaracion_jurada_dia', 'null',  'Máximo por día sin comprobante (pendiente: Contabilidad)'),
  ('tope_movilidad_dia',          'null',  'Tope diario de la planilla de movilidad (% de la RMV, art. 37 a1)'),
  ('plazo_rendicion_dias',        'null',  'Días desde el retorno para rendir (pendiente: Dirección)'),
  ('bloquear_memo_con_pendientes','false', 'Bloquea abrir memos si la persona tiene rendiciones vencidas'),
  ('dias_gracia_bloqueo',         '15',    'Días de tolerancia antes de considerar vencida una rendición'),
  ('igv_porcentaje',              '18',    'IGV vigente'),
  ('umbral_confianza_alerta',     '0.75',  'Confianza mínima de la lectura del comprobante antes de alertar');

-- ── Caja chica ──────────────────────────────────────────────────
-- El fondo fijo. Cada reposición es un memo CAJA_CHICA (un «ciclo»).

create table caja_chica (
  id              uuid primary key default gen_random_uuid(),
  empresa_ruc     char(11) not null references empresa(ruc),
  codigo          text not null,
  nombre          text not null,
  responsable_id  uuid not null references usuario(id),   -- ejecutor y administrador de la caja
  activa          boolean not null default true,
  creado_en       timestamptz not null default now(),
  unique (empresa_ruc, codigo)
);
create index caja_chica_responsable_ix on caja_chica (responsable_id);

-- ── Memo ────────────────────────────────────────────────────────
-- Desde que alguien lo pide hasta que se cierra. La solicitud ya no es otra
-- tabla: es el memo en sus primeros estados (no consume correlativo).
--
--   SOLICITADO → POR_EMITIR (la jefatura aprobó) → BORRADOR | ABIERTO
--   SOLICITADO → RECHAZADO | RETIRADO
--   BORRADOR → ABIERTO → EN_RENDICION → PRESENTADA → APROBADA → CONTABILIZADA → CERRADO
--   (OBSERVADA vuelve a rendición; ANULADO desde los primeros estados)
--
-- `memo_padre_id` y `ciclo_anterior_id` eran una sola columna
-- (memo_referido_id) con dos significados: el viático del que sale un
-- PASAJES, y el ciclo anterior de una caja chica.

create table memo (
  id                  uuid primary key default gen_random_uuid(),
  correlativo         text unique,         -- null mientras es solicitud; INROPRIN-2026-VIA-00012, o el histórico «594-2026»
  tipo                text not null check (tipo in ('VIATICOS', 'PASAJES', 'HOSPEDAJE', 'CAJA_CHICA', 'REEMBOLSO', 'OTRO')),
  estado              text not null default 'BORRADOR' check (estado in (
                        'SOLICITADO', 'POR_EMITIR', 'RECHAZADO', 'RETIRADO',
                        'BORRADOR', 'ABIERTO', 'EN_RENDICION', 'PRESENTADA', 'OBSERVADA',
                        'APROBADA', 'CONTABILIZADA', 'CERRADO', 'ANULADO')),
  empresa_ruc         char(11) not null references empresa(ruc),
  centro_costo_id     uuid not null references centro_costo(id),
  destino             text,
  motivo              text,
  -- Rango del anexo (mínimo y máximo de memo_persona); lo pone la función que guarda
  fecha_salida        date,
  fecha_retorno_prev  date,
  monto_autorizado    numeric(12,2) not null default 0 check (monto_autorizado >= 0),  -- suma del anexo; 0 sin adelanto
  moneda              char(3) not null default 'PEN',
  observacion         text,                -- la observación vigente (OBSERVADA)
  -- Caja chica y cadenas
  caja_chica_id       uuid references caja_chica(id),
  ciclo               text,                -- etiqueta tal como se escribe («036», «001-2025»); no ordena
  ciclo_anterior_id   uuid references memo(id),
  memo_padre_id       uuid references memo(id),
  -- La solicitud
  solicitante_id      uuid references usuario(id),
  jefatura_id         uuid references usuario(id),   -- quien debe responder, congelado al pedir
  respuesta           text,
  respondido_por      uuid references usuario(id),
  respondido_en       timestamptz,
  -- El recorrido
  creado_por          uuid not null references usuario(id),
  creado_en           timestamptz not null default now(),
  emitido_en          timestamptz,         -- cuando recibió correlativo
  presentado_en       timestamptz,
  aprobado_por        uuid references usuario(id),
  aprobado_en         timestamptz,
  contabilizado_en    timestamptz,
  cerrado_en          timestamptz,
  check (correlativo is not null or estado in ('SOLICITADO', 'POR_EMITIR', 'RECHAZADO', 'RETIRADO')),
  check (fecha_retorno_prev is null or fecha_salida is null or fecha_retorno_prev >= fecha_salida),
  check (ciclo_anterior_id is distinct from id and memo_padre_id is distinct from id),
  -- Una reposición de caja tiene su caja; la caja «invertida» (gasté primero) va sin adelanto.
  check (tipo <> 'CAJA_CHICA' or caja_chica_id is not null or monto_autorizado = 0)
);
create index memo_estado_ix        on memo (estado);
create index memo_centro_costo_ix  on memo (centro_costo_id);
create index memo_empresa_ix       on memo (empresa_ruc);
create index memo_caja_ix          on memo (caja_chica_id);
create index memo_ciclo_ix         on memo (ciclo_anterior_id);
create index memo_padre_ix         on memo (memo_padre_id);
create index memo_solicitante_ix   on memo (solicitante_id);
create index memo_jefatura_ix      on memo (jefatura_id);
create index memo_respondido_ix    on memo (respondido_por);
create index memo_creado_por_ix    on memo (creado_por);
create index memo_aprobado_por_ix  on memo (aprobado_por);
create index memo_vencimiento_ix   on memo (fecha_retorno_prev) where estado in ('ABIERTO', 'EN_RENDICION');
-- Una caja tiene a lo más un ciclo vivo (antes solo lo revisaba la app).
create unique index memo_un_ciclo_vivo_uq on memo (caja_chica_id)
  where caja_chica_id is not null and estado in ('ABIERTO', 'EN_RENDICION', 'PRESENTADA', 'OBSERVADA');

-- El anexo: a quién cubre el memo, cuánto le toca y su tramo de fechas.
-- El vencimiento de cada persona se mide contra SU fecha_hasta.
create table memo_persona (
  memo_id      uuid not null references memo(id) on delete cascade,
  usuario_id   uuid not null references usuario(id),
  monto        numeric(12,2) check (monto is null or monto > 0),   -- null: memos anteriores al anexo
  fecha_desde  date,
  fecha_hasta  date,
  descripcion  text,                       -- DESCRIPCIÓN (ENTREGA A RENDIR en caja chica)
  primary key (memo_id, usuario_id),
  check (fecha_hasta is null or fecha_desde is null or fecha_hasta >= fecha_desde)
);
create index memo_persona_usuario_ix on memo_persona (usuario_id);

-- Qué rol puede pasar un memo de qué estado a cuál (lo que pide una persona;
-- lo automático lo hacen las funciones). Espejo de estados.ts.
create table memo_transicion (
  desde  text not null,
  hacia  text not null,
  roles  text[] not null,
  primary key (desde, hacia)
);
insert into memo_transicion (desde, hacia, roles) values
  ('BORRADOR',     'ABIERTO',       '{ADMIN_MEMOS,ADMIN_SISTEMA}'),
  ('BORRADOR',     'ANULADO',       '{ADMIN_MEMOS,ADMIN_SISTEMA}'),
  ('ABIERTO',      'ANULADO',       '{ADMIN_MEMOS,ADMIN_SISTEMA}'),
  ('EN_RENDICION', 'ANULADO',       '{ADMIN_MEMOS,ADMIN_SISTEMA}'),
  ('PRESENTADA',   'OBSERVADA',     '{REVISOR_COSTOS,CONTABILIDAD,ADMIN_SISTEMA}'),
  ('PRESENTADA',   'APROBADA',      '{REVISOR_COSTOS,ADMIN_SISTEMA}'),
  ('APROBADA',     'OBSERVADA',     '{CONTABILIDAD,ADMIN_SISTEMA}'),
  ('APROBADA',     'CONTABILIZADA', '{CONTABILIDAD,ADMIN_SISTEMA}');
-- Presentar (ABIERTO | EN_RENDICION | OBSERVADA → PRESENTADA) tiene su propia
-- función: no depende del rol sino de estar en el anexo.

-- La numeración: una fila por empresa, año y tipo.
create table memo_correlativo (
  empresa_ruc  char(11) not null references empresa(ruc),
  anio         smallint not null,
  tipo         text not null,
  ultimo       integer not null default 0,
  primary key (empresa_ruc, anio, tipo)
);

-- El visto bueno de la jefatura para abrirle un memo a quien tiene
-- rendiciones vencidas. Guarda el monto que se autorizó: si el memo cambia
-- de monto, hay que volver a pedirlo.
create table memo_autorizacion (
  id              uuid primary key default gen_random_uuid(),
  memo_id         uuid not null references memo(id) on delete cascade,
  jefe_id         uuid not null references usuario(id),
  solicitada_por  uuid not null references usuario(id),
  monto           numeric(12,2) not null,
  motivo          text not null,
  estado          text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'CONCEDIDA', 'RECHAZADA')),
  respuesta       text,
  resuelta_en     timestamptz,
  creado_en       timestamptz not null default now(),
  unique (memo_id, jefe_id)
);
create index memo_autorizacion_jefe_ix      on memo_autorizacion (jefe_id);
create index memo_autorizacion_solicitante_ix on memo_autorizacion (solicitada_por);

-- ── Movilidad ───────────────────────────────────────────────────
-- La planilla de movilidad (el talonario físico); sus filas son gastos de
-- clase MOVILIDAD. La firma de la jefatura es autorizado_por.

create table planilla_movilidad (
  id              uuid primary key default gen_random_uuid(),
  numero          text unique,             -- número impreso del talonario
  usuario_id      uuid not null references usuario(id),
  memo_id         uuid references memo(id) on delete set null,
  periodo         integer check (periodo between 200001 and 209912),
  fecha_emision   date,
  autorizado_por  uuid references usuario(id),
  autorizado_en   timestamptz,
  creado_por      uuid references usuario(id),
  creado_en       timestamptz not null default now(),
  check (autorizado_por is distinct from usuario_id)     -- nadie firma la suya
);
create index planilla_movilidad_usuario_ix    on planilla_movilidad (usuario_id);
create index planilla_movilidad_memo_ix       on planilla_movilidad (memo_id);
create index planilla_movilidad_autorizado_ix on planilla_movilidad (autorizado_por);
create index planilla_movilidad_creado_ix     on planilla_movilidad (creado_por);

-- ── Gasto ───────────────────────────────────────────────────────
-- Lo que la persona rinde: un comprobante, una declaración jurada o una
-- fila de movilidad. Guarda lo que DECLARÓ (puede no coincidir con SUNAT:
-- eso es justamente lo que se revisa); cuando la factura aparece en SUNAT,
-- comprobante_id la une y el «rendido por» de la hoja de SUNAT sale de aquí.
-- El nombre del proveedor está en contribuyente.

create table gasto (
  id                    uuid primary key default gen_random_uuid(),
  client_id             text not null unique,        -- lo genera el dispositivo: reintentar no duplica
  memo_id               uuid references memo(id),    -- null = bandeja sin asignar
  usuario_id            uuid not null references usuario(id),
  estado                text not null default 'CAPTURADO' check (estado in (
                          'CAPTURADO', 'EXTRAIDO', 'ERROR_EXTRACCION', 'CON_ALERTA', 'VALIDADO',
                          'PRESENTADO', 'OBSERVADO', 'APROBADO', 'CONTABILIZADO')),
  clase                 text not null default 'COMPROBANTE' check (clase in ('COMPROBANTE', 'DECLARACION_JURADA', 'MOVILIDAD')),
  -- El comprobante, como lo declaró la persona
  proveedor_ruc         text references contribuyente(ruc),
  tipo                  char(2),                     -- 00, 01, 03, 07, 08, 12…
  serie                 text,
  numero                text,
  fecha_emision         date,
  moneda                char(3) not null default 'PEN',
  tipo_cambio           numeric(8,4),
  subtotal              numeric(12,2),
  igv                   numeric(12,2),
  total                 numeric(12,2),
  forma_pago            text,
  detalle               text,
  adquiriente_ruc       text,                        -- a nombre de quién se emitió (debe ser la empresa)
  comprobante_id        uuid references comprobante(id),   -- la factura en SUNAT, si ya está
  -- Movilidad y declaración jurada
  motivo                text,
  destino               text,                        -- el recorrido o el lugar
  planilla_movilidad_id uuid references planilla_movilidad(id) on delete set null,
  -- Control
  confianza_extraccion  jsonb,                       -- {campo: 0..1}
  alertas               jsonb not null default '[]', -- [{codigo, severidad, mensaje, campo}]
  alertas_confirmadas   boolean not null default false,
  hash_imagen           text unique,
  observacion           text,                        -- motivo del revisor
  drive_id              text,
  drive_error           text,
  capturado_en          timestamptz,                 -- reloj del dispositivo
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);
create index gasto_memo_ix        on gasto (memo_id);
create index gasto_usuario_ix     on gasto (usuario_id);
create index gasto_proveedor_ix   on gasto (proveedor_ruc);
create index gasto_comprobante_ix on gasto (comprobante_id);
create index gasto_planilla_ix    on gasto (planilla_movilidad_id);
-- El mismo comprobante no se rinde dos veces.
create unique index gasto_comprobante_uq on gasto (proveedor_ruc, serie, numero)
  where clase = 'COMPROBANTE' and proveedor_ruc is not null and serie is not null and numero is not null;

-- ── Liquidación ─────────────────────────────────────────────────
-- El cierre de cuentas con una persona. Los totales son la suma de sus
-- líneas (antes se copiaban en la cabecera). Neto positivo: la persona
-- devuelve; negativo: la empresa le reembolsa.

create table liquidacion (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references usuario(id),
  estado       text not null default 'EMITIDA' check (estado in ('EMITIDA', 'PAGADA', 'ANULADA')),
  emitida_por  uuid not null references usuario(id),
  emitida_en   timestamptz not null default now(),
  referencia   text,                       -- nº de operación o voucher del pago
  pagada_por   uuid references usuario(id),
  pagada_en    timestamptz,
  anulada_por  uuid references usuario(id),
  anulada_en   timestamptz,
  observacion  text
);
create index liquidacion_usuario_ix on liquidacion (usuario_id);
create index liquidacion_emitida_ix on liquidacion (emitida_por);
create index liquidacion_pagada_ix  on liquidacion (pagada_por);
create index liquidacion_anulada_ix on liquidacion (anulada_por);

-- Una línea por memo liquidado, con lo autorizado y lo rendido congelados al
-- emitir. `usuario_id` y `vigente` están para que la base garantice que un
-- memo entra en UNA sola liquidación vigente por persona (antes, un trigger).
create table liquidacion_memo (
  liquidacion_id  uuid not null references liquidacion(id) on delete cascade,
  memo_id         uuid not null references memo(id),
  usuario_id      uuid not null references usuario(id),
  autorizado      numeric(12,2) not null,
  rendido         numeric(12,2) not null,
  saldo           numeric(12,2) generated always as (autorizado - rendido) stored,
  vigente         boolean not null default true,     -- false cuando se anula la liquidación
  primary key (liquidacion_id, memo_id)
);
create index liquidacion_memo_memo_ix    on liquidacion_memo (memo_id);
create index liquidacion_memo_usuario_ix on liquidacion_memo (usuario_id);
create unique index liquidacion_memo_vigente_uq on liquidacion_memo (memo_id, usuario_id) where vigente;

-- ── Pagos y devoluciones ────────────────────────────────────────
-- La constancia de pago de un memo: una planilla por banco, con una línea
-- por persona. procesada = false: el banco la rechazó (no cobró, no rinde).

create table pago (
  id              uuid primary key default gen_random_uuid(),
  memo_id         uuid not null references memo(id) on delete cascade,
  banco           text not null,
  planilla        text,                    -- nº de planilla de haberes
  fecha           date,
  drive_id        text,
  registrado_por  uuid references usuario(id),
  registrado_en   timestamptz not null default now()
);
create index pago_memo_ix       on pago (memo_id);
create index pago_registrado_ix on pago (registrado_por);
create unique index pago_planilla_uq on pago (banco, planilla) where planilla is not null;

create table pago_linea (
  pago_id     uuid not null references pago(id) on delete cascade,
  usuario_id  uuid not null references usuario(id),
  monto       numeric(12,2) not null check (monto > 0),
  procesada   boolean not null default true,
  motivo      text,
  primary key (pago_id, usuario_id)
);
create index pago_linea_usuario_ix on pago_linea (usuario_id);

-- Dinero que vuelve a la empresa (el saldo no gastado), por persona.
create table devolucion (
  id              uuid primary key default gen_random_uuid(),
  memo_id         uuid not null references memo(id) on delete cascade,
  usuario_id      uuid not null references usuario(id),
  monto           numeric(12,2) not null check (monto > 0),
  operacion       text unique,             -- nº de operación del depósito
  fecha           date not null,
  drive_id        text,                    -- la captura del depósito
  nota            text,
  registrado_por  uuid references usuario(id),
  registrado_en   timestamptz not null default now()
);
create index devolucion_memo_ix       on devolucion (memo_id);
create index devolucion_usuario_ix    on devolucion (usuario_id);
create index devolucion_registrado_ix on devolucion (registrado_por);
