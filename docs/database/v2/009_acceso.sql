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
