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
