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
