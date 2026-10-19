# Base de datos v2 — rediseño (octubre 2026)

Base nueva de **INROCONTA**, en un **proyecto Supabase nuevo**, para la app
web Next.js (Vercel) y los jobs (GitHub Actions y laptop). Por ahora solo se
diseña: la migración de datos y el arreglo de los workflows van después.

| Archivo                           | Qué contiene                                                                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `001_nucleo.sql`                  | Empresa (con INROPRIN), centros de costo, corridas de los jobs, historial                                                                           |
| `002_comprobantes.sql`            | Contribuyentes, lista SSCO, comprobantes, registro de compras, ítems, cuotas, detracciones                                                          |
| `003_ordenes_de_compra.sql`       | OC, centros de costo y DUA de cada OC, vales de almacén, carpetas y archivos de Drive, vínculo con facturas, reglas a mano                          |
| `004_escrituras_comprobantes.sql` | `guardar_comprobantes_sunat`, `guardar_cpe`, `marcar_descargas_cpe`, `guardar_detracciones`, `guardar_retenciones`, `load_ssco`                     |
| `005_escrituras_oc.sql`           | `guardar_fuente_oc`, `guardar_carpetas_oc`, `cerrar_recorrido_oc`, `guardar_lecturas_archivo`, `guardar_calculos_oc`                                |
| `006_viaticos.sql`                | Viáticos: personas, roles, áreas, memos (con su solicitud), anexo, gastos, caja chica, movilidad, liquidación, pagos, devoluciones, parámetros      |
| `007_escrituras_viaticos.sql`     | Solicitud, emisión, anexo, estados, presentación, visto bueno, gastos, caja chica, firma de movilidad, liquidación y pagos                          |
| `008_aplicaciones.sql`            | Apps de escritorio: versiones publicadas por plataforma y canal, equipos instalados, y `buscar_actualizacion` (la llamada de «¿hay actualización?») |
| `009_acceso.sql`                  | Permisos de todo: solo `service_role`                                                                                                               |
| `010_documento_relacionado.sql`   | El documento relacionado del XML (anticipo) en sus columnas; `guardar_cpe` ya no lo mete en `modifica_*`                                            |

Todo junto, listo para pegar: **`docs/database/database.full.v2.sql`**
(GENERADO con `pnpm db:consolidar --v2`; `pnpm check` avisa si quedó viejo).

## Crear el proyecto nuevo de Supabase

1. Supabase → New project (capa gratuita). Guardar la contraseña de la base.
2. SQL Editor → pegar `database.full.v2.sql` entero → Run. Debe terminar sin
   errores en una base vacía.
3. Comprobar (SQL Editor):
   ```sql
   select count(*) from pg_tables where schemaname = 'public';   -- 44
   select * from empresa;                                         -- INROPRIN
   ```
4. Settings → API: copiar la URL y la llave **service_role** (secreta: va en
   variables de entorno de Vercel y secretos de GitHub, nunca en el
   navegador). La llave anon no sirve para nada en esta base.
5. Los datos y el cambio de la app y los workflows a la base nueva van
   después (ver «Qué cambia para cada consumidor»).

## Cómo se probó

`database.full.v2.sql` se aplicó en un Postgres vacío (PGlite) con los roles
de Supabase y se pasaron 52 comprobaciones de INROCONTA, 37 de viáticos y 10 de las apps de escritorio: estructura (44 tablas, 89 FK con
índice, RLS en todas, sin triggers, toda función con `search_path` fijo),
permisos (anon y authenticated sin acceso a nada; service_role sí), SIRE de
dos meses con cambios reales y repetidos, una DUA anotada dos veces, XML
guardado dos veces, lista SSCO, un comprobante de retención emitido y luego
revertido, las cinco fuentes de OC (incluida la hoja
cortada que se rechaza y el orden de carga que no cambia el resultado),
un recorrido de Drive por lotes con su cierre, y los cálculos (el centro de
costo del legajo y las reglas MANUAL no se pisan).

## Decisiones (14/10/2026)

- **VIÁTICOS entra a esta misma base, solo desde servidor** (decisión del
  15/10/2026; antes, el 14/10, se había decidido dejarlo en el proyecto viejo).
  Va en `006_viaticos.sql` y `007_escrituras_viaticos.sql`. La app de
  viáticos (repo ROTAFOLIO-AUTOMOTRIZ, Vercel `foto-grama`) deja de hablar
  con la base desde el navegador: su servidor revisa permisos y escribe con
  la llave de servicio, como INROCONTA. Estado del piloto al 15/10: sin uso
  desde el 25/09 («Memos: esperar a Franco»); 5 gastos, 1 liquidación.
- **El recorrido CAPTURA se retira** (`CapturaCarpetasOC.gs`,
  `LecturaFacturas.gs`, `SubirCapturaOC.gs`): era manual, su última carga
  fue el 29/09 y solo 6 de 1 628 facturas con OC dependían de él. La base
  de Control de Gestión que subía (centro de costo de cada OC) pasa a
  cargarla el workflow con Compras, COMEX y Almacén: hay que sumar esa
  pestaña a `CopiarFuentes.gs` y a `fuentes-compras.mts`.
- **Quedan dos recorridos de Drive:** CARPETA (workflow `carpetas-oc`, 98,5 %
  de los vínculos) y LEGAJO (`LegajoPorOC.gs` → `SubirLegajo.gs` cada noche,
  que además trae el cuadro de aprobaciones: comprador, situación de pago).
- **Un solo esquema (`public`), sin prefijos.** Cada tabla se llama como lo
  que es (`comprobante`, `registro_compras`, `orden_compra`); las hijas
  llevan el nombre del padre (`comprobante_item`, `orden_compra_dua`).
- **`contribuyente` tiene solo nuestros RUC**, con `ssco` sí/no. La lista
  completa de SUNAT (~770 RUC de todo el país) va en `lista_ssco`.

## Lo que encontramos en la base vieja

- **Triggers casi no había** (3, de viáticos). Lo lento era **recalcular en
  cada lectura**: `vinculos_oc()` cruzaba ~15 mil archivos contra ~18 mil
  comprobantes cada vez que alguien abría una hoja o una carpeta, y lo
  llamaban otras cinco funciones. Y el RLS evaluaba `puede_ver_todo()` **por
  fila**: `cpe_comprobante` no devolvía ni 50 filas.
- **Lo mismo guardado varias veces:** comprobante (2 tablas), RUC (3, más el
  nombre copiado en 6), OC (5), archivo de Drive (hasta 4 filas), historial
  (4 tablas), código CONCAR aparte del centro de costo.
- **Ni una FK** entre las tablas de OC, comprobantes y RUC.
- **La importación 172-2026 y la nacional 0172-2026 se mezclaban**: el SQL
  rellenaba siempre a 4 dígitos.
- **La regla de qué le falta al legajo** estaba en TypeScript, Apps Script y
  SQL, con listas distintas.
- `proyectos` estaba vacía; fechas de COMEX como texto.

## Reglas del diseño

1. **Lo pesado corre afuera** (GitHub Actions o la laptop), **no en
   Supabase ni en Vercel** (capas gratuitas). Cruces, vínculos, legajos,
   tipos de cambio, comparaciones contra lo que ya había: los calcula el
   script en TypeScript y manda el resultado hecho. La base solo **guarda**
   (`insert … on conflict`, una sentencia, sin bucles fila por fila) y
   **devuelve** (`select` por índice). Vercel solo lee y muestra.
2. **Se calcula una vez, al guardar.** El resultado queda en columnas;
   leer nunca recalcula. Lo derivado guarda `calculado_en` y el script solo
   recalcula lo que tiene una fuente más nueva.
3. **Sin triggers.** Lo que sale de la misma fila → columna generada
   (`generated always as … stored`), que no dispara nada. Las reglas →
   restricciones (`unique`, `check`, FK) o la función que guarda.
4. **Una cosa, una tabla.** Si otra fuente aporta datos de lo mismo, son
   columnas de esa fila, con su sello de tiempo por fuente. Si la relación
   es 1 a N de verdad (un comprobante y sus meses en el registro de
   compras; una OC y sus carpetas), son dos tablas sin columnas repetidas.
5. **Todo relacionado con FK**, con llaves naturales donde existen (RUC, id
   de Drive, número de constancia).
6. **Sin funciones de lectura.** La app y los scripts leen las tablas
   directo con supabase-js: las FK permiten traer lo relacionado en una
   llamada (`.select('*, contribuyente(*), registro_compras(*)')`), lo que
   pase de 1000 filas se pagina con `.range()`, y agrupar o armar cada
   pantalla es trabajo de Next.js. Funciones solo para **escribir** cuando
   hay que tocar varias tablas a la vez (todo o nada) o protegerse de un
   archivo malo; lo demás es `.upsert()` directo (ver `004_` y `005_escrituras_*.sql`).
   Esas funciones reciben el mismo JSON que mandan hoy los scripts.
7. **Acceso solo desde servidores** con la llave de servicio (`009_acceso.sql`).
   RLS activado y sin políticas: `anon` y `authenticated` no ven nada. Hoy la
   app (`src/shared/supabase/robot.ts`), los workflows y los Apps Script
   entran como el usuario robot con la llave anónima: al migrar pasan a la
   llave de servicio (los Apps Script la guardan en sus Propiedades).

## Cómo se relaciona todo

```
empresa ──< centro_costo
contribuyente (nuestros RUC, con ssco sí/no)        lista_ssco (Excel de SUNAT)
   │ emisor / receptor / proveedor
   ▼
comprobante ──< registro_compras   (un mes del Registro de Compras por fila)
   ├──< comprobante_item, comprobante_cuota
   ├──< detraccion_constancia
   ├──< retencion_documento >── retencion_comprobante (CRE)
   └──< comprobante_oc >── orden_compra ──< orden_compra_centro_costo >── centro_costo
                              ├──< orden_compra_dua
                              ├──< vale_almacen
                              └──< carpeta_oc ──< archivo (con su lectura por dentro)
corrida, cambio: bitácora de los jobs e historial de todo

VIÁTICOS
usuario ──< usuario_rol >── rol        usuario ── area, usuario_banco, jefatura (usuario)
memo (desde la solicitud) ──< memo_persona >── usuario
   ├── centro_costo, empresa, caja_chica, memo_padre / ciclo_anterior (memo)
   ├──< memo_autorizacion (visto bueno de la jefatura)
   ├──< gasto ──> contribuyente (proveedor), comprobante (la factura en SUNAT), planilla_movilidad
   ├──< pago ──< pago_linea      ├──< devolucion
   └──< liquidacion_memo >── liquidacion
```

## Qué cambia para cada consumidor

Nada de esto se toca todavía: la app y los workflows se adaptan cuando se
migre. Es la lista de lo que habrá que cambiar.

### App web (Next.js)

Lee los comprobantes del **libro INROCONTA** (pestaña DETALLE), que siguen
manteniendo los workflows. De la base, cada adaptador pasa de llamar una
función a leer tablas:

| Adaptador (`src/modules/…/infrastructure`) | Hoy llama                                                                                                            | En v2 lee                                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `SupabaseRucAdapter`                       | `fichas_ruc_json`, `ssco_json`, tabla `padron_ruc`                                                                   | `contribuyente`, `lista_ssco`                                                                                              |
| `SupabaseSalesTaxAdapter`                  | `cuadre_ventas_json`                                                                                                 | `comprobante` (origen EMITIDO, columnas `*_pen`) y suma por mes en Next                                                    |
| `SupabaseDetractionsAdapter`               | `detracciones_hoja`, `detracciones_sin_constancia`                                                                   | `detraccion_constancia` + `comprobante` (por `comprobante_id`)                                                             |
| `SupabaseLegajoAdapter`                    | `carpetas_madre_fuentes_json`, `facturas_sin_oc_json`, `detalle_de_carpeta`, tablas `fuente_copia`, `carpeta_cambio` | `orden_compra`, `carpeta_oc`, `archivo`, `vale_almacen`, `comprobante` (`sin_oc_*`), `comprobante_oc`, `corrida`, `cambio` |

### Workflows y scripts

| Quién                                                                                       | Hoy                                                                                                            | En v2                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sunat-diario.mts`                                                                          | `guardar_comprobantes_sunat`                                                                                   | Misma función y mismo JSON                                                                                                                                                                                                                                                                           |
|                                                                                             | `registrar_consulta_sunat`                                                                                     | `insert` en `corrida` (job `sire`)                                                                                                                                                                                                                                                                   |
|                                                                                             | `periodos_comprobantes_sunat`, `historico_comprobantes_sunat`, tabla `padron_ruc`                              | Lee `registro_compras` + `comprobante` + `contribuyente`                                                                                                                                                                                                                                             |
|                                                                                             | tabla `gastos` (de viáticos)                                                                                   | Resuelto: viáticos vive en esta base y `gasto.comprobante_id` une lo rendido con la factura; «rendido por» es un join                                                                                                                                                                                |
| `descargar-cpe.mts`, `consultar-cpe-individual.mts`, `local/comun/*`, `hojas/OrdenarCPE.gs` | `guardar_cpe`; tablas `comprobantes_sunat`, `cpe_comprobante`; archivo local `cpe-no-existe.jsonl`             | `guardar_cpe` igual (+ `tipoCambio` opcional); lo pendiente es `comprobante where xml_estado = 'PENDIENTE'`; lo que no se pudo bajar va a `marcar_descargas_cpe` (reemplaza el archivo local, así sirve en cualquier máquina)                                                                        |
| `consultar-padron-ruc.mts`, `local/ruc-fichas.mts`, `repair-padron-agents.mts`              | `rucs_por_actualizar_en_padron`, `guardar_padron_ruc`                                                          | Lee `contribuyente` por `padron_en`; `upsert` de sus columnas                                                                                                                                                                                                                                        |
| `padron-domicilios.mts`                                                                     | `rucs_para_domicilio`, `guardar_domicilios_ruc`                                                                | Lee `contribuyente`; `upsert` de las columnas de domicilio                                                                                                                                                                                                                                           |
| `load-ssco-db.mts`                                                                          | `load_ssco`                                                                                                    | Misma función y mismo JSON; marca `contribuyente.ssco`                                                                                                                                                                                                                                               |
| `local/detracciones/*`                                                                      | `guardar_detracciones`, `detracciones_guardadas`                                                               | `guardar_detracciones` con el mismo JSON (ahora une la constancia con su factura y crea proveedor y cliente en `contribuyente`); `detracciones_guardadas` pasa a leer la tabla                                                                                                                       |
| `local/retenciones/*`                                                                       | `guardar_retenciones`, `retenciones_guardadas`                                                                 | Misma función y mismo JSON; `retenciones_guardadas` pasa a leer `retencion_comprobante` directo                                                                                                                                                                                                      |
| `export/items-sunat.ts` (publica DETALLE)                                                   | `detalle_cpe_hoja_con_retencion`, `periodos_detalle_cpe`                                                       | Lee `comprobante` + `comprobante_item` + `comprobante_oc` + `detraccion_constancia` y arma la hoja en TS                                                                                                                                                                                             |
| `fuentes-compras.mts`                                                                       | `cargar_fuentes_compras` (incluida la fuente COPIA)                                                            | `guardar_fuente_oc` una vez por fuente (COMPRAS, COMEX, CG, ALMACEN): `orden_compra`, `orden_compra_dua`, `orden_compra_centro_costo`, `vale_almacen`. La base de CG es nueva aquí (antes la subía CAPTURA). La copia de pestañas (COPIA) es un `insert` en `corrida` (job `copia-fuentes`)          |
| `carpetas-oc.mts`                                                                           | `cargar_carpetas_oc`, `guardar_lecturas_archivo`, `guardar_centro_costo_proyectos`, `guardar_cambios_carpetas` | `guardar_carpetas_oc` por lotes + `cerrar_recorrido_oc` al final; `guardar_lecturas_archivo` con el mismo JSON. Además calcula en TS lo que hacían `vinculos_oc`, `facturas_sin_oc` y `carpetas_madre_fuentes` y lo guarda con `guardar_calculos_oc` (reglas de centro de costo y cambios incluidos) |

### Apps Script que quedan (mantienen pestañas del libro)

| Script                                                                  | Hoy                                                   | En v2                                                                                                                                                                 |
| ----------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inroconta/CarpetaMadre.gs`                                             | `carpetas_madre_fuentes_json`, `facturas_sin_oc_json` | Lee tablas por REST (`/rest/v1/orden_compra?select=…`)                                                                                                                |
| `hojas/SubirLegajo.gs`                                                  | `cargar_legajo_oc`, `vinculos_oc`                     | `guardar_fuente_oc('LEGAJO', …)` para el cuadro y `guardar_carpetas_oc('LEGAJO', …)` + `cerrar_recorrido_oc` para sus carpetas; el vínculo se lee de `comprobante_oc` |
| `hojas/AlertasLegajo.gs`                                                | `carpetas_madre`, `facturas_sin_oc`                   | Lee tablas por REST                                                                                                                                                   |
| `hojas/VerificarComprobantes.gs`                                        | `verificar_comprobantes_json`                         | Lee `comprobante` por REST                                                                                                                                            |
| `hojas/OrdenarCPE.gs`                                                   | `guardar_cpe`                                         | Misma función                                                                                                                                                         |
| `hojas/CapturaCarpetasOC.gs`, `LecturaFacturas.gs`, `SubirCapturaOC.gs` | `cargar_captura_oc`                                   | **Se retiran** (CAPTURA)                                                                                                                                              |

### App de viáticos (repo ROTAFOLIO-AUTOMOTRIZ)

| Hoy                                                                                                                             | En v2                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navegador y servidor hablan con la base con la clave pública y el RLS por persona (`lib/supabase/cliente.ts`, `servidor.ts`)    | Solo el servidor, con la llave de servicio; el login (Supabase Auth con DNI) sigue igual, pero los datos se piden por acciones de servidor que revisan `permisos.ts`         |
| `Captura.tsx` y `BandejaSinAsignar.tsx` insertan gastos desde el navegador                                                      | `guardar_gastos` desde una acción de servidor                                                                                                                                |
| `crearMemo`, `reponerCaja`, `emitirMemoDeSolicitud`: varias escrituras sueltas                                                  | `emitir_memo` (todo o nada); la solicitud es `guardar_solicitud` / `responder_solicitud` / `retirar_solicitud`                                                               |
| `cambiar_estado_memo`, `presentar_memo`, `emitir_liquidacion`, `registrar_pago_liquidacion`, `crear_caja_chica`, autorizaciones | Mismas ideas, con `p_usuario`; `crear_caja_chica` pasa a `crear_caja_invertida`; nuevas `anular_liquidacion`, `firmar_planilla_movilidad`, `registrar_pago`, `cambiar_anexo` |
| `correo_de_acceso` (DNI → correo sintético)                                                                                     | Lo arma el servidor: `<dni>@sin-correo.local`                                                                                                                                |
| `memo_cuadra`, `saldo_de_caja`, `devuelto_por_persona`, `cobrado_por_persona`, `faltas_de_movilidad`                            | En TypeScript (ya existe la copia en `lib/dominio`)                                                                                                                          |
| Pantalla Sistema → SUNAT (lee y escribe tablas de INROCONTA)                                                                    | Se quita: vive en la app de INROCONTA                                                                                                                                        |
| Copia vieja de la automatización SUNAT (`scripts/`, `lib/sunat`, migraciones hasta la 052)                                      | Se quita del repo                                                                                                                                                            |

### Apps de escritorio (actualización automática)

La app no habla con la base. Al arrancar llama a una ruta del servidor de
INROCONTA (p. ej. `GET /api/apps/<codigo>/actualizacion?version=1.4.2&plataforma=windows-x64&equipo=<id>`),
que llama a `buscar_actualizacion` y devuelve la respuesta en el formato del
actualizador que use cada app. Publicar una versión es un `insert` en
`aplicacion_version` desde el workflow de release; el instalador queda en
GitHub Releases, Supabase Storage o Drive, y en la base solo su enlace y su
SHA-256.
