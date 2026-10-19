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
