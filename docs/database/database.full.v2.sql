-- ════════════════════════════════════════════════════════════════
-- database.full.v2.sql — GENERADO, no editar a mano (pnpm db:consolidar --v2)
-- 12 migraciones: 001_nucleo.sql → 012_nada_queda_fuera.sql
-- huella: c478041fb5d7e407
--
-- Aplicar sobre una base VACÍA (proyecto nuevo de Supabase): SQL Editor →
-- pegar todo → Run. Para una base existente, aplicar solo las migraciones
-- que falten, una por una, desde docs/database/v2/.
-- ════════════════════════════════════════════════════════════════


-- ┌──────────────────────────────────────────────────────────────
-- │ 001_nucleo.sql
-- └──────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════
-- 001 · NÚCLEO
-- Empresa, centros de costo, corridas de los jobs e historial de cambios.
--
-- Todo en `public`. Cada tabla se llama como lo que es; las hijas llevan el
-- nombre del padre (comprobante → comprobante_item). Sin triggers.
--
-- Las personas, roles y áreas están en 006 (viáticos): INROCONTA no las
-- usa. Su app web entra con Google (@inroprin.com) y saca permisos de la
-- pestaña USUARIOS del libro (src/shared/auth/access.ts).
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


-- ┌──────────────────────────────────────────────────────────────
-- │ 002_comprobantes.sql
-- └──────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════
-- 002 · CONTRIBUYENTES Y COMPROBANTES
--
-- Antes (7 tablas, datos repetidos)        Ahora
--   padron_ruc + ruc_domicilio            → contribuyente (una fila por RUC, con `ssco` sí/no)
--   ruc_ssco                              → lista_ssco (el Excel de SUNAT, tal cual)
--   cpe_comprobante + lo común del SIRE   → comprobante (una fila por documento)
--   comprobantes_sunat                    → registro_compras (una fila por mes en que se anota)
--   cpe_item, cpe_cuota                   → comprobante_item, comprobante_cuota
--   detraccion_constancia                 → detraccion_constancia
--   retencion_comprobante                 → retencion_comprobante (con FK a contribuyente)
--   retencion_documento                   → retencion_documento (con FK a comprobante)
--   cambios_comprobante_sunat             → cambio (entidad 'registro_compras')
--
-- Por qué comprobante y registro_compras son dos tablas: el Registro de
-- Compras (SIRE) es POR MES. Una DUA (tipo 53) se anota en varios meses a
-- medida que se aplica el crédito fiscal (migración 018). El comprobante es
-- uno; sus líneas en el registro son N. Lo que es del comprobante (emisor,
-- fecha, serie, moneda, a qué nota modifica) vive solo en `comprobante`;
-- `registro_compras` guarda solo lo de esa línea (mes, CAR, estado, bases e
-- IGV declarados).
-- ════════════════════════════════════════════════════════════════

-- ── Contribuyente ───────────────────────────────────────────────
-- Cada RUC con el que tratamos: aparece en un comprobante, una OC o un
-- gasto. Una fila por RUC con todo lo que se sabe de él (antes estaba
-- partido entre padron_ruc y ruc_domicilio).
--
-- `ssco` dice si está en la lista de sujetos sin capacidad operativa. Lo
-- pone load_ssco al cargar la lista (se calcula al guardar, no al leer); el
-- detalle (resolución, fechas, representante) está en `lista_ssco`.
--
-- Cada fuente tiene su sello de tiempo, para refrescar solo lo vencido:
--   padron_en     Consulta RUC pública (buen contribuyente, agentes)  → cada 30 días
--   ficha_en      Ficha completa de la Consulta RUC                   → al abrirla
--   domicilio_en  Padrón reducido (dirección, ubigeo)                 → semanal

create table contribuyente (
  ruc                     text primary key,      -- RUC, o DNI/otro si no tiene RUC
  tipo_documento          char(1) not null default '6'
                          check (tipo_documento in ('0','1','4','6','7','A')), -- catálogo 06 SUNAT
  razon_social            text,
  nombre_comercial        text,
  tipo_contribuyente      text,
  estado                  text,                  -- ACTIVO, BAJA DE OFICIO…
  condicion               text,                  -- HABIDO, NO HABIDO…

  -- Padrones
  buen_contribuyente      boolean,
  agente_retencion        boolean,
  agente_percepcion       boolean,
  padrones_detalle        text,
  ssco                    boolean not null default false,

  -- Domicilio fiscal (padrón reducido; si no hay, el de la ficha)
  direccion               text,
  ubigeo                  char(6),
  departamento            text,
  provincia               text,
  distrito                text,

  -- Ficha completa de la Consulta RUC
  fecha_inscripcion       date,
  fecha_inicio_actividades date,
  fecha_baja              date,
  sistema_emision         text,
  comercio_exterior       text,
  sistema_contabilidad    text,
  actividades             jsonb,
  comprobantes_impresion  jsonb,
  emision_electronica     jsonb,
  emisor_electronico_desde date,
  comprobantes_electronicos text,
  ple_desde               date,
  aviso                   text,

  -- Sellos por fuente
  visto_en                timestamptz not null default now(),
  padron_en               timestamptz,
  ficha_en                timestamptz,
  domicilio_en            timestamptz,

  check (tipo_documento <> '6' or ruc ~ '^\d{11}$')
);
create index contribuyente_padron_ix on contribuyente (padron_en nulls first)
  where tipo_documento = '6';

-- ── Lista SSCO ──────────────────────────────────────────────────
-- El Excel de sujetos sin capacidad operativa que publica SUNAT, tal cual
-- (~770 RUC de todo el país, casi ninguno nuestro). La «Consulta RUC» de la
-- app busca en ella cualquier RUC. Se reemplaza entera en cada carga
-- (load_ssco), que en la misma transacción marca `contribuyente.ssco`.
-- Sin FK a contribuyente: la mayoría no son nuestros.

create table lista_ssco (
  ruc                      char(11) primary key check (ruc ~ '^\d{11}$'),
  razon_social             text not null,
  domicilio                text,
  resolucion               text not null,
  resolucion_fecha         date,
  firme_desde              date,      -- cuando la atribución quedó firme
  publicado_el             date,      -- cuando SUNAT lo puso en la lista
  representante_documento  text,
  representante_nombre     text,
  cargado_en               timestamptz not null default now()
);

-- ── Comprobante ─────────────────────────────────────────────────
-- Factura, boleta, nota o DUA: uno solo aunque el Registro de Compras lo
-- anote en varios meses. Lo crea quien lo vea primero (SIRE o XML) y lo
-- completa el otro. Es compras y ventas (`origen`).
-- Llave: empresa + emisor + tipo + serie + número (número sin ceros a la
-- izquierda, serie en mayúsculas — lo normaliza la función que guarda).
--
-- Las columnas de descarga reemplazan el cruce SIRE vs cpe_comprobante que
-- hacían pendientes() y cobertura_cpe() en cada corrida, y el archivo local
-- de «no existe»: lo que falta bajar es `where xml_estado = 'PENDIENTE'`.

create table comprobante (
  id                      uuid primary key default gen_random_uuid(),
  empresa_ruc             char(11) not null references empresa(ruc),
  origen                  text not null check (origen in ('RECIBIDO', 'EMITIDO')),

  emisor_ruc              text not null references contribuyente(ruc),
  receptor_ruc            text references contribuyente(ruc),
  tipo                    char(2) not null,      -- catálogo 01 SUNAT: 01, 03, 07, 08, 53…
  serie                   text not null,
  numero                  text not null,
  fecha_emision           date,
  periodo                 integer generated always as
                          ((extract(year from fecha_emision) * 100
                            + extract(month from fecha_emision))::integer) stored,

  -- Importes del XML (sin XML quedan vacíos: lo declarado está en registro_compras)
  moneda                  char(3),
  subtotal                numeric(14,2),
  igv                     numeric(14,2),
  total                   numeric(14,2),
  anticipo_aplicado       numeric(14,2),
  -- En soles. El script manda el tipo de cambio del día (antes
  -- cuadre_ventas_json lo buscaba con mode() en cada lectura) y la base
  -- multiplica sola: columnas generadas, sin trigger. Null si falta el TC.
  tipo_cambio             numeric(8,4),
  subtotal_pen            numeric(14,2) generated always as
                          (round(subtotal * case when moneda = 'PEN' then 1 else tipo_cambio end, 2)) stored,
  igv_pen                 numeric(14,2) generated always as
                          (round(igv * case when moneda = 'PEN' then 1 else tipo_cambio end, 2)) stored,
  total_pen               numeric(14,2) generated always as
                          (round(total * case when moneda = 'PEN' then 1 else tipo_cambio end, 2)) stored,
  anticipo_pen            numeric(14,2) generated always as
                          (round(anticipo_aplicado * case when moneda = 'PEN' then 1 else tipo_cambio end, 2)) stored,

  forma_pago              text,                  -- Contado / Credito
  guia_remision           text,
  orden_compra_xml        text,                  -- la OC tal como la escribió el emisor

  -- Detracción declarada en el XML
  detraccion_codigo       text,
  detraccion_porcentaje   numeric(5,2),
  detraccion_monto        numeric(14,2),
  detraccion_cuenta       text,

  -- Nota de crédito/débito: a qué comprobante modifica
  tipo_nota               text,
  modifica_tipo           char(2),
  modifica_serie          text,
  modifica_numero         text,
  modifica_fecha          date,

  -- Descarga del XML y el PDF
  xml_estado              text not null default 'PENDIENTE'
                          check (xml_estado in ('PENDIENTE', 'OK', 'NO_EXISTE', 'ERROR', 'NO_APLICA')),
  xml_drive_id            text,
  pdf_drive_id            text,
  xml_en                  timestamptz,
  pdf_en                  timestamptz,
  descarga_intentos       smallint not null default 0,
  descarga_error          text,
  descarga_ultimo_intento timestamptz,

  -- Factura sin OC (lo calcula el script de carpetas junto con comprobante_oc;
  -- antes facturas_sin_oc() lo recalculaba cruzando todo en cada lectura)
  sin_oc_senal            text check (sin_oc_senal in ('ALTA', 'MEDIA')),
  sin_oc_razon            text,                  -- 'el proveedor trabaja con OC', 'gasto típico: combustible'…
  area_probable           text,
  oc_calculado_en         timestamptz,

  creado_en               timestamptz not null default now(),
  actualizado_en          timestamptz not null default now(),

  unique (empresa_ruc, emisor_ruc, tipo, serie, numero),
  check (serie = upper(serie)),
  check (numero !~ '^0')
);
create index comprobante_periodo_ix   on comprobante (empresa_ruc, periodo, origen);
create index comprobante_pendiente_ix on comprobante (empresa_ruc, fecha_emision desc)
  where xml_estado in ('PENDIENTE', 'ERROR') or (xml_estado = 'OK' and pdf_drive_id is null);
create index comprobante_emisor_ix    on comprobante (emisor_ruc);
create index comprobante_receptor_ix  on comprobante (receptor_ruc);
create index comprobante_sin_oc_ix    on comprobante (empresa_ruc, sin_oc_senal)
  where sin_oc_senal is not null;
create index comprobante_modifica_ix  on comprobante (empresa_ruc, emisor_ruc, modifica_serie, modifica_numero)
  where modifica_numero is not null;

-- ── Registro de Compras ─────────────────────────────────────────
-- Cada línea del Registro de Compras (SIRE) de cada mes. La llave es el CAR
-- SUNAT si vino; si no, emisor|tipo|serie|número (la arma la función).
-- `total` y las bases son lo DECLARADO en ese mes: en una DUA cambian de un
-- mes a otro, por eso no se confunden con el total del comprobante.

create table registro_compras (
  id              uuid primary key default gen_random_uuid(),
  empresa_ruc     char(11) not null references empresa(ruc),
  periodo         integer not null,
  llave           text not null,
  car_sunat       text,
  comprobante_id  uuid not null references comprobante(id),
  estado          text,
  total           numeric(14,2),
  tipo_cambio     numeric(8,4),
  base_dg         numeric(14,2),
  igv_dg          numeric(14,2),
  base_dgng       numeric(14,2),
  igv_dgng        numeric(14,2),
  base_dng        numeric(14,2),
  igv_dng         numeric(14,2),
  detraccion      numeric(14,2),
  primera_vez     timestamptz not null default now(),
  ultima_vez      timestamptz not null default now(),
  unique (empresa_ruc, periodo, llave)
);
create index registro_compras_comprobante_ix on registro_compras (comprobante_id);

-- ── Ítems y cuotas ──────────────────────────────────────────────
-- Llave natural (comprobante, línea): no hace falta un uuid por ítem.
-- guardar_cpe los reemplaza enteros cuando llega el XML de nuevo.

create table comprobante_item (
  comprobante_id   uuid not null references comprobante(id) on delete cascade,
  linea            integer not null,
  descripcion      text,
  cantidad         numeric(14,4),
  unidad           text,                  -- NIU, GLL, ZZ…
  precio_unitario  numeric(14,4),
  importe          numeric(14,2),
  primary key (comprobante_id, linea)
);

create table comprobante_cuota (
  comprobante_id     uuid not null references comprobante(id) on delete cascade,
  numero             integer not null,
  monto              numeric(14,2),
  fecha_vencimiento  date,
  primary key (comprobante_id, numero)
);

-- ── Constancias de detracción (SPOT) ────────────────────────────
-- Una por número de constancia. `comprobante_id` lo resuelve
-- guardar_detracciones (emisor + tipo + serie + número); si la factura aún no
-- está, queda null y se completa en la siguiente corrida. Así «facturas con
-- detracción sin constancia» es un select con `not exists`, no un cruce por
-- texto. Proveedor y adquiriente apuntan a `contribuyente` (ahí están sus
-- nombres y su tipo de documento).

create table detraccion_constancia (
  numero_constancia         text primary key,
  empresa_ruc               char(11) not null references empresa(ruc),
  sentido                   text not null check (sentido in ('COMPRA', 'VENTA')),
  comprobante_id            uuid references comprobante(id),
  -- El comprobante como lo dice la constancia (por si aún no está en la base)
  emisor_ruc                text references contribuyente(ruc),   -- el proveedor
  tipo                      char(2),
  serie                     text,
  numero                    text,
  adquiriente_ruc           text references contribuyente(ruc),   -- en VENTA, el cliente
  -- Depósito
  tipo_cuenta               text,
  numero_cuenta             text,
  fecha_pago                date,
  fecha_hora_pago           timestamptz,
  periodo                   integer,
  tipo_operacion            text,
  codigo_bien_servicio      text,
  monto                     numeric(14,2),
  numero_operacion          text,
  numero_pago_detracciones  text,
  -- Cómo se obtuvo y dónde quedó
  origen                    text,
  usuario_sol               text,
  tipo_consulta             text,
  pdf_drive_id              text,
  html_drive_id             text,
  primera_vez               timestamptz not null default now(),
  ultima_vez                timestamptz not null default now()
);
create index detraccion_constancia_comprobante_ix on detraccion_constancia (comprobante_id);
create index detraccion_constancia_emisor_ix      on detraccion_constancia (emisor_ruc, serie, numero);
create index detraccion_constancia_adquiriente_ix on detraccion_constancia (adquiriente_ruc);

-- ── Comprobantes de retención del IGV (CRE) ─────────────────────
-- INROPRIN es agente de retención: al pagar a un proveedor le retiene el
-- 3 % y emite un CRE (serie E001). Una fila por CRE; sus facturas en
-- retencion_documento. Es muchos a muchos: un CRE cubre varias facturas y
-- una factura pagada en partes tiene varios CRE. Una factura tiene
-- detracción o retención, no las dos (eso lo revisa quien arma el libro).
-- Lo llena scripts/local/retenciones/retenciones.mts (guardar_retenciones, 004).

create table retencion_comprobante (
  id                uuid primary key default gen_random_uuid(),
  empresa_ruc       char(11) not null references empresa(ruc),
  sentido           text not null check (sentido in ('COMPRA', 'VENTA')),  -- COMPRA: lo emitimos al pagar
  emisor_ruc        text not null references contribuyente(ruc),
  receptor_ruc      text references contribuyente(ruc),     -- el proveedor (su nombre está en contribuyente)
  serie             text not null,
  numero            integer not null,
  fecha_emision     date,
  periodo           integer,
  regimen           text,
  monto_base        numeric(14,2),
  monto_retenido    numeric(14,2),
  monto_pagado      numeric(14,2),
  estado            text not null check (estado in ('EMITIDO', 'REVERTIDO')),
  fecha_reversion   date,
  motivo_reversion  text,
  ticket            text,
  pdf_drive_id      text,
  xml_drive_id      text,
  primera_vez       timestamptz not null default now(),
  ultima_vez        timestamptz not null default now(),
  unique (emisor_ruc, serie, numero, empresa_ruc)   -- emisor primero: sirve también de índice de su FK
);
create index retencion_comprobante_receptor_ix on retencion_comprobante (receptor_ruc);

-- Cada factura (o nota de débito) que cubre un CRE, con el pago y lo
-- retenido. `comprobante_id` lo resuelve guardar_retenciones; si la
-- factura aún no está en la base queda null y se completa en la siguiente
-- corrida (por eso se guardan también tipo, serie y número). La fecha, el
-- total y la moneda de la factura están en `comprobante`: no se repiten.

create table retencion_documento (
  retencion_id      uuid not null references retencion_comprobante(id) on delete cascade,
  tipo              char(2) not null,
  serie             text not null,
  numero            text not null,
  numero_pago       text not null default '1',
  comprobante_id    uuid references comprobante(id),
  fecha_pago        date,
  monto_pago        numeric(14,2),
  moneda_pago       char(3),
  monto_retenido    numeric(14,2),
  fecha_retencion   date,
  monto_pagado      numeric(14,2),
  tipo_cambio       numeric(12,6),
  primary key (retencion_id, tipo, serie, numero, numero_pago)
);
create index retencion_documento_comprobante_ix on retencion_documento (comprobante_id);
create index retencion_documento_sin_comprobante_ix on retencion_documento (tipo, serie, numero)
  where comprobante_id is null;


-- ┌──────────────────────────────────────────────────────────────
-- │ 003_ordenes_de_compra.sql
-- └──────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════
-- 003 · ÓRDENES DE COMPRA, CARPETAS, ARCHIVOS Y VÍNCULO CON FACTURAS
--
-- Antes (14 tablas, sin una sola FK)              Ahora
--   oc_legajo + fuente_compra_oc + fuente_comex_oc
--     + lo resuelto de oc_carpeta ................ orden_compra (una fila por OC)
--   oc_base_cg ................................... orden_compra_centro_costo (OC × centro de costo)
--   fuente_comex_oc.duas (jsonb) ................. orden_compra_dua
--   kardex_vale .................................. vale_almacen
--   oc_carpeta ................................... carpeta_oc (una fila por carpeta de Drive)
--   oc_archivo (×3 orígenes) + lectura_archivo ... archivo (una fila por archivo de Drive)
--
-- CAPTURA se retira (decisión 14/10/2026): era manual (última carga 29/09) y
-- solo 6 de 1 628 facturas con OC dependían de ella. Lo que sí aportaba, la
-- base de Control de Gestión (centro de costo de cada OC), pasa a cargarla
-- el workflow junto con Compras, COMEX y Almacén → orden_compra_centro_costo.
-- Quedan dos recorridos: CARPETA (workflow carpetas-oc, 98,5 % de los
-- vínculos) y LEGAJO (LegajoPorOC.gs cada noche: cuadro de aprobaciones).
--   vinculos_oc() calculado en cada lectura ...... comprobante_oc (guardado)
--   facturas_sin_oc() calculado en cada lectura .. columnas sin_oc_* en comprobante
--   proyecto_centro_costo ........................ regla_centro_costo
--   proveedor_sin_oc ............................. proveedor_sin_oc
--   carpeta_cambio + fuente_cambio ............... cambio (01)
--   fuente_copia ................................. corrida (01, job 'copia-fuentes')
--   equivalencia_centro_costo .................... centro_costo.concar_codigo (01)
--
-- Quién calcula qué: TODO lo derivado (vínculo factura↔OC, centro de costo,
-- qué le falta al legajo, señal de factura sin OC, cambios) lo calcula el
-- script en TypeScript (carpetas-oc.mts / fuentes-compras.mts, en Actions o
-- en la laptop) y lo manda hecho. La regla del legajo queda en UN lugar
-- (src/shared/lib/drive/legajo-carpeta.ts); hoy está en TS, Apps Script y
-- SQL con listas distintas.
-- ════════════════════════════════════════════════════════════════

-- ── Orden de compra ─────────────────────────────────────────────
-- La OC lógica: antes no existía como tabla, estaba repartida en cinco.
-- Identidad: empresa + procedencia + número + año. La procedencia es parte
-- de la llave porque son numeraciones distintas: la nacional 0172-2026 y la
-- importación 172-2026 son dos OC (el SQL viejo las juntaba al rellenar
-- siempre a 4 dígitos). `numero` va sin relleno ('172', '1296.1') y
-- `codigo` es como se escribe en las hojas.
--
-- Cada fuente llena SU bloque de columnas y su sello de tiempo
-- (guardar_fuente_oc, 005). Lo que varias fuentes dicen de lo mismo
-- (proveedor, fecha, monto, comprador, centro de costo) va en las columnas
-- «resueltas», con `*_segun` diciendo de dónde salió y una preferencia fija,
-- así el resultado no depende de qué fuente se cargó primero:
--   datos (proveedor, fecha, moneda, monto)  COMPRAS > LEGAJO > COMEX > CG
--   comprador                                LEGAJO > COMEX > COMPRAS
--   centro de costo                          LEGAJO > lo que calcula el script
--                                            (CG, PROYECTO, NOMBRE, …)

create table orden_compra (
  id                  uuid primary key default gen_random_uuid(),
  empresa_ruc         char(11) not null references empresa(ruc),
  procedencia         text not null check (procedencia in ('NACIONAL', 'IMPORTACION')),
  numero              text not null check (numero ~ '^[1-9]\d*(\.\d+)?$'),
  anio                smallint not null check (anio between 2000 and 2099),
  -- Como se escribe en las hojas: 0172-2026 (nacional), 172-2026 (importación).
  -- lpad corta lo que es más largo, por eso el greatest().
  codigo              text generated always as (
                        lpad(numero, greatest(case when procedencia = 'NACIONAL' then 4 else 3 end,
                                              length(numero)), '0') || '-' || anio) stored,
  tipo                text check (tipo in ('OC', 'OS')),    -- bien o servicio
  consorcio           text,          -- la empresa real si es de un consorcio (Compras/COMEX)

  -- Lo resuelto
  proveedor_ruc       text references contribuyente(ruc),
  proveedor_nombre    text,          -- como lo escribe la fuente (el del exterior no tiene RUC)
  fecha_oc            date,
  moneda              char(3),
  monto               numeric(14,2),
  monto_pen           numeric(14,2),
  datos_segun         text check (datos_segun in ('COMPRAS', 'LEGAJO', 'COMEX', 'CG')),
  comprador           text,
  comprador_segun     text check (comprador_segun in ('LEGAJO', 'COMEX', 'COMPRAS')),
  area                text,          -- Compras nacionales / COMEX
  centro_costo_id     uuid references centro_costo(id),
  centro_costo_segun  text check (centro_costo_segun in
                        ('LEGAJO', 'CG', 'CUADRO', 'PROYECTO', 'NOMBRE', 'ADMINISTRATIVO', 'MANUAL', 'SIN_ASIGNAR')),
  centros_costo_n     smallint,      -- en cuántos centros de costo reparte (CG)

  -- Cuadro de aprobaciones (LegajoPorOC.gs → SubirLegajo.gs)
  situacion_pago      text,          -- PAGADA, APROBADA PAGO PENDIENTE, ANULADA…
  estatus             text,
  estado_aprobacion   text,
  forma_pago          text,
  legajo_revision     text,          -- OK, PENDIENTE, SIN ACCESO, SIN CARPETA
  legajo_le_falta     text[],        -- lo que el legajo dice que falta

  -- Base de Compras (nacionales e IMPO - BASE)
  requerimiento       text,
  solicitado          text,
  elaborado           text,
  proyecto            text,
  concepto            text,
  condicion_pago      text,
  incoterm            text,
  lugar_entrega       text,
  tiempo_entrega      text,
  items               integer,

  -- STATUS de COMEX (importaciones)
  comex_estado        text,
  comex_origen        text,
  modalidad           text,
  operador            text,
  awb_bl              text,
  etd                 date,
  eta                 date,
  ata                 date,
  llegada_planta_prevista date,
  llegada_planta      date,
  agente_aduanas      text,
  documentos_enviados text,
  dam                 text,
  costeo              text,
  embarques           smallint,
  comex_observaciones text,

  -- Estado del legajo, sobre todas sus carpetas (lo calcula el script)
  legajo_estado       text check (legajo_estado in ('COMPLETO', 'FALTA', 'POR_SUBIR', 'FALTA_Y_POR_SUBIR', 'VACIA', 'SIN_CARPETA')),
  le_falta            text[],        -- {'Guía de remisión','DAM'}
  por_subir           text[],        -- falta en la carpeta pero hay rastro en otra fuente
  ingreso_almacen     date,

  -- Sellos por fuente
  compras_en          timestamptz,
  comex_en            timestamptz,
  legajo_en           timestamptz,
  cg_en               timestamptz,
  calculado_en        timestamptz,

  unique (empresa_ruc, procedencia, numero, anio)
);
create index orden_compra_codigo_ix    on orden_compra (empresa_ruc, codigo);
create index orden_compra_proveedor_ix on orden_compra (proveedor_ruc);
create index orden_compra_cc_ix        on orden_compra (centro_costo_id);

-- Las líneas de la base de Control de Gestión, agrupadas por centro de costo.
-- Una OC puede repartirse en varios; el principal es el de más líneas.
create table orden_compra_centro_costo (
  orden_compra_id  uuid not null references orden_compra(id) on delete cascade,
  centro_costo_id  uuid not null references centro_costo(id),
  monto            numeric(14,2),
  lineas           integer not null default 1,
  principal        boolean not null default false,
  primary key (orden_compra_id, centro_costo_id)
);
create index orden_compra_cc_cc_ix on orden_compra_centro_costo (centro_costo_id);
create unique index orden_compra_cc_principal_uq
  on orden_compra_centro_costo (orden_compra_id) where principal;

-- Las DUA de una importación (antes un jsonb dentro de COMEX).
create table orden_compra_dua (
  orden_compra_id  uuid not null references orden_compra(id) on delete cascade,
  dua              text not null,
  fecha            date,
  encargado        text,
  subio_oc         boolean,
  fecha_subida     date,
  observacion      text,
  primary key (orden_compra_id, dua)
);

-- ── Vale de almacén ─────────────────────────────────────────────
-- El kardex de Almacén. La OC se resuelve al cargar (el script deduce la
-- procedencia del texto de la operación); queda null si no calza.

create table vale_almacen (
  id                text primary key,           -- id del kardex
  empresa_ruc       char(11) not null references empresa(ruc),
  orden_compra_id   uuid references orden_compra(id),
  vale              text,
  fecha_registro    date,
  fecha_operacion   date,
  movimiento        text,                       -- INGRESO / SALIDA
  operacion         text,
  proveedor         text,
  tipo_documento    text,
  numero_documento  text,                       -- guía o factura
  tipo_orden        text,
  numero_orden      text,                       -- como viene en el kardex
  proyecto          text,
  sede              text,
  responsable       text,
  recepcionado      text,
  documento_ruta    text,
  documento_url     text,
  vale_url          text,
  items             integer,
  cantidad          numeric(14,4),
  visto_desde       timestamptz not null default now(),
  cargado_en        timestamptz not null default now()
);
create index vale_almacen_oc_ix on vale_almacen (orden_compra_id);

-- ── Carpeta de OC ───────────────────────────────────────────────
-- Una carpeta de Drive con documentos de una OC. Una OC puede tener varias
-- (los gastos de una importación llevan su número; carpetas duplicadas):
-- por eso es su propia tabla y no columnas de orden_compra.
-- Llave: el id de Drive (antes: la URL completa, unida por regex).

create table carpeta_oc (
  drive_id          text primary key,
  orden_compra_id   uuid references orden_compra(id),   -- null si el nombre no dice la OC
  empresa_ruc       char(11) not null references empresa(ruc),
  procedencia       text not null check (procedencia in ('NACIONAL', 'IMPORTACION')),
  nombre            text not null,
  -- Qué recorrido la vio y cuándo (ver cerrar_recorrido_oc en 005):
  -- CARPETA = está en una carpeta madre; LEGAJO = la enlaza el cuadro.
  visto_carpeta_en  timestamptz,
  visto_legajo_en   timestamptz,
  tipo              text check (tipo in ('OC', 'OS')),
  proveedor         text,                               -- como dice el nombre de la carpeta
  proyecto          text,
  proyecto_carpeta  text,                               -- carpeta de proyecto que la contiene
  -- Lo que tiene y lo que le falta (lo calcula el script)
  archivos          integer not null default 0,
  documentos        jsonb,          -- {"Factura": 2, "OC": 1, "Guía de remisión": 1}
  le_falta          text[],
  estado            text check (estado in ('OK', 'INCOMPLETA', 'VACIA')),
  calculado_en      timestamptz,
  check (visto_carpeta_en is not null or visto_legajo_en is not null)
);
create index carpeta_oc_oc_ix on carpeta_oc (orden_compra_id);

-- ── Archivo de Drive ────────────────────────────────────────────
-- Un archivo, una fila (antes hasta tres en oc_archivo, una por origen, más
-- otra en lectura_archivo). `visto_*_en` dice qué recorrido lo encontró.
-- La lectura por dentro (XML, PDF, OCR) va en la misma fila: el script la
-- repite solo si `modificado` cambió o si dio ERROR.

create table archivo (
  drive_id          text primary key,
  carpeta_id        text references carpeta_oc(drive_id) on delete set null,
  nombre            text not null,
  mime              text,
  modificado        timestamptz,                -- modifiedTime de Drive
  visto_carpeta_en  timestamptz,                -- qué recorrido lo vio y cuándo
  visto_legajo_en   timestamptz,
  -- Lo que dice el nombre
  parece            text,                       -- FACTURA, GUÍA, CUADRO DE COSTEO…
  serie_en_nombre   text,
  rucs_en_nombre    text[],
  -- Lo que dice por dentro
  lectura_estado    text check (lectura_estado in ('LEIDO', 'SIN_COMPROBANTE', 'SIN_TEXTO', 'ERROR')),
  lectura_metodo    text,                       -- XML, ZIP, PDF, OCR
  lectura_modificado timestamptz,               -- con qué versión se leyó
  leido_tipo        char(2),
  leido_serie       text,                       -- F001-123
  leido_ruc         text,
  leido_claves      text[],                     -- {FACTURA, GUIA, DAM}
  leido_oc          text,                       -- la OC que cita el documento
  lectura_detalle   text,
  leido_en          timestamptz,
  check (visto_carpeta_en is not null or visto_legajo_en is not null)
);
create index archivo_carpeta_ix   on archivo (carpeta_id);
create index archivo_por_leer_ix  on archivo (modificado)
  where lectura_estado is null or lectura_estado = 'ERROR' or lectura_modificado is distinct from modificado;

-- ── Vínculo comprobante ↔ OC ────────────────────────────────────
-- El resultado de vinculos_oc(), guardado. Un comprobante puede tener
-- varias OC y una OC varios comprobantes. El script lo recalcula solo para
-- lo que cambió (archivos o comprobantes nuevos o modificados).
--   evidencia: LECTURA (lo que dice el archivo por dentro, la más segura),
--              NOMBRE (serie en el nombre del archivo),
--              NUMERO (número suelto en el nombre, si calza con uno solo)

create table comprobante_oc (
  comprobante_id   uuid not null references comprobante(id) on delete cascade,
  orden_compra_id  uuid not null references orden_compra(id) on delete cascade,
  evidencia        text not null check (evidencia in ('LECTURA', 'NOMBRE', 'NUMERO', 'MANUAL')),
  archivo_id       text references archivo(drive_id) on delete set null,  -- el que lo probó
  principal        boolean not null default true,
  alertas          text[],     -- {'emisor distinto al proveedor de la OC','factura mayor que la OC'}
  calculado_en     timestamptz not null default now(),
  primary key (comprobante_id, orden_compra_id)
);
create index comprobante_oc_oc_ix      on comprobante_oc (orden_compra_id);
create index comprobante_oc_archivo_ix on comprobante_oc (archivo_id);
create unique index comprobante_oc_principal_uq
  on comprobante_oc (comprobante_id) where principal;

-- La señal de «factura sin OC» vive en `comprobante` (columnas sin_oc_*,
-- parte 02): la calcula el mismo script que llena esta tabla.

-- ── Reglas a mano ───────────────────────────────────────────────
-- Carpeta de proyecto → centro de costo. El script propone (CG, NOMBRE,
-- ADMINISTRATIVO); lo MANUAL no lo pisa nunca. Hoy MANUAL solo se escribe
-- por SQL: la app debería tener una pantalla para esto y para la tabla
-- siguiente.

create table regla_centro_costo (
  empresa_ruc       char(11) not null references empresa(ruc),
  procedencia       text not null check (procedencia in ('NACIONAL', 'IMPORTACION')),
  proyecto_carpeta  text not null,
  centro_costo_id   uuid references centro_costo(id),
  segun             text not null check (segun in ('CG', 'NOMBRE', 'ADMINISTRATIVO', 'MANUAL', 'SIN_ASIGNAR')),
  detalle           text,
  revisar           boolean not null default false,
  ocs               integer,
  ocs_en_cg         integer,
  actualizado_por   text,                     -- correo de quien lo cambió en la app
  actualizado_en    timestamptz not null default now(),
  primary key (empresa_ruc, procedencia, proyecto_carpeta)
);

-- Proveedores que nunca llevan OC (bancos, servicios…): sus facturas no
-- salen como «sin OC».
create table proveedor_sin_oc (
  empresa_ruc    char(11) not null references empresa(ruc),
  proveedor_ruc  text not null references contribuyente(ruc),
  motivo         text not null,
  marcado_por    text,                         -- correo
  marcado_en     timestamptz not null default now(),
  primary key (empresa_ruc, proveedor_ruc)
);
create index regla_centro_costo_cc_ix on regla_centro_costo (centro_costo_id);
create index proveedor_sin_oc_ruc_ix  on proveedor_sin_oc (proveedor_ruc);


-- ┌──────────────────────────────────────────────────────────────
-- │ 004_escrituras_comprobantes.sql
-- └──────────────────────────────────────────────────────────────

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


-- ┌──────────────────────────────────────────────────────────────
-- │ 005_escrituras_oc.sql
-- └──────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════
-- 005 · ESCRITURAS DE ÓRDENES DE COMPRA
--
-- Las funciones, en el orden en que corren cada noche:
--
--   guardar_fuente_oc     lo que dicen las hojas: Compras, COMEX, el cuadro
--                         de aprobaciones (legajo), la base de CG y el kardex
--                         (fuentes-compras.mts, SubirLegajo.gs)
--   guardar_carpetas_oc   lo que hay en Drive: carpetas y archivos de un
--   cerrar_recorrido_oc   recorrido, por lotes, y su cierre al terminar
--                         (carpetas-oc.mts, SubirLegajo.gs)
--   guardar_calculos_oc   lo que el script CALCULÓ en TypeScript con todo lo
--                         anterior: vínculo factura↔OC, facturas sin OC,
--                         centro de costo, qué le falta al legajo, reglas
--                         de centro de costo por proyecto (carpetas-oc.mts)
--
-- La base no decide nada de eso (antes vinculos_oc, facturas_sin_oc y
-- carpetas_madre_fuentes lo recalculaban en cada lectura): solo guarda,
-- todo o nada, en una sentencia por tabla.
--
-- JSON: llaves en snake_case con el nombre de la columna. Una OC se nombra
-- con `procedencia` ('NACIONAL'|'IMPORTACION') y `oc` como en las hojas
-- ('0172-2026'); un comprobante con emisor_ruc + tipo + serie + numero.
--
-- `p_completa` (fuentes): la carga trae TODO lo de esa fuente, así que lo que
-- no vino se quita. Los recorridos de Drive van por lotes: ver cerrar_recorrido_oc. Se rechaza si trae menos de la mitad de lo que había: es
-- una hoja cortada o un recorrido que falló, no media empresa que desapareció.
--
-- `p_cambios`: los cambios que el script ya detectó comparando con lo que
-- leyó de la base ([{entidad, clave, tipo, campo, antes, despues, detalle}]).
-- Se guardan en la misma transacción.
-- ════════════════════════════════════════════════════════════════

-- ── Ayudas ──────────────────────────────────────────────────────

-- '0172-2026' → ('172', 2026). Null si no tiene esa forma.
create function oc_numero(p text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when p ~ '^\s*\d+(\.\d+)?-\d{4}\s*$'
              then nullif(ltrim(split_part(trim(p), '-', 1), '0'), '') end
$$;

create function oc_anio(p text) returns smallint
language sql immutable set search_path = public, pg_temp as $$
  select case when p ~ '^\s*\d+(\.\d+)?-\d{4}\s*$'
              then split_part(trim(p), '-', 2)::smallint end
$$;

-- Un RUC (11 dígitos) o DNI (8) bien escrito; si no, null. Las hojas traen
-- a veces «20100047218 / 20501234567» o texto: eso no puede romper la FK.
create function ruc_valido(p text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when trim(p) ~ '^\d{8}(\d{3})?$' then trim(p) end
$$;

-- Preferencia de cada fuente para las columnas resueltas (mayor gana).
create function rango_datos(p text) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case p when 'COMPRAS' then 4 when 'LEGAJO' then 3 when 'COMEX' then 2 when 'CG' then 1 else 0 end
$$;

create function rango_comprador(p text) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case p when 'LEGAJO' then 3 when 'COMEX' then 2 when 'COMPRAS' then 1 else 0 end
$$;

-- Los cambios que manda el script, al historial.
create function anotar_cambios(p_cambios jsonb) returns integer
language plpgsql set search_path = public, pg_temp as $$
declare n integer;
begin
  insert into cambio (entidad, clave, tipo, campo, antes, despues, detalle)
  select c->>'entidad', c->>'clave', c->>'tipo', c->>'campo', c->>'antes', c->>'despues', c->'detalle'
  from jsonb_array_elements(coalesce(p_cambios, '[]')) c;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Crea las OC que no existen todavía (de cualquier fuente que las nombre).
create function asegurar_ordenes(p_empresa_ruc text, p_filas jsonb) returns void
language sql set search_path = public, pg_temp as $$
  insert into orden_compra (empresa_ruc, procedencia, numero, anio)
  select distinct p_empresa_ruc, f->>'procedencia', oc_numero(f->>'oc'), oc_anio(f->>'oc')
  from jsonb_array_elements(p_filas) f
  where oc_numero(f->>'oc') is not null and f->>'procedencia' in ('NACIONAL', 'IMPORTACION')
  on conflict (empresa_ruc, procedencia, numero, anio) do nothing
$$;

-- Crea los RUC que no existen todavía.
create function asegurar_contribuyentes(p_rucs text[]) returns void
language sql set search_path = public, pg_temp as $$
  insert into contribuyente (ruc, tipo_documento, ssco)
  select distinct r, tipo_documento_de(r), exists (select 1 from lista_ssco l where l.ruc = r)
  from unnest(p_rucs) r
  where r is not null and r <> ''
  on conflict (ruc) do nothing
$$;

-- ── Fuentes ─────────────────────────────────────────────────────
-- p_fuente:
--   COMPRAS  filas = una por OC de la base de Compras (BD nacionales + IMPO - BASE)
--   COMEX    filas = una por OC del STATUS de COMEX, con `duas: [...]`
--   LEGAJO   filas = una por OC del cuadro de aprobaciones
--   CG       filas = una por OC × centro de costo de la base de Control de Gestión
--            (cc_codigo, cc_nombre, monto, lineas; el script ya resolvió la procedencia)
--   ALMACEN  filas = un vale del kardex (id, oc y procedencia si los tiene)

create function guardar_fuente_oc(p_empresa_ruc text, p_fuente text, p_filas jsonb,
                                  p_completa boolean default false, p_cambios jsonb default '[]')
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_llegan  integer := jsonb_array_length(coalesce(p_filas, '[]'));
  v_habia   integer;
  v_filas   integer := 0;
  v_quitadas integer := 0;
begin
  if p_fuente not in ('COMPRAS', 'COMEX', 'LEGAJO', 'CG', 'ALMACEN') then
    raise exception 'Fuente desconocida: %', p_fuente;
  end if;

  -- Lo que había, para la protección de la mitad.
  select case p_fuente
           when 'COMPRAS' then (select count(*) from orden_compra where empresa_ruc = p_empresa_ruc and compras_en is not null)
           when 'COMEX'   then (select count(*) from orden_compra where empresa_ruc = p_empresa_ruc and comex_en is not null)
           when 'LEGAJO'  then (select count(*) from orden_compra where empresa_ruc = p_empresa_ruc and legajo_en is not null)
           when 'CG'      then (select count(*) from orden_compra_centro_costo x join orden_compra o on o.id = x.orden_compra_id where o.empresa_ruc = p_empresa_ruc)
           else                (select count(*) from vale_almacen where empresa_ruc = p_empresa_ruc)
         end into v_habia;
  if p_completa and v_llegan < v_habia / 2.0 then
    raise exception '% trae % filas y había %: no se reemplaza (¿hoja cortada?).', p_fuente, v_llegan, v_habia;
  end if;

  if p_fuente <> 'ALMACEN' then
    perform asegurar_ordenes(p_empresa_ruc, p_filas);
  end if;
  perform asegurar_contribuyentes(array(select ruc_valido(f->>'proveedor_ruc') from jsonb_array_elements(p_filas) f));

  drop table if exists _f;

  create temp table _f on commit drop as
  select o.id orden_compra_id, f
  from jsonb_array_elements(p_filas) f
  left join orden_compra o on o.empresa_ruc = p_empresa_ruc and o.procedencia = f->>'procedencia'
                          and o.numero = oc_numero(f->>'oc') and o.anio = oc_anio(f->>'oc');

  -- ── COMPRAS ──
  if p_fuente = 'COMPRAS' then
    update orden_compra o set
      tipo = coalesce(f->>'tipo', o.tipo),
      consorcio = f->>'consorcio',
      requerimiento = f->>'requerimiento', solicitado = f->>'solicitado', elaborado = f->>'elaborado',
      proyecto = f->>'proyecto', concepto = f->>'concepto', forma_pago = coalesce(o.forma_pago, f->>'forma_pago'),
      condicion_pago = f->>'condicion_pago', incoterm = f->>'incoterm', lugar_entrega = f->>'lugar_entrega',
      tiempo_entrega = f->>'tiempo_entrega', items = (f->>'items')::integer,
      comprador = case when rango_comprador('COMPRAS') >= rango_comprador(o.comprador_segun) and f->>'elaborado' is not null
                       then f->>'elaborado' else o.comprador end,
      comprador_segun = case when rango_comprador('COMPRAS') >= rango_comprador(o.comprador_segun) and f->>'elaborado' is not null
                             then 'COMPRAS' else o.comprador_segun end,
      proveedor_ruc = case when rango_datos('COMPRAS') >= rango_datos(o.datos_segun) then ruc_valido(f->>'proveedor_ruc') else o.proveedor_ruc end,
      proveedor_nombre = case when rango_datos('COMPRAS') >= rango_datos(o.datos_segun) then f->>'proveedor_nombre' else o.proveedor_nombre end,
      fecha_oc = case when rango_datos('COMPRAS') >= rango_datos(o.datos_segun) then (f->>'fecha_oc')::date else o.fecha_oc end,
      moneda = case when rango_datos('COMPRAS') >= rango_datos(o.datos_segun) then moneda_valida(f->>'moneda') else o.moneda end,
      monto = case when rango_datos('COMPRAS') >= rango_datos(o.datos_segun) then (f->>'monto')::numeric else o.monto end,
      monto_pen = case when rango_datos('COMPRAS') >= rango_datos(o.datos_segun) then (f->>'monto_pen')::numeric else o.monto_pen end,
      datos_segun = case when rango_datos('COMPRAS') >= rango_datos(o.datos_segun) then 'COMPRAS' else o.datos_segun end,
      compras_en = now()
    from _f where o.id = _f.orden_compra_id;
    get diagnostics v_filas = row_count;
    if p_completa then
      -- La OC ya no está en la base de Compras: su bloque se vacía.
      update orden_compra o set compras_en = null,
             requerimiento = null, solicitado = null, elaborado = null, proyecto = null, concepto = null,
             condicion_pago = null, lugar_entrega = null, tiempo_entrega = null, items = null,
             comprador = case when o.comprador_segun = 'COMPRAS' then null else o.comprador end,
             comprador_segun = case when o.comprador_segun = 'COMPRAS' then null else o.comprador_segun end,
             datos_segun = case when o.datos_segun = 'COMPRAS' then null else o.datos_segun end
       where o.empresa_ruc = p_empresa_ruc and o.compras_en is not null
         and not exists (select 1 from _f where _f.orden_compra_id = o.id);
      get diagnostics v_quitadas = row_count;
    end if;

  -- ── COMEX ──
  elsif p_fuente = 'COMEX' then
    update orden_compra o set
      consorcio = coalesce(o.consorcio, f->>'consorcio'),
      comex_estado = f->>'comex_estado', comex_origen = f->>'comex_origen', incoterm = coalesce(o.incoterm, f->>'incoterm'),
      modalidad = f->>'modalidad', operador = f->>'operador', awb_bl = f->>'awb_bl',
      etd = (f->>'etd')::date, eta = (f->>'eta')::date, ata = (f->>'ata')::date,
      llegada_planta_prevista = (f->>'llegada_planta_prevista')::date, llegada_planta = (f->>'llegada_planta')::date,
      agente_aduanas = f->>'agente_aduanas', documentos_enviados = f->>'documentos_enviados',
      dam = f->>'dam', costeo = f->>'costeo', embarques = (f->>'embarques')::smallint,
      comex_observaciones = f->>'comex_observaciones',
      comprador = case when rango_comprador('COMEX') >= rango_comprador(o.comprador_segun) and f->>'comprador' is not null
                       then f->>'comprador' else o.comprador end,
      comprador_segun = case when rango_comprador('COMEX') >= rango_comprador(o.comprador_segun) and f->>'comprador' is not null
                             then 'COMEX' else o.comprador_segun end,
      proveedor_nombre = case when rango_datos('COMEX') >= rango_datos(o.datos_segun) then f->>'proveedor_nombre' else o.proveedor_nombre end,
      fecha_oc = case when rango_datos('COMEX') >= rango_datos(o.datos_segun) then (f->>'fecha_oc')::date else o.fecha_oc end,
      datos_segun = case when rango_datos('COMEX') >= rango_datos(o.datos_segun) then 'COMEX' else o.datos_segun end,
      comex_en = now()
    from _f where o.id = _f.orden_compra_id;
    get diagnostics v_filas = row_count;

    delete from orden_compra_dua d using _f where d.orden_compra_id = _f.orden_compra_id;
    insert into orden_compra_dua (orden_compra_id, dua, fecha, encargado, subio_oc, fecha_subida, observacion)
    select distinct on (_f.orden_compra_id, x->>'dua')
           _f.orden_compra_id, x->>'dua', (x->>'fecha')::date, x->>'encargado', (x->>'subio_oc')::boolean,
           (x->>'fecha_subida')::date, x->>'observacion'
    from _f cross join lateral jsonb_array_elements(coalesce(_f.f->'duas', '[]')) x
    where _f.orden_compra_id is not null and coalesce(x->>'dua', '') <> '';

    if p_completa then
      delete from orden_compra_dua d using orden_compra o
       where o.id = d.orden_compra_id and o.empresa_ruc = p_empresa_ruc
         and not exists (select 1 from _f where _f.orden_compra_id = o.id);
      -- La OC ya no está en el STATUS de COMEX: su bloque se vacía.
      update orden_compra o set comex_en = null,
             comex_estado = null, comex_origen = null, modalidad = null, operador = null, awb_bl = null,
             etd = null, eta = null, ata = null, llegada_planta_prevista = null, llegada_planta = null,
             agente_aduanas = null, documentos_enviados = null, dam = null, costeo = null, embarques = null,
             comex_observaciones = null,
             comprador = case when o.comprador_segun = 'COMEX' then null else o.comprador end,
             comprador_segun = case when o.comprador_segun = 'COMEX' then null else o.comprador_segun end,
             datos_segun = case when o.datos_segun = 'COMEX' then null else o.datos_segun end
       where o.empresa_ruc = p_empresa_ruc and o.comex_en is not null
         and not exists (select 1 from _f where _f.orden_compra_id = o.id);
      get diagnostics v_quitadas = row_count;
    end if;

  -- ── LEGAJO (cuadro de aprobaciones) ──
  elsif p_fuente = 'LEGAJO' then
    insert into centro_costo (empresa_ruc, codigo, nombre)
    select distinct on (f->>'cc_codigo') p_empresa_ruc, f->>'cc_codigo', coalesce(f->>'cc_nombre', f->>'cc_codigo')
    from _f where coalesce(f->>'cc_codigo', '') <> ''
    on conflict (empresa_ruc, codigo) do nothing;

    update orden_compra o set
      area = coalesce(f->>'area', o.area),
      situacion_pago = f->>'situacion_pago', estatus = f->>'estatus', estado_aprobacion = f->>'estado_aprobacion',
      forma_pago = coalesce(f->>'forma_pago', o.forma_pago),
      legajo_revision = f->>'legajo_revision',
      legajo_le_falta = array(select jsonb_array_elements_text(coalesce(f->'legajo_le_falta', '[]'))),
      comprador = case when f->>'comprador' is not null then f->>'comprador' else o.comprador end,
      comprador_segun = case when f->>'comprador' is not null then 'LEGAJO' else o.comprador_segun end,
      proveedor_ruc = case when rango_datos('LEGAJO') >= rango_datos(o.datos_segun) then ruc_valido(f->>'proveedor_ruc') else o.proveedor_ruc end,
      proveedor_nombre = case when rango_datos('LEGAJO') >= rango_datos(o.datos_segun) then f->>'proveedor_nombre' else o.proveedor_nombre end,
      fecha_oc = case when rango_datos('LEGAJO') >= rango_datos(o.datos_segun) then (f->>'fecha_oc')::date else o.fecha_oc end,
      monto_pen = case when rango_datos('LEGAJO') >= rango_datos(o.datos_segun) then (f->>'monto_pen')::numeric else o.monto_pen end,
      datos_segun = case when rango_datos('LEGAJO') >= rango_datos(o.datos_segun) then 'LEGAJO' else o.datos_segun end,
      centro_costo_id = coalesce((select c.id from centro_costo c where c.empresa_ruc = p_empresa_ruc and c.codigo = f->>'cc_codigo'),
                                 case when o.centro_costo_segun = 'LEGAJO' then null else o.centro_costo_id end),
      centro_costo_segun = case when coalesce(f->>'cc_codigo', '') <> '' then 'LEGAJO'
                                when o.centro_costo_segun = 'LEGAJO' then null else o.centro_costo_segun end,
      legajo_en = now()
    from _f where o.id = _f.orden_compra_id;
    get diagnostics v_filas = row_count;
    if p_completa then
      -- La OC ya no está en el cuadro de aprobaciones: su bloque se vacía
      -- (una «ANULADA» vieja no debe seguir dando alertas).
      update orden_compra o set legajo_en = null,
             situacion_pago = null, estatus = null, estado_aprobacion = null,
             legajo_revision = null, legajo_le_falta = null,
             comprador = case when o.comprador_segun = 'LEGAJO' then null else o.comprador end,
             comprador_segun = case when o.comprador_segun = 'LEGAJO' then null else o.comprador_segun end,
             centro_costo_id = case when o.centro_costo_segun = 'LEGAJO' then null else o.centro_costo_id end,
             centro_costo_segun = case when o.centro_costo_segun = 'LEGAJO' then null else o.centro_costo_segun end,
             datos_segun = case when o.datos_segun = 'LEGAJO' then null else o.datos_segun end
       where o.empresa_ruc = p_empresa_ruc and o.legajo_en is not null
         and not exists (select 1 from _f where _f.orden_compra_id = o.id);
      get diagnostics v_quitadas = row_count;
    end if;

  -- ── CG (base de Control de Gestión) ──
  elsif p_fuente = 'CG' then
    -- Las áreas vienen con código «-»: el código es el nombre.
    insert into centro_costo (empresa_ruc, codigo, nombre, es_area)
    select distinct on (cod) p_empresa_ruc, cod, coalesce(nullif(f->>'cc_nombre', ''), cod), es_area
    from (select f, case when coalesce(f->>'cc_codigo', '-') = '-' then f->>'cc_nombre' else f->>'cc_codigo' end cod,
                 coalesce(f->>'cc_codigo', '-') = '-' es_area
          from _f) x
    where coalesce(cod, '') <> ''
    on conflict (empresa_ruc, codigo) do nothing;

    if p_completa then
      delete from orden_compra_centro_costo x using orden_compra o
       where o.id = x.orden_compra_id and o.empresa_ruc = p_empresa_ruc;
      get diagnostics v_quitadas = row_count;
      update orden_compra o set centros_costo_n = null, cg_en = null,
             datos_segun = case when o.datos_segun = 'CG' then null else o.datos_segun end
       where o.empresa_ruc = p_empresa_ruc and o.cg_en is not null
         and not exists (select 1 from _f where _f.orden_compra_id = o.id);
    else
      delete from orden_compra_centro_costo x using _f where x.orden_compra_id = _f.orden_compra_id;
    end if;

    insert into orden_compra_centro_costo (orden_compra_id, centro_costo_id, monto, lineas, principal)
    select orden_compra_id, cc_id, monto, lineas,
           row_number() over (partition by orden_compra_id order by lineas desc, monto desc nulls last) = 1
    from (
      select _f.orden_compra_id, c.id cc_id, sum((f->>'monto')::numeric) monto,
             sum(coalesce((f->>'lineas')::integer, 1))::integer lineas
      from _f
      join centro_costo c on c.empresa_ruc = p_empresa_ruc
                         and c.codigo = case when coalesce(f->>'cc_codigo', '-') = '-' then f->>'cc_nombre' else f->>'cc_codigo' end
      where _f.orden_compra_id is not null
      group by 1, 2
    ) g;
    get diagnostics v_filas = row_count;

    update orden_compra o set
      centros_costo_n = (select count(*) from orden_compra_centro_costo x where x.orden_compra_id = o.id),
      proveedor_ruc = coalesce(o.proveedor_ruc, g.proveedor_ruc),
      fecha_oc = coalesce(o.fecha_oc, g.fecha_oc),
      moneda = coalesce(o.moneda, g.moneda),
      datos_segun = coalesce(o.datos_segun, 'CG'),
      cg_en = now()
    from (select orden_compra_id, max(ruc_valido(f->>'proveedor_ruc')) proveedor_ruc, min((f->>'fecha_oc')::date) fecha_oc,
                 max(moneda_valida(f->>'moneda')) moneda
          from _f where orden_compra_id is not null group by 1) g
    where o.id = g.orden_compra_id;

  -- ── ALMACEN (kardex) ──
  else
    insert into vale_almacen as v (id, empresa_ruc, orden_compra_id, vale, fecha_registro, fecha_operacion,
      movimiento, operacion, proveedor, tipo_documento, numero_documento, tipo_orden, numero_orden, proyecto,
      sede, responsable, recepcionado, documento_ruta, documento_url, vale_url, items, cantidad, cargado_en)
    select f->>'id', p_empresa_ruc, orden_compra_id, f->>'vale', (f->>'fecha_registro')::date, (f->>'fecha_operacion')::date,
           f->>'movimiento', f->>'operacion', f->>'proveedor', f->>'tipo_documento', f->>'numero_documento',
           f->>'tipo_orden', f->>'numero_orden', f->>'proyecto', f->>'sede', f->>'responsable', f->>'recepcionado',
           f->>'documento_ruta', nullif(f->>'documento_url', ''), nullif(f->>'vale_url', ''),
           (f->>'items')::integer, (f->>'cantidad')::numeric, now()
    from _f where coalesce(f->>'id', '') <> ''
    on conflict (id) do update set
      orden_compra_id = excluded.orden_compra_id, vale = excluded.vale,
      fecha_registro = excluded.fecha_registro, fecha_operacion = excluded.fecha_operacion,
      movimiento = excluded.movimiento, operacion = excluded.operacion, proveedor = excluded.proveedor,
      tipo_documento = excluded.tipo_documento, numero_documento = excluded.numero_documento,
      tipo_orden = excluded.tipo_orden, numero_orden = excluded.numero_orden, proyecto = excluded.proyecto,
      sede = excluded.sede, responsable = excluded.responsable, recepcionado = excluded.recepcionado,
      documento_ruta = excluded.documento_ruta,
      documento_url = coalesce(excluded.documento_url, v.documento_url),   -- no se pisa con vacío
      vale_url = coalesce(excluded.vale_url, v.vale_url),
      items = excluded.items, cantidad = excluded.cantidad, cargado_en = now();
    get diagnostics v_filas = row_count;
    if p_completa then
      delete from vale_almacen v
       where v.empresa_ruc = p_empresa_ruc
         and not exists (select 1 from _f where _f.f->>'id' = v.id);
      get diagnostics v_quitadas = row_count;
    end if;
  end if;

  return jsonb_build_object('filas', v_filas, 'habia', v_habia, 'quitadas', v_quitadas,
                            'cambios', anotar_cambios(p_cambios));
end;
$$;

-- ── Carpetas y archivos de Drive ────────────────────────────────
-- Un recorrido se guarda por lotes y se cierra al final:
--
--   inicio := now()                         (en el script, antes de empezar)
--   guardar_carpetas_oc(… lote 1 …)          marca visto_<recorrido>_en = now()
--   guardar_carpetas_oc(… lote N …)
--   cerrar_recorrido_oc(…, inicio)          solo si el recorrido terminó sin fallos:
--                                           lo que este recorrido no vio desde `inicio`
--                                           deja de ser suyo; si nadie lo ve, se borra
--
-- p_recorrido: CARPETA (carpetas madre, workflow carpetas-oc) o LEGAJO
-- (carpetas que enlaza el cuadro de aprobaciones, SubirLegajo.gs).
-- p_carpetas: [{drive_id, procedencia, oc, nombre, tipo, proveedor, proyecto, proyecto_carpeta, archivos}]
-- p_archivos: [{drive_id, carpeta_id, nombre, mime, modificado, parece, serie_en_nombre, rucs_en_nombre[]}]
-- Un lote puede traer solo carpetas o solo archivos (las carpetas primero).
-- Las lecturas por dentro no van aquí: van con guardar_lecturas_archivo
-- (más abajo) a medida que el script lee.

create function guardar_carpetas_oc(p_empresa_ruc text, p_recorrido text,
                                    p_carpetas jsonb default '[]', p_archivos jsonb default '[]',
                                    p_cambios jsonb default '[]')
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_carpeta  boolean := p_recorrido = 'CARPETA';
  v_carpetas integer;
  v_archivos integer;
begin
  if p_recorrido not in ('CARPETA', 'LEGAJO') then
    raise exception 'Recorrido desconocido: %', p_recorrido;
  end if;

  perform asegurar_ordenes(p_empresa_ruc, p_carpetas);

  insert into carpeta_oc as c (drive_id, orden_compra_id, empresa_ruc, procedencia, nombre, tipo, proveedor,
                               proyecto, proyecto_carpeta, archivos, visto_carpeta_en, visto_legajo_en)
  select distinct on (f->>'drive_id')
         f->>'drive_id', o.id, p_empresa_ruc, f->>'procedencia', f->>'nombre', f->>'tipo', f->>'proveedor',
         f->>'proyecto', f->>'proyecto_carpeta', coalesce((f->>'archivos')::integer, 0),
         case when v_carpeta then now() end, case when not v_carpeta then now() end
  from jsonb_array_elements(p_carpetas) f
  left join orden_compra o on o.empresa_ruc = p_empresa_ruc and o.procedencia = f->>'procedencia'
                          and o.numero = oc_numero(f->>'oc') and o.anio = oc_anio(f->>'oc')
  where coalesce(f->>'drive_id', '') <> ''
  on conflict (drive_id) do update set
    orden_compra_id = coalesce(excluded.orden_compra_id, c.orden_compra_id),
    procedencia = excluded.procedencia, nombre = excluded.nombre,
    tipo = coalesce(excluded.tipo, c.tipo), proveedor = coalesce(excluded.proveedor, c.proveedor),
    proyecto = coalesce(excluded.proyecto, c.proyecto),
    proyecto_carpeta = coalesce(excluded.proyecto_carpeta, c.proyecto_carpeta),
    archivos = case when v_carpeta then excluded.archivos else c.archivos end,
    visto_carpeta_en = coalesce(excluded.visto_carpeta_en, c.visto_carpeta_en),
    visto_legajo_en = coalesce(excluded.visto_legajo_en, c.visto_legajo_en);
  get diagnostics v_carpetas = row_count;

  insert into archivo as a (drive_id, carpeta_id, nombre, mime, modificado, parece, serie_en_nombre,
                            rucs_en_nombre, visto_carpeta_en, visto_legajo_en)
  select distinct on (f->>'drive_id')
         f->>'drive_id', (select c.drive_id from carpeta_oc c where c.drive_id = f->>'carpeta_id'),
         f->>'nombre', f->>'mime', (f->>'modificado')::timestamptz, f->>'parece',
         upper(nullif(f->>'serie_en_nombre', '')),
         array(select jsonb_array_elements_text(coalesce(f->'rucs_en_nombre', '[]'))),
         case when v_carpeta then now() end, case when not v_carpeta then now() end
  from jsonb_array_elements(p_archivos) f
  where coalesce(f->>'drive_id', '') <> ''
  on conflict (drive_id) do update set
    carpeta_id = coalesce(excluded.carpeta_id, a.carpeta_id), nombre = excluded.nombre,
    mime = coalesce(excluded.mime, a.mime), modificado = coalesce(excluded.modificado, a.modificado),
    parece = coalesce(excluded.parece, a.parece),
    serie_en_nombre = coalesce(excluded.serie_en_nombre, a.serie_en_nombre),
    rucs_en_nombre = case when cardinality(excluded.rucs_en_nombre) > 0 then excluded.rucs_en_nombre else a.rucs_en_nombre end,
    visto_carpeta_en = coalesce(excluded.visto_carpeta_en, a.visto_carpeta_en),
    visto_legajo_en = coalesce(excluded.visto_legajo_en, a.visto_legajo_en);
  get diagnostics v_archivos = row_count;

  return jsonb_build_object('carpetas', v_carpetas, 'archivos', v_archivos, 'cambios', anotar_cambios(p_cambios));
end;
$$;

-- Cierra un recorrido completo. p_procedencia limita el cierre a una carpeta
-- madre (el workflow corre una vez por procedencia); null = todas.
-- Se rechaza si este recorrido vio menos de la mitad de las carpetas que
-- tenía: es un recorrido que falló a medias, no media empresa borrada.

create function cerrar_recorrido_oc(p_empresa_ruc text, p_recorrido text, p_procedencia text, p_inicio timestamptz)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_carpeta  boolean := p_recorrido = 'CARPETA';
  v_vistas   integer;
  v_habia    integer;
  v_archivos integer;
  v_carpetas integer;
begin
  if p_recorrido not in ('CARPETA', 'LEGAJO') then
    raise exception 'Recorrido desconocido: %', p_recorrido;
  end if;

  select count(*) filter (where (case when v_carpeta then visto_carpeta_en else visto_legajo_en end) >= p_inicio),
         count(*) filter (where (case when v_carpeta then visto_carpeta_en else visto_legajo_en end) is not null)
    into v_vistas, v_habia
    from carpeta_oc
   where empresa_ruc = p_empresa_ruc and (p_procedencia is null or procedencia = p_procedencia);
  if v_vistas < v_habia / 2.0 then
    raise exception 'El recorrido % vio % de % carpetas: no se cierra (¿falló a medias?).', p_recorrido, v_vistas, v_habia;
  end if;

  -- Archivos de este recorrido (y procedencia) que no se vieron desde el
  -- inicio: si ningún otro recorrido los ve, se borran; si no, solo dejan de
  -- ser de este. (En ese orden: una fila sin ningún recorrido no es válida.)
  drop table if exists _viejos;
  create temp table _viejos on commit drop as
  select a.drive_id, (case when v_carpeta then a.visto_legajo_en else a.visto_carpeta_en end) is not null otro
  from archivo a
  where (case when v_carpeta then a.visto_carpeta_en else a.visto_legajo_en end) < p_inicio
    and (p_procedencia is null
         or exists (select 1 from carpeta_oc c where c.drive_id = a.carpeta_id and c.procedencia = p_procedencia));
  delete from archivo a using _viejos x where a.drive_id = x.drive_id and not x.otro;
  get diagnostics v_archivos = row_count;
  update archivo a set
    visto_carpeta_en = case when v_carpeta then null else a.visto_carpeta_en end,
    visto_legajo_en  = case when v_carpeta then a.visto_legajo_en else null end
  from _viejos x where a.drive_id = x.drive_id and x.otro;

  -- Carpetas, igual. Sus archivos que sigan existiendo (vistos por el otro
  -- recorrido) quedan sin carpeta (on delete set null).
  delete from carpeta_oc c
   where c.empresa_ruc = p_empresa_ruc
     and (case when v_carpeta then c.visto_carpeta_en else c.visto_legajo_en end) < p_inicio
     and (case when v_carpeta then c.visto_legajo_en else c.visto_carpeta_en end) is null
     and (p_procedencia is null or c.procedencia = p_procedencia);
  get diagnostics v_carpetas = row_count;
  update carpeta_oc c set
    visto_carpeta_en = case when v_carpeta then null else c.visto_carpeta_en end,
    visto_legajo_en  = case when v_carpeta then c.visto_legajo_en else null end
  where c.empresa_ruc = p_empresa_ruc
    and (case when v_carpeta then c.visto_carpeta_en else c.visto_legajo_en end) < p_inicio
    and (p_procedencia is null or c.procedencia = p_procedencia);

  return jsonb_build_object('carpetas_vistas', v_vistas, 'carpetas_quitadas', v_carpetas, 'archivos_quitados', v_archivos);
end;
$$;

-- ── Lecturas por dentro ─────────────────────────────────────────
-- Lo que carpetas-oc.mts leyó dentro de cada archivo (XML, ZIP, texto del
-- PDF, OCR), con el mismo JSON que hoy, en lotes mientras va leyendo:
-- [{archivo_id, modificado, estado, metodo, tipo, serie, ruc, claves, oc_referencia, detalle}]
-- Es una función y no un upsert directo porque solo ACTUALIZA archivos que
-- ya existen: un upsert intentaría insertar filas sin nombre ni recorrido y
-- Postgres lo rechaza antes de mirar si ya existían.
-- estado acepta lo de hoy ('LEÍDO', 'SIN COMPROBANTE', …) y lo normaliza.

create function guardar_lecturas_archivo(p_filas jsonb)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  update archivo a set
    lectura_estado = x.estado,
    lectura_metodo = nullif(x.f->>'metodo', ''),
    lectura_modificado = nullif(x.f->>'modificado', '')::timestamptz,
    leido_tipo = case when x.f->>'tipo' ~ '^\d{2}$' then x.f->>'tipo' end,
    leido_serie = upper(nullif(x.f->>'serie', '')),
    leido_ruc = ruc_valido(x.f->>'ruc'),
    leido_claves = case when coalesce(x.f->>'claves', '') = '' then null
                        else array(select upper(trim(c)) from unnest(string_to_array(x.f->>'claves', ',')) c
                                   where trim(c) <> '') end,
    leido_oc = nullif(x.f->>'oc_referencia', ''),
    lectura_detalle = nullif(x.f->>'detalle', ''),
    leido_en = now()
  from (
    select distinct on (f->>'archivo_id') f,
           case translate(upper(f->>'estado'), 'ÍÉ ', 'IE_')
                when 'LEIDO' then 'LEIDO' when 'SIN_COMPROBANTE' then 'SIN_COMPROBANTE'
                when 'SIN_TEXTO' then 'SIN_TEXTO' when 'ERROR' then 'ERROR' end estado
    from jsonb_array_elements(p_filas) f
    order by f->>'archivo_id'
  ) x
  where a.drive_id = x.f->>'archivo_id' and x.estado is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ── Lo calculado ────────────────────────────────────────────────
-- Lo que hacían vinculos_oc(), facturas_sin_oc(), carpetas_madre_fuentes()
-- y el armado de oc_carpeta, ahora calculado en TypeScript y guardado aquí.
--   p_vinculos  [{emisor_ruc, tipo, serie, numero, procedencia, oc, evidencia, archivo_id, principal, alertas[]}]
--   p_sin_oc    [{emisor_ruc, tipo, serie, numero, senal, razon, area_probable}]
--   p_ordenes   [{procedencia, oc, cc_codigo, cc_segun, legajo_estado, le_falta[], por_subir[], ingreso_almacen}]
--   p_carpetas  [{drive_id, documentos{}, le_falta[], estado}]
--   p_reglas    [{procedencia, proyecto_carpeta, cc_codigo, segun, detalle, revisar, ocs, ocs_en_cg}]
-- p_completo = true: el script recalculó TODO; los vínculos y señales que no
-- vinieron se borran. false: solo lo que cambió; se reemplazan los vínculos
-- de los comprobantes que vienen (en p_vinculos o p_sin_oc).
-- Las reglas MANUAL (las pone Contabilidad desde la app) nunca se pisan, y
-- el centro de costo que dio el legajo tampoco.

create function guardar_calculos_oc(p_empresa_ruc text,
                                    p_vinculos jsonb default '[]', p_sin_oc jsonb default '[]',
                                    p_ordenes jsonb default '[]', p_carpetas jsonb default '[]',
                                    p_reglas jsonb default '[]', p_completo boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_vinculos integer;
  v_sin_oc   integer;
  v_ordenes  integer;
  v_carpetas integer;
  v_reglas   integer;
begin
  -- Los comprobantes que tocan, por su llave.
  drop table if exists _c;
  create temp table _c on commit drop as
  select distinct k.id
  from (select f from jsonb_array_elements(p_vinculos) f
        union all select f from jsonb_array_elements(p_sin_oc) f) x
  join comprobante k on k.empresa_ruc = p_empresa_ruc and k.emisor_ruc = x.f->>'emisor_ruc'
                    and k.tipo = x.f->>'tipo' and k.serie = upper(x.f->>'serie') and k.numero = ltrim(x.f->>'numero', '0');

  -- 1. Vínculos.
  if p_completo then
    delete from comprobante_oc x using comprobante k
     where k.id = x.comprobante_id and k.empresa_ruc = p_empresa_ruc;
  else
    delete from comprobante_oc x using _c where x.comprobante_id = _c.id;
  end if;

  -- Exactamente una OC principal por comprobante: la que el script marcó
  -- (si marcó varias o ninguna, la primera por código).
  insert into comprobante_oc (comprobante_id, orden_compra_id, evidencia, archivo_id, principal, alertas)
  select comprobante_id, orden_compra_id, evidencia, archivo_id,
         row_number() over (partition by comprobante_id order by marcada desc, codigo) = 1,
         alertas
  from (
    select distinct on (k.id, o.id)
           k.id comprobante_id, o.id orden_compra_id, o.codigo, f->>'evidencia' evidencia,
           (select a.drive_id from archivo a where a.drive_id = f->>'archivo_id') archivo_id,
           coalesce((f->>'principal')::boolean, false) marcada,
           array(select jsonb_array_elements_text(coalesce(f->'alertas', '[]'))) alertas
    from jsonb_array_elements(p_vinculos) f
    join comprobante k on k.empresa_ruc = p_empresa_ruc and k.emisor_ruc = f->>'emisor_ruc'
                      and k.tipo = f->>'tipo' and k.serie = upper(f->>'serie') and k.numero = ltrim(f->>'numero', '0')
    join orden_compra o on o.empresa_ruc = p_empresa_ruc and o.procedencia = f->>'procedencia'
                       and o.numero = oc_numero(f->>'oc') and o.anio = oc_anio(f->>'oc')
    order by k.id, o.id, coalesce((f->>'principal')::boolean, false) desc
  ) v;
  get diagnostics v_vinculos = row_count;

  -- 2. Facturas sin OC.
  if p_completo then
    update comprobante set sin_oc_senal = null, sin_oc_razon = null, area_probable = null, oc_calculado_en = now()
     where empresa_ruc = p_empresa_ruc and origen = 'RECIBIDO'
       and (sin_oc_senal is not null or sin_oc_razon is not null or area_probable is not null);
  else
    update comprobante k set sin_oc_senal = null, sin_oc_razon = null, area_probable = null, oc_calculado_en = now()
      from _c where k.id = _c.id;
  end if;
  update comprobante k set
    sin_oc_senal = nullif(f->>'senal', ''), sin_oc_razon = f->>'razon', area_probable = f->>'area_probable',
    oc_calculado_en = now()
  from jsonb_array_elements(p_sin_oc) f
  where k.empresa_ruc = p_empresa_ruc and k.emisor_ruc = f->>'emisor_ruc'
    and k.tipo = f->>'tipo' and k.serie = upper(f->>'serie') and k.numero = ltrim(f->>'numero', '0');
  get diagnostics v_sin_oc = row_count;

  -- 3. Lo resuelto de cada OC.
  update orden_compra o set
    centro_costo_id = case when o.centro_costo_segun = 'LEGAJO' then o.centro_costo_id
                           else (select c.id from centro_costo c where c.empresa_ruc = p_empresa_ruc and c.codigo = f->>'cc_codigo') end,
    centro_costo_segun = case when o.centro_costo_segun = 'LEGAJO' then 'LEGAJO' else f->>'cc_segun' end,
    legajo_estado = f->>'legajo_estado',
    le_falta = array(select jsonb_array_elements_text(coalesce(f->'le_falta', '[]'))),
    por_subir = array(select jsonb_array_elements_text(coalesce(f->'por_subir', '[]'))),
    ingreso_almacen = (f->>'ingreso_almacen')::date,
    calculado_en = now()
  from jsonb_array_elements(p_ordenes) f
  where o.empresa_ruc = p_empresa_ruc and o.procedencia = f->>'procedencia'
    and o.numero = oc_numero(f->>'oc') and o.anio = oc_anio(f->>'oc');
  get diagnostics v_ordenes = row_count;

  -- 4. Lo que tiene y le falta a cada carpeta.
  update carpeta_oc c set
    documentos = f->'documentos',
    le_falta = array(select jsonb_array_elements_text(coalesce(f->'le_falta', '[]'))),
    estado = f->>'estado',
    calculado_en = now()
  from jsonb_array_elements(p_carpetas) f
  where c.drive_id = f->>'drive_id';
  get diagnostics v_carpetas = row_count;

  -- 5. Reglas de centro de costo por carpeta de proyecto (las MANUAL no se tocan).
  insert into regla_centro_costo as r (empresa_ruc, procedencia, proyecto_carpeta, centro_costo_id, segun,
                                       detalle, revisar, ocs, ocs_en_cg, actualizado_en)
  select p_empresa_ruc, f->>'procedencia', f->>'proyecto_carpeta',
         (select c.id from centro_costo c where c.empresa_ruc = p_empresa_ruc and c.codigo = f->>'cc_codigo'),
         f->>'segun', f->>'detalle', coalesce((f->>'revisar')::boolean, false),
         (f->>'ocs')::integer, (f->>'ocs_en_cg')::integer, now()
  from jsonb_array_elements(p_reglas) f
  where f->>'segun' <> 'MANUAL'
  on conflict (empresa_ruc, procedencia, proyecto_carpeta) do update set
    centro_costo_id = excluded.centro_costo_id, segun = excluded.segun, detalle = excluded.detalle,
    revisar = excluded.revisar, ocs = excluded.ocs, ocs_en_cg = excluded.ocs_en_cg, actualizado_en = now()
  where r.segun <> 'MANUAL';
  get diagnostics v_reglas = row_count;

  return jsonb_build_object('vinculos', v_vinculos, 'sin_oc', v_sin_oc, 'ordenes', v_ordenes,
                            'carpetas', v_carpetas, 'reglas', v_reglas);
end;
$$;


-- ┌──────────────────────────────────────────────────────────────
-- │ 006_viaticos.sql
-- └──────────────────────────────────────────────────────────────

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


-- ┌──────────────────────────────────────────────────────────────
-- │ 007_escrituras_viaticos.sql
-- └──────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════
-- 007 · ESCRITURAS DE VIÁTICOS
--
-- La app de viáticos (servidor) llama a estas funciones con la llave de
-- servicio y dice quién actúa en `p_usuario`. El servidor ya comprobó la
-- sesión y los permisos de pantalla (permisos.ts); aquí se vuelve a revisar
-- lo que la base debe garantizar aunque la app se equivoque, y cada acción
-- queda en `cambio` (antes casi nada llegaba a `eventos`).
--
-- Funciones (todo o nada, una sentencia por tabla):
--   guardar_solicitud, responder_solicitud, retirar_solicitud
--   emitir_memo (nuevo, desde una solicitud aprobada o reposición de caja),
--   cambiar_anexo, cambiar_estado_memo, presentar_memo
--   solicitar_autorizacion_memo, responder_autorizacion_memo
--   guardar_gastos, crear_caja_invertida
--   firmar_planilla_movilidad
--   emitir_liquidacion, registrar_pago_liquidacion, anular_liquidacion
--   registrar_pago (constancia por banco con sus líneas)
-- Lo de una sola tabla sin reglas (devoluciones, abrir una planilla, borrar
-- un gasto aún no presentado, datos bancarios, catálogos) es insert /
-- update / delete directo desde el servidor.
--
-- Lo que se arregla respecto de la base vieja (informe del 15/10/2026):
--   · ABIERTO → EN_RENDICION no lo hacía nadie y no se podía presentar:
--     ahora pasa al guardar el primer gasto, y presentar acepta ABIERTO,
--     EN_RENDICION y OBSERVADA.
--   · crear_caja_chica violaba su propio CHECK (sin caja_id): la caja
--     «invertida» es ahora un memo sin adelanto (monto 0), permitido.
--   · Los gastos OBSERVADO quedaban fuera para siempre: presentar exige
--     que se corrijan o se quiten.
--   · La liquidación de un memo grupal usaba el monto del memo entero: ahora
--     usa el monto y los gastos de esa persona cuando el anexo los tiene.
--   · Cualquier JEFATURA podía firmar una planilla ajena: ahora solo el
--     jefe directo de la persona (o ADMIN_SISTEMA).
--   · Una liquidación no se podía anular: anular_liquidacion.
--   · El visto bueno se saltaba si el memo se creaba directo en ABIERTO
--     (el trigger solo miraba updates): ahora toda apertura pasa por abrir_memo.
-- ════════════════════════════════════════════════════════════════

-- ── Ayudas ──────────────────────────────────────────────────────

create function tiene_algun_rol(p_usuario uuid, p_roles text[]) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select exists (select 1 from usuario_rol ur join usuario u on u.id = ur.usuario_id
                  where ur.usuario_id = p_usuario and u.activo and ur.rol = any(p_roles))
$$;

create function exigir_usuario(p_usuario uuid) returns void
language plpgsql stable set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from usuario where id = p_usuario and activo) then
    raise exception 'Usuario no válido o inactivo.';
  end if;
end;
$$;

create function anotar_memo(p_memo uuid, p_usuario uuid, p_tipo text, p_detalle jsonb default null)
returns void language sql set search_path = public, pg_temp as $$
  insert into cambio (entidad, clave, tipo, detalle, hecho_por)
  select 'memo', coalesce(m.correlativo, m.id::text), p_tipo, p_detalle, p_usuario::text
  from memo m where m.id = p_memo
$$;

-- INROPRIN-2026-VIA-00012: abreviatura de la empresa, año, tipo y número
-- (la secuencia es por empresa, año y tipo).
create function siguiente_correlativo(p_empresa text, p_tipo text) returns text
language plpgsql set search_path = public, pg_temp as $$
declare
  v_anio smallint := extract(year from now())::smallint;
  v_num  integer;
begin
  insert into memo_correlativo as c (empresa_ruc, anio, tipo, ultimo)
  values (p_empresa, v_anio, p_tipo, 1)
  on conflict (empresa_ruc, anio, tipo) do update set ultimo = c.ultimo + 1
  returning ultimo into v_num;
  return (select upper(regexp_replace(coalesce(abreviatura, 'EMP'), '[^A-Za-z0-9]', '', 'g')) from empresa where ruc = p_empresa)
         || '-' || v_anio || '-'
         || case p_tipo when 'VIATICOS' then 'VIA' when 'PASAJES' then 'PAS' when 'CAJA_CHICA' then 'CCH'
                        when 'HOSPEDAJE' then 'HOS' when 'REEMBOLSO' then 'REE' else 'OTR' end
         || '-' || lpad(v_num::text, 5, '0');
end;
$$;

-- Escribe el anexo de un memo y recalcula monto y fechas del memo.
-- p_personas: [{usuario_id, monto, fecha_desde, fecha_hasta, descripcion}]
-- Reglas del anexo (anexo.ts): al menos una persona, nadie repetido, montos
-- > 0 (salvo memo sin adelanto), y ninguna vuelta antes de la ida.
create function escribir_anexo(p_memo uuid, p_personas jsonb, p_sin_adelanto boolean default false)
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  v_n integer := jsonb_array_length(coalesce(p_personas, '[]'));
begin
  if v_n = 0 then
    raise exception 'El memo necesita al menos una persona.';
  end if;
  if (select count(distinct p->>'usuario_id') from jsonb_array_elements(p_personas) p) <> v_n then
    raise exception 'Hay una persona repetida en el anexo.';
  end if;
  if not p_sin_adelanto and exists (select 1 from jsonb_array_elements(p_personas) p
                                     where coalesce((p->>'monto')::numeric, 0) <= 0) then
    raise exception 'Cada persona del anexo necesita un monto mayor que cero.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_personas) p
              where (p->>'fecha_hasta')::date < (p->>'fecha_desde')::date) then
    raise exception 'Hay una fecha de vuelta anterior a la de ida.';
  end if;

  delete from memo_persona where memo_id = p_memo;
  insert into memo_persona (memo_id, usuario_id, monto, fecha_desde, fecha_hasta, descripcion)
  select p_memo, (p->>'usuario_id')::uuid, nullif((p->>'monto')::numeric, 0),
         (p->>'fecha_desde')::date, (p->>'fecha_hasta')::date, nullif(p->>'descripcion', '')
  from jsonb_array_elements(p_personas) p;

  update memo m set
    monto_autorizado = coalesce(x.total, 0),
    fecha_salida = x.desde,
    fecha_retorno_prev = coalesce(x.hasta, m.fecha_retorno_prev)
  from (select sum(monto) total, min(fecha_desde) desde, max(fecha_hasta) hasta
        from memo_persona where memo_id = p_memo) x
  where m.id = p_memo;
end;
$$;

-- Abrir un memo (BORRADOR → ABIERTO): reemplaza al trigger
-- verificar_autorizacion_apertura, y vale también para lo que se emite
-- directamente abierto. Si se pidió visto bueno, todos los jefes tienen que
-- haberlo concedido, por el monto actual del memo.
create function abrir_memo(p_memo uuid, p_usuario uuid) returns void
language plpgsql set search_path = public, pg_temp as $$
declare m memo%rowtype;
begin
  select * into m from memo where id = p_memo for update;
  if not exists (select 1 from memo_persona where memo_id = p_memo) then
    raise exception 'El memo % no tiene a nadie en el anexo.', m.correlativo;
  end if;
  if exists (select 1 from memo_autorizacion where memo_id = p_memo and estado = 'RECHAZADA') then
    raise exception 'Una jefatura rechazó abrir el memo %.', m.correlativo;
  end if;
  if exists (select 1 from memo_autorizacion where memo_id = p_memo and estado = 'PENDIENTE') then
    raise exception 'El memo % espera el visto bueno de su jefatura.', m.correlativo;
  end if;
  if exists (select 1 from memo_autorizacion where memo_id = p_memo)
     and (select max(monto) from memo_autorizacion where memo_id = p_memo and estado = 'CONCEDIDA') is distinct from m.monto_autorizado then
    raise exception 'El monto del memo % cambió desde el visto bueno: vuelve a pedirlo.', m.correlativo;
  end if;
  update memo set estado = 'ABIERTO' where id = p_memo;
  perform anotar_memo(p_memo, p_usuario, 'ABRIR');
end;
$$;

-- Los memos CONTABILIZADA cuyas personas ya tienen todas su liquidación
-- PAGADA pasan a CERRADO (antes, cerrar_memos_saldados y el trigger
-- cerrar_al_contabilizar).
create function cerrar_memos_saldados(p_memos uuid[], p_usuario uuid) returns integer
language plpgsql set search_path = public, pg_temp as $$
declare n integer;
begin
  with cerrados as (
    update memo m set estado = 'CERRADO', cerrado_en = now()
     where m.id = any(p_memos) and m.estado = 'CONTABILIZADA'
       and exists (select 1 from memo_persona p where p.memo_id = m.id)
       and not exists (
         select 1 from memo_persona p
          where p.memo_id = m.id
            and not exists (select 1 from liquidacion_memo lm join liquidacion l on l.id = lm.liquidacion_id
                             where lm.memo_id = m.id and lm.usuario_id = p.usuario_id and lm.vigente
                               and l.estado = 'PAGADA'))
    returning m.id, m.correlativo
  ), anotados as (
    insert into cambio (entidad, clave, tipo, hecho_por)
    select 'memo', coalesce(correlativo, id::text), 'CERRAR', p_usuario::text from cerrados
    returning 1
  )
  select count(*) into n from cerrados;
  return n;
end;
$$;

-- ── Solicitud ───────────────────────────────────────────────────
-- p_memo: {tipo, centro_costo_id, destino, motivo}; p_personas: el anexo.
-- La jefatura que responde queda congelada: la del solicitante al pedir.

create function guardar_solicitud(p_usuario uuid, p_memo jsonb, p_personas jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  perform exigir_usuario(p_usuario);
  if coalesce(trim(p_memo->>'motivo'), '') = '' then
    raise exception 'La solicitud necesita un motivo.';
  end if;
  insert into memo (tipo, estado, empresa_ruc, centro_costo_id, destino, motivo,
                    solicitante_id, jefatura_id, creado_por)
  select p_memo->>'tipo', 'SOLICITADO', c.empresa_ruc, c.id, p_memo->>'destino', p_memo->>'motivo',
         p_usuario, (select jefatura_id from usuario where id = p_usuario), p_usuario
  from centro_costo c where c.id = (p_memo->>'centro_costo_id')::uuid
  returning id into v_id;
  if v_id is null then
    raise exception 'El centro de costo no existe.';
  end if;
  perform escribir_anexo(v_id, p_personas);
  perform anotar_memo(v_id, p_usuario, 'SOLICITAR');
  return v_id;
end;
$$;

-- Responde la jefatura congelada (o, si no había, cualquier JEFATURA), o
-- ADMIN_SISTEMA. Nadie responde la suya ni una en la que viaja. Rechazar
-- exige motivo.
create function responder_solicitud(p_usuario uuid, p_memo uuid, p_aprobar boolean, p_respuesta text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare m memo%rowtype;
begin
  perform exigir_usuario(p_usuario);
  select * into m from memo where id = p_memo for update;
  if m.estado is distinct from 'SOLICITADO' then
    raise exception 'La solicitud ya no está pendiente.';
  end if;
  if m.solicitante_id = p_usuario or exists (select 1 from memo_persona where memo_id = p_memo and usuario_id = p_usuario) then
    raise exception 'No puedes responder una solicitud tuya o en la que viajas.';
  end if;
  if not (tiene_algun_rol(p_usuario, '{ADMIN_SISTEMA}')
          or (m.jefatura_id = p_usuario)
          or (m.jefatura_id is null and tiene_algun_rol(p_usuario, '{JEFATURA}'))) then
    raise exception 'Esta solicitud la responde su jefatura.';
  end if;
  if not p_aprobar and coalesce(trim(p_respuesta), '') = '' then
    raise exception 'Para rechazar hay que decir por qué.';
  end if;
  update memo set estado = case when p_aprobar then 'POR_EMITIR' else 'RECHAZADO' end,
                  respuesta = nullif(trim(p_respuesta), ''), respondido_por = p_usuario, respondido_en = now()
   where id = p_memo;
  perform anotar_memo(p_memo, p_usuario, case when p_aprobar then 'APROBAR_SOLICITUD' else 'RECHAZAR_SOLICITUD' end);
end;
$$;

create function retirar_solicitud(p_usuario uuid, p_memo uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform exigir_usuario(p_usuario);
  update memo set estado = 'RETIRADO'
   where id = p_memo and estado in ('SOLICITADO', 'POR_EMITIR')
     and (solicitante_id = p_usuario or tiene_algun_rol(p_usuario, '{ADMIN_MEMOS,ADMIN_SISTEMA}'));
  if not found then
    raise exception 'Solo quien la pidió (o administración de memos) retira una solicitud que aún no es memo.';
  end if;
  perform anotar_memo(p_memo, p_usuario, 'RETIRAR_SOLICITUD');
end;
$$;

-- ── Emitir un memo ──────────────────────────────────────────────
-- ADMIN_MEMOS / ADMIN_SISTEMA. Recibe correlativo y anexo.
--   p_memo.id presente: convierte una solicitud aprobada (POR_EMITIR).
--   p_memo.id ausente:  memo nuevo {tipo, centro_costo_id, destino, motivo,
--                       caja_chica_id, ciclo, ciclo_anterior_id, memo_padre_id}.
-- p_abrir: queda ABIERTO (pasando por abrir_memo, con su visto bueno) o
-- BORRADOR (para pedir el visto bueno antes).

create function emitir_memo(p_usuario uuid, p_memo jsonb, p_personas jsonb, p_abrir boolean default true)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id   uuid := (p_memo->>'id')::uuid;
  v_emp  text;
  v_tipo text;
begin
  perform exigir_usuario(p_usuario);
  if not tiene_algun_rol(p_usuario, '{ADMIN_MEMOS,ADMIN_SISTEMA}') then
    raise exception 'Solo administración de memos emite memos.';
  end if;

  if v_id is not null then
    select empresa_ruc, tipo into v_emp, v_tipo from memo where id = v_id and estado = 'POR_EMITIR' for update;
    if v_emp is null then
      raise exception 'La solicitud no está aprobada para emitir.';
    end if;
    update memo set correlativo = siguiente_correlativo(v_emp, v_tipo), estado = 'BORRADOR', emitido_en = now(),
                    destino = coalesce(p_memo->>'destino', destino)
     where id = v_id;
  else
    select c.empresa_ruc into v_emp from centro_costo c where c.id = (p_memo->>'centro_costo_id')::uuid;
    if v_emp is null then
      raise exception 'El centro de costo no existe.';
    end if;
    v_tipo := p_memo->>'tipo';
    insert into memo (correlativo, tipo, estado, empresa_ruc, centro_costo_id, destino, motivo,
                      caja_chica_id, ciclo, ciclo_anterior_id, memo_padre_id, creado_por, emitido_en)
    values (siguiente_correlativo(v_emp, v_tipo), v_tipo, 'BORRADOR', v_emp, (p_memo->>'centro_costo_id')::uuid,
            p_memo->>'destino', p_memo->>'motivo', (p_memo->>'caja_chica_id')::uuid, p_memo->>'ciclo',
            (p_memo->>'ciclo_anterior_id')::uuid, (p_memo->>'memo_padre_id')::uuid, p_usuario, now())
    returning id into v_id;
  end if;

  perform escribir_anexo(v_id, p_personas);
  perform anotar_memo(v_id, p_usuario, 'EMITIR');
  if p_abrir then
    perform abrir_memo(v_id, p_usuario);
  end if;
  return v_id;
end;
$$;

-- Cambiar quiénes van y cuánto (antes de presentar). Si el memo ya estaba
-- abierto con visto bueno y el monto cambia, abrir_memo lo exigirá de nuevo
-- la próxima vez; aquí solo se recalcula.
create function cambiar_anexo(p_usuario uuid, p_memo uuid, p_personas jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform exigir_usuario(p_usuario);
  if not tiene_algun_rol(p_usuario, '{ADMIN_MEMOS,ADMIN_SISTEMA}') then
    raise exception 'Solo administración de memos cambia el anexo.';
  end if;
  if not exists (select 1 from memo where id = p_memo and estado in ('SOLICITADO', 'POR_EMITIR', 'BORRADOR', 'ABIERTO', 'EN_RENDICION')) then
    raise exception 'El anexo ya no se puede cambiar en este estado.';
  end if;
  perform escribir_anexo(p_memo, p_personas);
  perform anotar_memo(p_memo, p_usuario, 'CAMBIAR_ANEXO');
end;
$$;

-- ── Estados ─────────────────────────────────────────────────────
-- Lo que pide una persona, según memo_transicion. Arrastra a los gastos
-- (APROBADA: PRESENTADO → APROBADO; CONTABILIZADA: APROBADO → CONTABILIZADO)
-- y al contabilizar cierra lo ya pagado.

create function cambiar_estado_memo(p_usuario uuid, p_memo uuid, p_hacia text, p_observacion text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_desde text;
  v_roles text[];
begin
  perform exigir_usuario(p_usuario);
  select estado into v_desde from memo where id = p_memo for update;
  if v_desde is null then
    raise exception 'El memo no existe.';
  end if;
  if v_desde = p_hacia then
    return;                                  -- doble pulsación
  end if;
  select roles into v_roles from memo_transicion where desde = v_desde and hacia = p_hacia;
  if v_roles is null then
    raise exception 'No se puede pasar de % a %.', v_desde, p_hacia;
  end if;
  if not tiene_algun_rol(p_usuario, v_roles) then
    raise exception 'Tu rol no permite pasar el memo a %.', p_hacia;
  end if;
  if p_hacia = 'OBSERVADA' and coalesce(trim(p_observacion), '') = '' then
    raise exception 'Observar exige decir qué hay que corregir.';
  end if;

  if p_hacia = 'ABIERTO' then
    perform abrir_memo(p_memo, p_usuario);
    return;
  end if;

  update memo set
    estado = p_hacia,
    aprobado_por = case when p_hacia = 'APROBADA' then p_usuario else aprobado_por end,
    aprobado_en = case when p_hacia = 'APROBADA' then now() else aprobado_en end,
    contabilizado_en = case when p_hacia = 'CONTABILIZADA' then now() else contabilizado_en end,
    observacion = case when p_hacia = 'OBSERVADA' then trim(p_observacion)
                       when p_hacia in ('APROBADA', 'CONTABILIZADA') then null else observacion end
  where id = p_memo;

  if p_hacia = 'APROBADA' then
    update gasto set estado = 'APROBADO', actualizado_en = now() where memo_id = p_memo and estado = 'PRESENTADO';
  elsif p_hacia = 'CONTABILIZADA' then
    update gasto set estado = 'CONTABILIZADO', actualizado_en = now() where memo_id = p_memo and estado = 'APROBADO';
  end if;

  perform anotar_memo(p_memo, p_usuario, p_hacia, case when p_observacion is not null then jsonb_build_object('observacion', p_observacion) end);
  if p_hacia = 'CONTABILIZADA' then
    perform cerrar_memos_saldados(array[p_memo], p_usuario);
  end if;
end;
$$;

-- Presentar la rendición: una persona del anexo (o administración de
-- memos), desde ABIERTO, EN_RENDICION u OBSERVADA. Lo que impide presentar
-- (impedimentosParaPresentar) lo revisa también la base.
create function presentar_memo(p_usuario uuid, p_memo uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_estado text;
  v_motivo text;
begin
  perform exigir_usuario(p_usuario);
  select estado into v_estado from memo where id = p_memo for update;
  if v_estado is null then
    raise exception 'El memo no existe.';
  end if;
  if not exists (select 1 from memo_persona where memo_id = p_memo and usuario_id = p_usuario)
     and not tiene_algun_rol(p_usuario, '{ADMIN_MEMOS,ADMIN_SISTEMA}') then
    raise exception 'Solo quien está en el memo presenta su rendición.';
  end if;
  if v_estado not in ('ABIERTO', 'EN_RENDICION', 'OBSERVADA') then
    raise exception 'El memo está en % y no se puede presentar.', v_estado;
  end if;

  select case
           when not exists (select 1 from gasto where memo_id = p_memo) then 'no tiene gastos'
           when exists (select 1 from gasto where memo_id = p_memo and estado in ('CAPTURADO', 'ERROR_EXTRACCION'))
             then 'hay comprobantes sin leer'
           when exists (select 1 from gasto where memo_id = p_memo and estado = 'OBSERVADO')
             then 'hay gastos observados sin corregir'
           when exists (select 1 from gasto g, jsonb_array_elements(g.alertas) a
                         where g.memo_id = p_memo and a->>'severidad' = 'bloqueante')
             then 'hay alertas que impiden presentar'
           when exists (select 1 from gasto where memo_id = p_memo and jsonb_array_length(alertas) > 0 and not alertas_confirmadas)
             then 'hay alertas sin revisar'
         end into v_motivo;
  if v_motivo is not null then
    raise exception 'No se puede presentar: %.', v_motivo;
  end if;

  update memo set estado = 'PRESENTADA', presentado_en = now(), observacion = null where id = p_memo;
  update gasto set estado = 'PRESENTADO', actualizado_en = now()
   where memo_id = p_memo and estado in ('EXTRAIDO', 'CON_ALERTA', 'VALIDADO');
  perform anotar_memo(p_memo, p_usuario, 'PRESENTAR');
end;
$$;

-- ── Visto bueno de la jefatura ──────────────────────────────────

create function solicitar_autorizacion_memo(p_usuario uuid, p_memo uuid, p_jefes uuid[], p_motivo text default null)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  perform exigir_usuario(p_usuario);
  if not tiene_algun_rol(p_usuario, '{ADMIN_MEMOS,ADMIN_SISTEMA}') then
    raise exception 'Solo administración de memos pide el visto bueno.';
  end if;
  if not exists (select 1 from memo where id = p_memo and estado = 'BORRADOR') then
    raise exception 'El visto bueno se pide con el memo en borrador.';
  end if;
  insert into memo_autorizacion (memo_id, jefe_id, solicitada_por, monto, motivo)
  select p_memo, j, p_usuario, m.monto_autorizado, coalesce(nullif(trim(p_motivo), ''), 'Rendiciones vencidas.')
  from memo m, unnest(p_jefes) j where m.id = p_memo
  on conflict (memo_id, jefe_id) do nothing;
  get diagnostics n = row_count;
  perform anotar_memo(p_memo, p_usuario, 'PEDIR_VISTO_BUENO', jsonb_build_object('jefes', to_jsonb(p_jefes)));
  return n;
end;
$$;

-- Responde solo el jefe a quien se le pidió.
create function responder_autorizacion_memo(p_usuario uuid, p_autorizacion uuid, p_conceder boolean, p_respuesta text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_memo uuid;
begin
  perform exigir_usuario(p_usuario);
  update memo_autorizacion set estado = case when p_conceder then 'CONCEDIDA' else 'RECHAZADA' end,
                               respuesta = nullif(trim(p_respuesta), ''), resuelta_en = now()
   where id = p_autorizacion and jefe_id = p_usuario and estado = 'PENDIENTE'
  returning memo_id into v_memo;
  if v_memo is null then
    raise exception 'Esta autorización no te la pidieron a ti o ya está respondida.';
  end if;
  perform anotar_memo(v_memo, p_usuario, case when p_conceder then 'CONCEDER_VISTO_BUENO' else 'NEGAR_VISTO_BUENO' end);
end;
$$;

-- ── Gastos ──────────────────────────────────────────────────────
-- Captura, edición y bandeja sin asignar, en lotes. Llave: client_id (el
-- reintento del dispositivo no duplica). Columnas del JSON = columnas de
-- `gasto` (más proveedor_nombre, que va a contribuyente).
-- La app calcula estado y alertas (validaciones.ts); la base garantiza que:
--   · no se toca un gasto ya presentado, aprobado o contabilizado,
--   · el proveedor existe en contribuyente,
--   · el gasto queda unido a su factura de SUNAT si ya está,
--   · el memo pasa de ABIERTO a EN_RENDICION con su primer gasto.

create function guardar_gastos(p_usuario uuid, p_gastos jsonb)
returns table (nuevos integer, actualizados integer)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform exigir_usuario(p_usuario);
  drop table if exists _g;
  create temp table _g on commit drop as
  select distinct on (g->>'client_id') g, ruc_valido(g->>'proveedor_ruc') ruc
  from jsonb_array_elements(p_gastos) g
  where coalesce(g->>'client_id', '') <> ''
  order by g->>'client_id';

  if exists (select 1 from _g join gasto x on x.client_id = _g.g->>'client_id'
              where x.estado in ('PRESENTADO', 'APROBADO', 'CONTABILIZADO')) then
    raise exception 'Un gasto ya presentado no se edita: primero tiene que ser observado.';
  end if;

  insert into contribuyente as c (ruc, tipo_documento, razon_social, ssco)
  select distinct on (ruc) ruc, tipo_documento_de(ruc), nullif(g->>'proveedor_nombre', ''),
         exists (select 1 from lista_ssco l where l.ruc = _g.ruc)
  from _g where ruc is not null
  order by ruc
  on conflict (ruc) do update set razon_social = coalesce(c.razon_social, excluded.razon_social);

  with up as (
    insert into gasto as x (client_id, memo_id, usuario_id, estado, clase, proveedor_ruc, tipo, serie, numero,
      fecha_emision, moneda, tipo_cambio, subtotal, igv, total, forma_pago, detalle, adquiriente_ruc,
      comprobante_id, motivo, destino, planilla_movilidad_id, confianza_extraccion, alertas,
      alertas_confirmadas, hash_imagen, observacion, drive_id, drive_error, capturado_en)
    select g->>'client_id', (g->>'memo_id')::uuid, coalesce((g->>'usuario_id')::uuid, p_usuario),
           coalesce(g->>'estado', 'CAPTURADO'), coalesce(g->>'clase', 'COMPROBANTE'), ruc,
           nullif(g->>'tipo', ''), upper(nullif(g->>'serie', '')), nullif(ltrim(g->>'numero', '0'), ''),
           (g->>'fecha_emision')::date, coalesce(moneda_valida(g->>'moneda'), 'PEN'), (g->>'tipo_cambio')::numeric,
           (g->>'subtotal')::numeric, (g->>'igv')::numeric, (g->>'total')::numeric, g->>'forma_pago', g->>'detalle',
           nullif(g->>'adquiriente_ruc', ''),
           (select k.id from comprobante k
             where k.origen = 'RECIBIDO' and k.emisor_ruc = ruc and k.tipo = g->>'tipo'
               and k.serie = upper(g->>'serie') and k.numero = ltrim(g->>'numero', '0') limit 1),
           g->>'motivo', g->>'destino', (g->>'planilla_movilidad_id')::uuid, g->'confianza_extraccion',
           coalesce(g->'alertas', '[]'), coalesce((g->>'alertas_confirmadas')::boolean, false),
           nullif(g->>'hash_imagen', ''), g->>'observacion', drive_id_de(coalesce(g->>'drive_id', g->>'drive_url')),
           g->>'drive_error', (g->>'capturado_en')::timestamptz
    from _g
    on conflict (client_id) do update set
      memo_id = excluded.memo_id, estado = excluded.estado, clase = excluded.clase,
      proveedor_ruc = excluded.proveedor_ruc, tipo = excluded.tipo, serie = excluded.serie, numero = excluded.numero,
      fecha_emision = excluded.fecha_emision, moneda = excluded.moneda, tipo_cambio = excluded.tipo_cambio,
      subtotal = excluded.subtotal, igv = excluded.igv, total = excluded.total, forma_pago = excluded.forma_pago,
      detalle = excluded.detalle, adquiriente_ruc = excluded.adquiriente_ruc,
      comprobante_id = coalesce(excluded.comprobante_id, x.comprobante_id),
      motivo = excluded.motivo, destino = excluded.destino, planilla_movilidad_id = excluded.planilla_movilidad_id,
      confianza_extraccion = excluded.confianza_extraccion, alertas = excluded.alertas,
      alertas_confirmadas = excluded.alertas_confirmadas, hash_imagen = coalesce(excluded.hash_imagen, x.hash_imagen),
      observacion = excluded.observacion, drive_id = coalesce(excluded.drive_id, x.drive_id),
      drive_error = excluded.drive_error, actualizado_en = now()
    returning (xmax = 0) nuevo
  )
  select count(*) filter (where nuevo), count(*) filter (where not nuevo) into nuevos, actualizados from up;

  -- El primer gasto pone al memo en rendición.
  update memo m set estado = 'EN_RENDICION'
   where m.estado = 'ABIERTO'
     and m.id in (select (g->>'memo_id')::uuid from _g where g->>'memo_id' is not null);

  return next;
end;
$$;

-- Caja chica «invertida»: la persona gastó primero y rinde sin adelanto.
-- Junta sus gastos sueltos en un memo CAJA_CHICA (monto 0) y lo presenta.
create function crear_caja_invertida(p_usuario uuid, p_centro_costo uuid, p_gastos uuid[], p_descripcion text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_emp text;
  v_id  uuid;
begin
  perform exigir_usuario(p_usuario);
  if coalesce(cardinality(p_gastos), 0) = 0 then
    raise exception 'Elige al menos un gasto.';
  end if;
  if (select count(*) from gasto where id = any(p_gastos) and usuario_id = p_usuario and memo_id is null
         and estado in ('CAPTURADO', 'EXTRAIDO', 'ERROR_EXTRACCION', 'CON_ALERTA', 'VALIDADO')) <> cardinality(p_gastos) then
    raise exception 'Solo gastos propios, sin memo y sin presentar.';
  end if;
  select empresa_ruc into v_emp from centro_costo where id = p_centro_costo;
  if v_emp is null then
    raise exception 'El centro de costo no existe.';
  end if;

  insert into memo (correlativo, tipo, estado, empresa_ruc, centro_costo_id, destino, monto_autorizado,
                    fecha_salida, fecha_retorno_prev, creado_por, emitido_en)
  select siguiente_correlativo(v_emp, 'CAJA_CHICA'), 'CAJA_CHICA', 'EN_RENDICION', v_emp, p_centro_costo,
         coalesce(nullif(trim(p_descripcion), ''), 'Caja chica ' || min(fecha_emision) || ' a ' || max(fecha_emision)),
         0, min(fecha_emision), max(fecha_emision), p_usuario, now()
  from gasto where id = any(p_gastos)
  returning id into v_id;

  insert into memo_persona (memo_id, usuario_id) values (v_id, p_usuario);
  update gasto set memo_id = v_id, actualizado_en = now() where id = any(p_gastos);
  perform anotar_memo(v_id, p_usuario, 'CREAR_CAJA_INVERTIDA');
  perform presentar_memo(p_usuario, v_id);
  return v_id;
end;
$$;

-- ── Movilidad ───────────────────────────────────────────────────
-- La firma (casilla AUTORIZADO) la pone el jefe directo de la persona, o
-- ADMIN_SISTEMA; nadie firma la suya; una planilla firmada no se vuelve a firmar.
create function firmar_planilla_movilidad(p_usuario uuid, p_planilla uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform exigir_usuario(p_usuario);
  update planilla_movilidad p set autorizado_por = p_usuario, autorizado_en = now()
   where p.id = p_planilla and p.autorizado_por is null and p.usuario_id <> p_usuario
     and ((select jefatura_id from usuario where id = p.usuario_id) = p_usuario
          or tiene_algun_rol(p_usuario, '{ADMIN_SISTEMA}'));
  if not found then
    raise exception 'La planilla la firma el jefe directo de la persona, una sola vez.';
  end if;
  insert into cambio (entidad, clave, tipo, hecho_por) values ('planilla_movilidad', p_planilla::text, 'FIRMAR', p_usuario::text);
end;
$$;

-- ── Liquidación ─────────────────────────────────────────────────
-- CONTABILIDAD, REVISOR_COSTOS, ADMIN_MEMOS o ADMIN_SISTEMA. Una línea por
-- memo liquidable (APROBADA, CONTABILIZADA, CERRADO) de esa persona:
--   autorizado = su monto en el anexo (o el del memo, en memos sin anexo)
--   rendido    = sus gastos que cuentan (o los de todo el memo, sin anexo)
-- Un memo entra en una sola liquidación vigente por persona (índice único).

create function emitir_liquidacion(p_usuario uuid, p_beneficiario uuid, p_memos uuid[])
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  perform exigir_usuario(p_usuario);
  if not tiene_algun_rol(p_usuario, '{CONTABILIDAD,REVISOR_COSTOS,ADMIN_MEMOS,ADMIN_SISTEMA}') then
    raise exception 'Tu rol no emite liquidaciones.';
  end if;
  if coalesce(cardinality(p_memos), 0) = 0 then
    raise exception 'Elige al menos un memo.';
  end if;

  insert into liquidacion (usuario_id, emitida_por) values (p_beneficiario, p_usuario) returning id into v_id;

  insert into liquidacion_memo (liquidacion_id, memo_id, usuario_id, autorizado, rendido)
  select v_id, m.id, p_beneficiario,
         coalesce(p.monto, m.monto_autorizado),
         coalesce((select sum(g.total) from gasto g
                    where g.memo_id = m.id
                      and (p.monto is null or g.usuario_id = p_beneficiario)
                      and g.estado in ('EXTRAIDO', 'CON_ALERTA', 'VALIDADO', 'PRESENTADO', 'APROBADO', 'CONTABILIZADO')), 0)
  from memo m join memo_persona p on p.memo_id = m.id and p.usuario_id = p_beneficiario
  where m.id = any(p_memos) and m.estado in ('APROBADA', 'CONTABILIZADA', 'CERRADO');

  if not found then
    raise exception 'Ninguno de esos memos se puede liquidar para esa persona.';
  end if;
  insert into cambio (entidad, clave, tipo, hecho_por, detalle)
  values ('liquidacion', v_id::text, 'EMITIR', p_usuario::text, jsonb_build_object('memos', to_jsonb(p_memos)));
  return v_id;
end;
$$;

-- CONTABILIDAD o ADMIN_SISTEMA, con el nº de operación. Cierra los memos
-- que con este pago quedan saldados.
create function registrar_pago_liquidacion(p_usuario uuid, p_liquidacion uuid, p_referencia text, p_observacion text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform exigir_usuario(p_usuario);
  if not tiene_algun_rol(p_usuario, '{CONTABILIDAD,ADMIN_SISTEMA}') then
    raise exception 'Tu rol no registra pagos.';
  end if;
  if coalesce(trim(p_referencia), '') = '' then
    raise exception 'Falta el número de operación.';
  end if;
  update liquidacion set estado = 'PAGADA', referencia = trim(p_referencia), observacion = p_observacion,
                         pagada_por = p_usuario, pagada_en = now()
   where id = p_liquidacion and estado = 'EMITIDA';
  if not found then
    raise exception 'La liquidación no existe o no está emitida.';
  end if;
  insert into cambio (entidad, clave, tipo, hecho_por) values ('liquidacion', p_liquidacion::text, 'PAGAR', p_usuario::text);
  perform cerrar_memos_saldados(array(select memo_id from liquidacion_memo where liquidacion_id = p_liquidacion), p_usuario);
end;
$$;

-- Nuevo: una liquidación emitida por error se anula y sus memos quedan
-- libres para volver a liquidarse. Una pagada no se anula.
create function anular_liquidacion(p_usuario uuid, p_liquidacion uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform exigir_usuario(p_usuario);
  if not tiene_algun_rol(p_usuario, '{CONTABILIDAD,ADMIN_SISTEMA}') then
    raise exception 'Tu rol no anula liquidaciones.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Anular exige un motivo.';
  end if;
  update liquidacion set estado = 'ANULADA', anulada_por = p_usuario, anulada_en = now(), observacion = trim(p_motivo)
   where id = p_liquidacion and estado = 'EMITIDA';
  if not found then
    raise exception 'Solo se anula una liquidación emitida y no pagada.';
  end if;
  update liquidacion_memo set vigente = false where liquidacion_id = p_liquidacion;
  insert into cambio (entidad, clave, tipo, hecho_por, detalle)
  values ('liquidacion', p_liquidacion::text, 'ANULAR', p_usuario::text, jsonb_build_object('motivo', p_motivo));
end;
$$;

-- ── Pago de un memo (constancia del banco) ──────────────────────
-- ADMIN_MEMOS o ADMIN_SISTEMA. La planilla de un banco con una línea por
-- persona del anexo; procesada = false si el banco la rechazó.
-- p_pago: {banco, planilla, fecha, drive_id}; p_lineas: [{usuario_id, monto, procesada, motivo}]

create function registrar_pago(p_usuario uuid, p_memo uuid, p_pago jsonb, p_lineas jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  perform exigir_usuario(p_usuario);
  if not tiene_algun_rol(p_usuario, '{ADMIN_MEMOS,ADMIN_SISTEMA}') then
    raise exception 'Tu rol no registra pagos.';
  end if;
  if coalesce(trim(p_pago->>'banco'), '') = '' then
    raise exception 'Falta el banco.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lineas) l
              where not exists (select 1 from memo_persona p where p.memo_id = p_memo and p.usuario_id = (l->>'usuario_id')::uuid)) then
    raise exception 'Hay un pago a alguien que no está en el memo.';
  end if;
  insert into pago (memo_id, banco, planilla, fecha, drive_id, registrado_por)
  values (p_memo, trim(p_pago->>'banco'), nullif(p_pago->>'planilla', ''), (p_pago->>'fecha')::date,
          drive_id_de(p_pago->>'drive_id'), p_usuario)
  returning id into v_id;
  insert into pago_linea (pago_id, usuario_id, monto, procesada, motivo)
  select v_id, (l->>'usuario_id')::uuid, (l->>'monto')::numeric, coalesce((l->>'procesada')::boolean, true), l->>'motivo'
  from jsonb_array_elements(p_lineas) l
  where (l->>'monto')::numeric > 0;
  perform anotar_memo(p_memo, p_usuario, 'REGISTRAR_PAGO', jsonb_build_object('banco', p_pago->>'banco', 'planilla', p_pago->>'planilla'));
  return v_id;
end;
$$;


-- ┌──────────────────────────────────────────────────────────────
-- │ 008_aplicaciones.sql
-- └──────────────────────────────────────────────────────────────

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


-- ┌──────────────────────────────────────────────────────────────
-- │ 009_acceso.sql
-- └──────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════
-- 009 · ACCESO
--
-- Quién puede qué, en un solo lugar y para TODAS las tablas y funciones.
--
-- Solo los servidores entran: la app (servidor de Vercel) y los scripts
-- (GitHub Actions, laptop) usan la llave de servicio (service_role), que
-- pasa por encima del RLS. El navegador nunca habla con la base.
--
--   anon, authenticated  nada: sin permisos sobre tablas ni funciones, y RLS
--                        activado sin políticas (doble cerrojo).
--   service_role         todo.
--
-- Sin políticas tampoco hay funciones de permiso evaluadas por fila (lo que
-- dejaba a cpe_comprobante sin responder en la base vieja).
--
-- Va al final porque Supabase da permisos a anon y authenticated sobre todo
-- lo que se crea en `public`: aquí se quitan los de lo ya creado y, con
-- `alter default privileges`, los de lo que se cree después.
-- ════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

revoke all on all sequences in schema public from anon, authenticated;
grant  all on all sequences in schema public to service_role;

revoke execute on all functions in schema public from public, anon, authenticated;
grant  execute on all functions in schema public to service_role;

-- Lo que se cree más adelante nace igual de cerrado.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;


-- ┌──────────────────────────────────────────────────────────────
-- │ 010_documento_relacionado.sql
-- └──────────────────────────────────────────────────────────────

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


-- ┌──────────────────────────────────────────────────────────────
-- │ 011_documento_del_contribuyente.sql
-- └──────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════
-- 011 · EL DOCUMENTO DEL CONTRIBUYENTE
--
-- La ficha de la Consulta RUC trae el documento de la persona natural
-- («DNI 43762331») y la app lo muestra en la ficha SUNAT
-- (src/app/(app)/_ruc/sunat-ficha.tsx). La base vieja lo tenía en
-- padron_ruc.documento; contribuyente (002) no tenía dónde guardarlo.
-- Lo escribe quien guarda la ficha (upsert de sus columnas), con ficha_en.
--
-- Se puede correr dos veces.
-- ════════════════════════════════════════════════════════════════

alter table contribuyente add column if not exists documento text;   -- DNI 43762331

notify pgrst, 'reload schema';


-- ┌──────────────────────────────────────────────────────────────
-- │ 012_nada_queda_fuera.sql
-- └──────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════
-- 012 · NADA DE LA BASE VIEJA QUEDA FUERA
--done
--
-- Decisión del 19/10/2026 (él): «es mejor no dejar ningún dato fuera de esta
-- migración o db nueva, para que luego no estén preguntando si eso queda o no».
-- Un inventario columna por columna de las 51 tablas viejas contra la v2 dio
-- lo que no tenía dónde ir. Cada cosa tiene ahora su lugar:
--
--   lo que se lee directo (país, nombres tal como los dice cada fuente, la
--   carpeta de Drive de un centro de costo…) → una columna;
--   lo que una hoja trajo tal cual (la fila de Compras, de COMEX, del kardex,
--   las líneas de CG, cada vez que un recorrido vio un archivo) → su fila
--   original en jsonb, para que no se pierda una celda aunque la v2 no la lea;
--   lo que era 1 a N y la v2 había juntado en uno (una OC con varias carpetas
--   en el cuadro de aprobaciones) → su tabla.
--
-- CAPTURA sigue retirada (no se vuelve a correr), pero lo que vio se guarda:
-- archivo.visto_captura_en. Viáticos entra entero (006): lo que faltaba de sus
-- tablas va abajo.
--
-- Los workflows que escriban estas columnas se adaptan después (guardar_fuente_oc
-- y compañía); hasta entonces las llena pnpm db:mudanza. Se puede correr dos veces.
-- ════════════════════════════════════════════════════════════════

-- ── Núcleo ──────────────────────────────────────────────────────
alter table centro_costo
  add column if not exists drive_folder      text,          -- la carpeta del proyecto en Drive, como la escribía viáticos
  add column if not exists concar_estado     text,          -- CONFIRMADO, PROPUESTO… (equivalencia_centro_costo)
  add column if not exists concar_propuesto  text,          -- el código CONCAR aún sin confirmar (concar_codigo es solo el confirmado)
  add column if not exists concar_nota       text,
  add column if not exists concar_en         timestamptz;

-- ── Comprobantes ────────────────────────────────────────────────
-- Los nombres tal como los dice cada documento (contribuyente guarda uno solo por RUC).
alter table comprobante
  add column if not exists emisor_nombre    text,
  add column if not exists receptor_nombre  text;

alter table registro_compras
  add column if not exists proveedor_nombre text;            -- como lo dijo el SIRE ese mes

alter table detraccion_constancia
  add column if not exists numero_original      text,        -- el número del comprobante como lo escribe la constancia (00002158)
  add column if not exists proveedor_nombre     text,
  add column if not exists adquiriente_nombre   text,
  add column if not exists adquiriente_tipo_doc text;

-- La factura como la describe el CRE: sirve mientras su comprobante no está en la base.
alter table retencion_documento
  add column if not exists fecha_emision date,
  add column if not exists total         numeric(14,2),
  add column if not exists moneda        char(3);

-- ── Órdenes de compra ───────────────────────────────────────────
alter table orden_compra
  add column if not exists pais         text,                -- el país del proveedor (Base de Compras)
  add column if not exists compras_fila jsonb,               -- la fila de la Base de Compras, tal cual
  add column if not exists comex_fila   jsonb;               -- la fila del STATUS de COMEX, tal cual

alter table orden_compra_centro_costo
  add column if not exists lineas_cg jsonb;                  -- las líneas de la base de CG que suman esta fila

alter table vale_almacen
  add column if not exists fila jsonb;                       -- la fila del kardex, tal cual (con su OC aunque no calce)

alter table carpeta_oc
  add column if not exists comprobantes       integer,       -- lo que contó el recorrido en la carpeta
  add column if not exists series             text,
  add column if not exists rucs               text,
  add column if not exists centro_costo_id    uuid references centro_costo(id),
  add column if not exists centro_costo_segun text;          -- el de la carpeta (el de la OC está en orden_compra)
create index if not exists carpeta_oc_cc_ix on carpeta_oc (centro_costo_id);

-- Cada recorrido que vio el archivo, con lo que dijo de él (oc_archivo tenía una fila por origen).
alter table archivo
  add column if not exists visto_captura_en timestamptz,
  add column if not exists origenes         jsonb;
-- El check viejo («lo vio CARPETA o LEGAJO») no tenía nombre: se busca por lo que revisa.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.archivo'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%visto_carpeta_en%'
  loop
    execute format('alter table archivo drop constraint %I', c);
  end loop;
end $$;
alter table archivo add constraint archivo_visto_check
  check (visto_carpeta_en is not null or visto_legajo_en is not null or visto_captura_en is not null);

-- El cuadro de aprobaciones por OC y carpeta: una OC puede aparecer con
-- varias carpetas (los gastos de una importación), cada una con su comprador,
-- situación de pago y revisión. orden_compra guarda la más reciente; aquí
-- quedan todas, como las trae LegajoPorOC.gs.
create table if not exists orden_compra_legajo (
  orden_compra_id    uuid not null references orden_compra(id) on delete cascade,
  carpeta_id         text not null default '',   -- id de Drive de la carpeta que enlaza, '' si no enlaza ninguna
  carpeta_url        text,
  unidad             text,
  proyecto           text,
  proveedor          text,
  proveedor_ruc      text,
  comprador          text,
  area               text,
  situacion_pago     text,
  estatus            text,
  estado_aprobacion  text,
  fecha_oc           date,
  monto_soles        numeric(14,2),
  forma_pago         text,
  cc_codigo          text,
  cc_nombre          text,
  estado_revision    text,
  le_falta           text[],
  documentos         jsonb,
  revisado_en        timestamptz,
  cargado_en         timestamptz,
  primary key (orden_compra_id, carpeta_id)
);
alter table orden_compra_legajo enable row level security;
revoke all on orden_compra_legajo from anon, authenticated;
grant all on orden_compra_legajo to service_role;

-- ── Viáticos ────────────────────────────────────────────────────
alter table usuario
  add column if not exists auth_id_anterior uuid;            -- su cuenta en el proyecto viejo, para enlazar el login nuevo

alter table gasto
  add column if not exists proveedor_nombre text,            -- como lo declaró la persona (hay gastos sin RUC)
  add column if not exists storage_key      text,            -- la imagen en el almacenamiento de la app
  add column if not exists drive_url        text,
  add column if not exists sincronizado_en  timestamptz;

-- ── Lo que no calza en ninguna parte ────────────────────────────
-- Una fila de la base vieja que la mudanza no puede poner en su tabla (un
-- código de OC con otra forma, «2608-0028»; una línea del SIRE sin serie; una
-- lectura de un archivo que ya ningún recorrido ve) no se descarta: queda
-- aquí tal cual, con el motivo, para revisarla a mano. Lo escribe solo
-- pnpm db:mudanza (detalle.mudanza marca lo suyo y se reescribe en cada corrida).
create table if not exists dato_sin_ubicar (
  id         bigint generated always as identity primary key,
  origen     text not null,                 -- la tabla vieja
  motivo     text not null,
  fila       jsonb not null,                -- la fila, tal cual
  detalle    jsonb not null default '{}',
  mudado_en  timestamptz not null default now()
);
create index if not exists dato_sin_ubicar_origen_ix on dato_sin_ubicar (origen);
alter table dato_sin_ubicar enable row level security;
revoke all on dato_sin_ubicar from anon, authenticated;
grant all on dato_sin_ubicar to service_role;

notify pgrst, 'reload schema';

