-- The full Consulta RUC ficha in padron_ruc
--
-- padron_ruc kept only state, condition and the padrones (038). Contabilidad asked (13/10/2026)
-- for the whole ficha SUNAT shows — taxpayer type, dates, activities, receipts, electronic
-- issuing, PLE — inside the app, so nobody has to open e-consultaruc. The robot already loads
-- that page for every RUC; it was throwing the rest away.
--
-- Column names stay in Spanish, like the rest of the table. Lists are jsonb arrays:
--   actividades             [{ "kind": "Principal", "code": "4652", "description": "…" }]
--   comprobantes_impresion  ["FACTURA", "BOLETA DE VENTA", …]
--   emision_electronica     ["FACTURA PORTAL DESDE 05/08/2016", …]
--
-- ficha_consultada_en says which rows already carry the full ficha: null = only the old fields
-- (the 3 018 rows of 13/10/2026). `pnpm ruc:fichas` fills them.
--
-- guardar_padron_ruc writes the ficha only when the row brings a "ficha" object, so a caller
-- that still sends the old shape never blanks a stored ficha. Same name, arguments and return
-- type as in 038: no DROP needed.
--
-- The SSCO migration of P-006 (kept outside the repo, also numbered 068) becomes 069 when it is applied.
--
-- Run twice without harm: «add column if not exists» and «create or replace».

begin;

-- Before: every row without a ficha (expected 3 018 on 13/10/2026, the whole table).
-- select count(*) from padron_ruc;

alter table padron_ruc
  add column if not exists tipo_contribuyente        text,
  add column if not exists documento                 text,
  add column if not exists nombre_comercial          text,
  add column if not exists fecha_inscripcion         date,
  add column if not exists fecha_inicio_actividades  date,
  add column if not exists fecha_baja                date,
  add column if not exists domicilio_fiscal          text,
  add column if not exists sistema_emision           text,
  add column if not exists comercio_exterior         text,
  add column if not exists sistema_contabilidad      text,
  add column if not exists actividades               jsonb not null default '[]'::jsonb,
  add column if not exists comprobantes_impresion    jsonb not null default '[]'::jsonb,
  add column if not exists emision_electronica       jsonb not null default '[]'::jsonb,
  add column if not exists emisor_electronico_desde  date,
  add column if not exists comprobantes_electronicos text,
  add column if not exists ple_desde                 date,
  add column if not exists aviso                     text,
  add column if not exists ficha_consultada_en       timestamptz;

comment on column padron_ruc.documento is 'Natural persons only: «DNI 00872109».';
comment on column padron_ruc.domicilio_fiscal is 'As the Consulta RUC shows it («-» for natural persons → null). ruc_domicilio keeps the padrón reducido one.';
comment on column padron_ruc.aviso is 'The red IMPORTANTE notice of a deregistered RUC (its receipts give no IGV credit).';
comment on column padron_ruc.ficha_consultada_en is 'When the full ficha was last read. Null = the row only has the fields of migration 038.';

create or replace function guardar_padron_ruc(p_filas jsonb)
returns integer
language plpgsql
security definer
set search_path = public, seguridad, pg_temp
as $$
declare
  v_guardados integer := 0;
  f           jsonb;
  x           jsonb;
begin
  if seguridad.usuario_actual() is null then
    raise exception 'No hay sesión.';
  end if;
  if not seguridad.tiene_rol('ADMIN_SISTEMA') then
    raise exception 'Solo Administración del sistema actualiza el padrón de RUC.';
  end if;

  for f in select * from jsonb_array_elements(p_filas)
  loop
    insert into padron_ruc (
      ruc, razon_social, estado, condicion,
      buen_contribuyente, agente_retencion, agente_percepcion,
      padrones_detalle, consultado_en
    ) values (
      f->>'ruc', nullif(f->>'razonSocial', ''), nullif(f->>'estado', ''), nullif(f->>'condicion', ''),
      coalesce((f->>'buenContribuyente')::boolean, false),
      coalesce((f->>'agenteRetencion')::boolean, false),
      coalesce((f->>'agentePercepcion')::boolean, false),
      nullif(f->>'padronesTexto', ''), now()
    )
    on conflict (ruc) do update set
      razon_social       = excluded.razon_social,
      estado             = excluded.estado,
      condicion          = excluded.condicion,
      buen_contribuyente = excluded.buen_contribuyente,
      agente_retencion   = excluded.agente_retencion,
      agente_percepcion  = excluded.agente_percepcion,
      padrones_detalle   = excluded.padrones_detalle,
      consultado_en      = now();

    x := f->'ficha';
    if jsonb_typeof(x) = 'object' then
      update padron_ruc set
        tipo_contribuyente        = nullif(x->>'taxpayerType', ''),
        documento                 = nullif(x->>'document', ''),
        nombre_comercial          = nullif(x->>'tradeName', ''),
        fecha_inscripcion         = (nullif(x->>'registeredOn', ''))::date,
        fecha_inicio_actividades  = (nullif(x->>'activitiesStartOn', ''))::date,
        fecha_baja                = (nullif(x->>'deregisteredOn', ''))::date,
        domicilio_fiscal          = nullif(x->>'fiscalAddress', ''),
        sistema_emision           = nullif(x->>'issuingSystem', ''),
        comercio_exterior         = nullif(x->>'foreignTrade', ''),
        sistema_contabilidad      = nullif(x->>'accountingSystem', ''),
        actividades               = coalesce(x->'activities', '[]'::jsonb),
        comprobantes_impresion    = coalesce(x->'printedReceipts', '[]'::jsonb),
        emision_electronica       = coalesce(x->'electronicIssuing', '[]'::jsonb),
        emisor_electronico_desde  = (nullif(x->>'electronicIssuerSince', ''))::date,
        comprobantes_electronicos = nullif(x->>'electronicReceipts', ''),
        ple_desde                 = (nullif(x->>'pleSince', ''))::date,
        aviso                     = nullif(x->>'notice', ''),
        ficha_consultada_en       = now()
      where ruc = f->>'ruc';
    end if;

    v_guardados := v_guardados + 1;
  end loop;

  return v_guardados;
end;
$$;

revoke execute on function guardar_padron_ruc(jsonb) from public, anon;
grant  execute on function guardar_padron_ruc(jsonb) to authenticated;

commit;

-- After: the new columns exist and nothing has a ficha yet (expected: 3 018 | 0).
-- select count(*) as filas, count(ficha_consultada_en) as con_ficha from padron_ruc;
