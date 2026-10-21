-- ════════════════════════════════════════════════════════════════
-- 013 · QUIÉN ENTRA A LA APP WEB DE INROCONTA
--done
-- La lista de cuentas que pueden entrar a la app (src/shared/auth/access.ts).
-- Antes era la pestaña USUARIOS del libro; la app ya no lee hojas. Se edita
-- en Supabase → Table Editor → usuario_inroconta: una fila por persona;
-- `activo = false` (o borrar la fila) cierra la puerta en un minuto, aunque
-- su sesión de 30 días siga viva. No es `usuario` (006): esas son las
-- personas de viáticos, con su auth de Supabase; INROCONTA entra con Google.
--
-- Acceso como todo lo demás (009): RLS sin políticas, solo service_role.
--
-- Se puede correr dos veces.
-- ════════════════════════════════════════════════════════════════

create table if not exists usuario_inroconta (
  correo     text primary key check (correo = lower(btrim(correo)) and correo like '%@inroprin.com'),
  nombre     text,
  rol        text not null default 'lector' check (rol in ('admin', 'lector')),
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

alter table usuario_inroconta enable row level security;
revoke all on usuario_inroconta from anon, authenticated;
grant  all on usuario_inroconta to service_role;

notify pgrst, 'reload schema';
