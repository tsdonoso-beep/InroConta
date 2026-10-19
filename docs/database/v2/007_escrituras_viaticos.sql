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
