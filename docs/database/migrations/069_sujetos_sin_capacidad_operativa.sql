-- Sujetos sin capacidad operativa (SSCO)
--
-- Meeting with Accounting (07/10/2026): before registering a purchase they
-- check the supplier in SUNAT — active and «habido», good taxpayer, withholding
-- and perception agent — and also whether it is in SUNAT's list of «sujetos
-- sin capacidad operativa»: taxpayers SUNAT has declared unable to have really
-- supplied what they invoiced. Their invoices do not support tax credit or
-- expense, so Accounting does not register them.
--
-- SUNAT publishes the list as an Excel file that it keeps adding to (766 RUC
-- on 30/09/2026). It is not part of the reduced registry (padrón reducido) nor
-- of the RUC query, so it gets its own table, loaded from the file with
-- `pnpm ssco:db <file.xlsx>` (scripts/load-ssco-db.mts). Each load REPLACES the
-- list: a RUC that SUNAT removed must stop being flagged.
--
-- The view reads it whole (ssco_json): the ficha of a supplier, the «Consulta
-- RUC» section (any RUC, not only ours) and the warning about received
-- invoices from SSCO suppliers.
--
-- Written on 09/10/2026 as 068 and kept outside the repo while the project could not take
-- migrations (the list lived in the SSCO tab of the book). Applied on 13/10/2026 as 069
-- (068 went to the full RUC ficha); from then on the view reads the list from here.

create table if not exists ruc_ssco (
  ruc                      text primary key check (ruc ~ '^\d{11}$'),
  business_name            text not null,
  tax_address              text,
  resolution               text not null,
  resolution_date          date,
  final_date               date,
  representative_document  text,
  representative_name      text,
  published_on             date,
  loaded_at                timestamptz not null default now()
);

comment on table ruc_ssco is
  'SUNAT list of «sujetos sin capacidad operativa» (SSCO), loaded from the Excel SUNAT publishes (scripts/load-ssco-db.mts). Replaced whole on each load. final_date: when the attribution resolution became final; published_on: when SUNAT added it to the list.';

alter table ruc_ssco enable row level security;

-- Dropped first so the migration can run twice.
drop policy if exists ruc_ssco_read on ruc_ssco;
create policy ruc_ssco_read on ruc_ssco for select using (seguridad.puede_ver_todo());

revoke all on ruc_ssco from anon;
revoke insert, update, delete, truncate, references, trigger on ruc_ssco from authenticated;

-- Replaces the list with p_rows (one object per RUC) in one transaction and
-- returns how many rows were loaded and removed. Refuses a list with less
-- than half the rows already loaded: that is a cut file, not SUNAT removing
-- half of the list.
create or replace function load_ssco(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, seguridad, pg_temp
as $$
declare
  v_new integer;
  v_old integer;
  v_removed integer;
  v_loaded integer;
begin
  if seguridad.usuario_actual() is null then
    raise exception 'No hay sesión.';
  end if;
  if not seguridad.tiene_rol('ADMIN_SISTEMA') then
    raise exception 'Solo Administración del sistema carga la lista SSCO.';
  end if;

  select count(distinct f->>'ruc') into v_new from jsonb_array_elements(p_rows) f where f->>'ruc' ~ '^\d{11}$';
  select count(*) into v_old from ruc_ssco;
  if v_new = 0 or v_new < v_old / 2 then
    raise exception 'La lista nueva trae % RUC y la cargada tiene %: no se reemplaza (¿archivo incompleto?).', v_new, v_old;
  end if;

  delete from ruc_ssco s
   where not exists (select 1 from jsonb_array_elements(p_rows) f where f->>'ruc' = s.ruc);
  get diagnostics v_removed = row_count;

  insert into ruc_ssco as s (ruc, business_name, tax_address, resolution, resolution_date, final_date,
                             representative_document, representative_name, published_on, loaded_at)
  select distinct on (f->>'ruc')
         f->>'ruc', f->>'businessName', nullif(f->>'taxAddress', ''), f->>'resolution',
         nullif(f->>'resolutionDate', '')::date, nullif(f->>'finalDate', '')::date,
         nullif(f->>'representativeDocument', ''), nullif(f->>'representativeName', ''),
         nullif(f->>'publishedOn', '')::date, now()
    from jsonb_array_elements(p_rows) f
   where f->>'ruc' ~ '^\d{11}$'
   order by f->>'ruc', nullif(f->>'publishedOn', '')::date desc nulls last
  on conflict (ruc) do update set
    business_name = excluded.business_name, tax_address = excluded.tax_address, resolution = excluded.resolution,
    resolution_date = excluded.resolution_date, final_date = excluded.final_date,
    representative_document = excluded.representative_document, representative_name = excluded.representative_name,
    published_on = excluded.published_on, loaded_at = excluded.loaded_at;
  get diagnostics v_loaded = row_count;

  return jsonb_build_object('loaded', v_loaded, 'removed', v_removed);
end;
$$;

-- The whole list for the view, in one row:
-- [ruc, business name, resolution, resolution date, final date, published on, representative name]
-- (dates as yyyy-mm-dd, '' when SUNAT left them blank).
create or replace function ssco_json()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_array(
           s.ruc, s.business_name, s.resolution,
           coalesce(to_char(s.resolution_date, 'YYYY-MM-DD'), ''), coalesce(to_char(s.final_date, 'YYYY-MM-DD'), ''),
           coalesce(to_char(s.published_on, 'YYYY-MM-DD'), ''), coalesce(s.representative_name, '')
         ) order by s.ruc), '[]'::jsonb)
    from ruc_ssco s
   where (select seguridad.puede_ver_todo());
$$;

revoke execute on function load_ssco(jsonb) from public, anon;
grant execute on function load_ssco(jsonb) to authenticated;
revoke execute on function ssco_json() from public, anon;
grant execute on function ssco_json() to authenticated;

-- Check after applying (read only):
--   select count(*) from ruc_ssco;                       -- 0 until the first `pnpm ssco:db`
--   select jsonb_array_length(ssco_json());              -- the same number, as the robot user
