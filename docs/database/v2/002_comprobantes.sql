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
