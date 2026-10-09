# Guía del repositorio — dónde está cada cosa

> Punto de entrada para cualquier persona (o asistente de IA) que llegue a
> este repositorio. Explica qué hay, dónde corre, qué credenciales usa, cómo
> se verifica que funciona y dónde están los documentos de detalle.
>
> **Vigente al 30/09/2026** (estructura de carpetas al 07/10/2026). Los números de la sección 11 son una foto de ese
> día; la sección 12 dice cómo sacarlos de nuevo.

---

## 0. Antes de empezar: el contexto que existe

| Archivo                            | Qué es                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `CLAUDE.md`                        | Instrucciones que lee Claude Code al abrir el repo: apunta a esta guía. |
| **`docs/GUIA-DEL-REPOSITORIO.md`** | Este archivo: el índice general.                                        |
| `README.md`                        | Resumen corto y mapa de carpetas.                                       |
| `docs/ESTADO-Y-PENDIENTES.md`      | Memoria de trabajo: dónde vive todo hoy y qué falta.                    |

---

## 1. Qué es este repositorio

**INROCONTA** — el sistema de comprobantes SUNAT para Contabilidad
(GitHub Actions + Playwright + Google Apps Script). Trae de SUNAT el registro
de compras (SIRE), baja el XML/PDF de cada comprobante, lo archiva en Drive,
guarda el detalle de ítems en la base y publica el libro **INROCONTA** que usa
Contabilidad. Encima de eso, el cruce con las **órdenes de compra (OC)**, sus
carpetas madre y sus centros de costo, el padrón de RUC y el domicilio fiscal.

Se separó el 07/10/2026 del repositorio `ROTAFOLIO-AUTOMOTRIZ`, donde queda
la aplicación web de viáticos (**INRO VIÁTICOS**, Next.js en Vercel). Los dos
comparten la base de datos (Supabase) y Google Drive.

Empresa: **INDUSTRIAS ROLAND PRINT S.A.C. — INROPRIN**, RUC `20512201611`.

---

## 2. Mapa de carpetas

```
.github/workflows/        Los 11 workflows (sección 4)
src/                      Google Apps Script: los .gs y .html que se pegan en
                          el libro y las hojas (sección 10)
  shared/lib/             Lógica compartida que usan los scripts (sección 9)
    sunat/                Token, SIRE, lectura de XML, catálogo de consultas, padrón
    export/               Armado de las hojas (COMPROBANTES SUNAT, DETALLE…)
    drive/                Escritura en Drive, publicación de hojas, carpetas de OC, OCR
    dominio/              Tipos compartidos
scripts/                  Lo que corren los workflows (Node + Playwright)
  local/                  Pipeline de CPE por la API de SUNAT y utilidades de laptop
                          (docs/pipeline-cpe-local.md)
    detracciones/         Constancias de detracción (SPOT): la corrida diaria y el
                          reconocimiento (docs/detracciones-spot.md)
  out/                    Resultados de cada corrida: logs/, salida/, capturas/
                          (fuera de git; en Actions se suben como artefactos)
docs/                     Documentos de detalle (sección 13)
  database/               database.full.sql (GENERADO: pnpm db:consolidar)
    migrations/           Las migraciones SQL, en orden
public/                   Archivos estáticos (vacía por ahora)
```

---

## 3. Dónde corre cada cosa

| Pieza                     | Dónde vive                                                                               | Cómo se despliega                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Automatización SUNAT      | **GitHub Actions** de este repo                                                          | El workflow se lee de `main` en cada corrida                          |
| Base de datos             | **Supabase**, proyecto `vqabgnynidehfqueupki`                                            | Migraciones de `docs/database/migrations/` aplicadas a mano, en orden |
| XML y PDF de comprobantes | **Google Drive**, carpeta `SUNAT_DRIVE_FOLDER` → `Recibidas/AAAA-MM`, `Emitidas/AAAA-MM` | Los sube la cuenta de servicio                                        |
| Hojas publicadas          | **Google Drive**, carpeta `GOOGLE_DRIVE_FOLDER_ID` → `SUNAT/`                            | Se reescribe la pestaña de datos en cada corrida                      |
| Tableros y captura de OC  | **Google Apps Script**, pegado en cada hoja                                              | A mano (instrucciones en `docs/apps-script.md`)                       |

**Por qué la automatización está en GitHub Actions y no en Vercel:** un cron
de Vercel muere al minuto, y SUNAT tarda entre 1 y 3 minutos en responder un
ticket del SIRE (y horas para confirmar comprobantes uno por uno). Apps Script
tampoco sirve: no puede manejar un navegador, y las pantallas de SOL lo exigen.

---

## 4. Los workflows (GitHub Actions)

Todos están en `.github/workflows/`. Todos se pueden correr a mano desde la
pestaña **Actions** → elegir el workflow → **Run workflow**. Todos suben un
artefacto `capturas-*` con capturas de pantalla y HTML de cada paso (7 días),
que es la evidencia para diagnosticar cuando algo falla.

### 4.1 Horario diario (hora de Lima, UTC-5)

| Hora          | Workflow                                           | Qué hace                                                                                                                                                  |
| ------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00:45 y 11:15 | _(Apps Script de Contabilidad)_ `CopiarFuentes.gs` | Copia a una hoja privada la base de Compras, el STATUS de COMEX y el kardex de Almacén                                                                    |
| 01:17 y 11:47 | **Carpetas de OC (nacionales e importaciones)**    | Primero lee esa hoja privada (Compras, COMEX, Almacén); luego los nombres de las carpetas madre de compras nacionales e importaciones (OC y comprobantes) |
| 08:00         | **SUNAT diario**                                   | Pide al SIRE la lista de compras (mes actual y anterior)                                                                                                  |
| 08:00         | **SUNAT descargar XML**                            | Baja XML/PDF de serie **E001** de ayer y hoy                                                                                                              |
| 08:30         | **SUNAT CPE por API**                              | Baja XML y PDF de los **no-E001** directo de la API de SUNAT (mes anterior + actual, todos los pendientes)                                                |
| 09:00         | **SUNAT padrón de RUC**                            | Consulta la condición de los RUC nuevos o vencidos                                                                                                        |
| 09:30         | **SUNAT detracciones**                             | Baja las constancias de depósito de detracción pagadas en los últimos 10 días, las archiva en Drive y las cruza con las facturas                          |
| —             | _(a mano)_ consultar CPE individual                | Respaldo por pantallas, sin cron desde el 30/09/2026                                                                                                      |
| —             | _(a mano)_ SUNAT detracciones (reconocimiento)     | Prueba del recorrido SPOT, sin guardar                                                                                                                    |

### 4.2 Ficha de cada workflow

#### SUNAT diario — `sunat-diario.yml` → `scripts/sunat-diario.mts`

- **Qué hace:** pide por la **API del SIRE** (no navegador) la propuesta del
  Registro de Compras del mes en curso y el anterior —el anterior porque los
  proveedores siguen declarando semanas después del cierre—. Guarda cada
  comprobante en `comprobantes_sunat` (cabecera: RUC, serie, número, montos,
  IGV, detracción) y publica la hoja **COMPROBANTES SUNAT**.
- **Es la fuente de la verdad de "qué existe".** No baja XML ni PDF.
- **Trae todas las series** (E001, F001, FC01…). Es lo que agrega los
  pendientes nuevos cada mañana.
- **Cuándo:** cron 08:00 + manual (`periodos`, `solo_publicar`). Tope 25 min.
- **Credenciales:** `SUNAT_INROPRIN_CLIENT_ID/_CLIENT_SECRET/_USUARIO/_CLAVE`
  (API del SIRE), robot de la base, cuenta de servicio de Google.
- Detalle: `docs/cron-sunat.md`.

#### SUNAT descargar XML — `descargar-cpe.yml` → `scripts/descargar-cpe.mts`

- **Qué hace:** entra a SOL con Playwright, usa las pantallas de consulta **por
  rango de fechas** («Consultar Factura y Nota», «Consultar Boleta de Venta y
  Nota»), baja XML y PDF, los archiva en Drive y guarda el detalle de ítems
  en `cpe_comprobante` / `cpe_item`. Publica **COMPROBANTES SUNAT - DETALLE**.
- **Limitación estructural:** esa pantalla **solo ve serie E001**. No es un
  bug: es el portal. Por eso existe el workflow siguiente.
- **Cuándo:** cron 08:00 con ventana de **ayer y hoy** (una ventana ancha
  diaria reventaba el límite de solicitudes de SUNAT) + manual con rango.
  Tope 120 min.
- **Tipos:** los 10 del catálogo `src/shared/lib/sunat/cpe-consulta.ts` (FE/NC/ND
  emitidas y recibidas; BVE/NC-BVE/ND-BVE).
- Detalle: `docs/descarga-cpe-y-detalle-de-items.md`,
  `docs/scraper-cpe-hallazgos-tecnicos.md`.

#### SUNAT extraer rango (hoja aparte) — `extraer-cpe-rango.yml` → `scripts/descargar-cpe.mts`

- **Qué hace:** el mismo motor que el anterior, pero para **rellenar meses
  completos a mano**: parte el rango por mes y deja además una hoja con solo
  esos meses («COMPROBANTES SUNAT - DETALLE 2026-08 a 2026-09»).
- **Cuándo:** solo manual. Tope 330 min.
- Detalle: `docs/extraer-boletas-y-rangos-largos.md`.

#### SUNAT CPE por API — `sunat-cpe-api.yml` → `scripts/local/cpe.mts`

- **Qué hace:** lo mismo que el siguiente, pero sin pantallas: entra a SOL una
  vez, toma el token de la app «Nueva Consulta» y baja XML y PDF directo de
  `api-cpe.sunat.gob.pe`, 8 a la vez. ~300 ms por XML y ~88% a la primera (el
  resto se reintenta). Colas separadas SUNAT → PDF → Drive → Supabase, con el
  estado de cada etapa. **Es el mismo script que se corre en una laptop.**
- **Cuándo:** cron 08:30 (mes anterior + actual) + manual (`periodo`, `modo`
  nuevos/pdf, `workers`, `limite`, `via`). Tope 180 min.
- Detalle, comandos locales y diagnóstico: **`docs/pipeline-cpe-local.md`**.

#### SUNAT consultar CPE individual — `consultar-cpe-individual.yml` → `scripts/consultar-cpe-individual.mts`

- **Respaldo desde el 30/09/2026, solo manual**: el cron lo tomó el de arriba.
- **Qué hace:** para cada comprobante **no-E001** que el SIRE dice que existe
  y que todavía no está en `cpe_comprobante`, entra a SOL → «Nueva Consulta de
  comprobantes de pago», llena RUC + tipo + serie + número, abre el modal
  «Resultado», baja XML y PDF, los archiva en Drive y guarda el detalle.
  Guarda y republica la hoja de detalle **cada 20 confirmados**.
- **Cuándo:**
  - **Cron 08:30:** mes anterior + actual, **lo más reciente primero**, 100 por día.
  - **Manual:** `periodo` (por omisión `202609`, admite varios separados por
    coma; vacío = **todos**, ojo que incluye el backlog desde enero),
    `orden` (`antiguo`/`reciente`), `limite` (por omisión 3), `debug`
    (por omisión **true**: no guarda nada, solo captura).
- **Nunca dos a la vez** (`concurrency`): comparten la cuenta de SOL y una
  segunda sesión puede hacer que SUNAT cierre la primera. La segunda espera.
- **Tiempo:** ~20-30 s por comprobante si SUNAT responde bien; bastante más
  cuando SUNAT está inestable. Tope 180 min → lotes de hasta ~150.
- **Tipos:** factura (01), nota de crédito (07), nota de débito (08). Desde el
  29/09/2026 el desplegable de SUNAT junta la nota con lo que modifica
  («Factura - Nota de Crédito» / «Boleta de Venta - Nota de Crédito»); el
  script elige por el prefijo de la serie (F→Factura, B→Boleta).

#### SUNAT padrón de RUC — `consultar-padron-ruc.yml` → `scripts/consultar-padron-ruc.mts`

- **Qué hace:** consulta la **Consulta RUC pública** (con reCAPTCHA v3, por eso
  navegador) para saber si cada proveedor es Buen Contribuyente o Agente de
  Retención/Percepción. Guarda en `padron_ruc`. Solo consulta RUC nuevos o con
  más de 30 días.
- **Cuándo:** cron 09:00 + manual. Tope 30 min. No necesita Clave SOL.

#### SUNAT domicilio fiscal — `padron-domicilios.yml` → `scripts/padron-domicilios.mts`

- **Qué hace:** baja el **padrón reducido** que SUNAT publica cada día
  (~400 MB, todos los RUC del país), lo lee sin descomprimirlo a disco y
  guarda en `ruc_domicilio` la dirección, distrito, provincia y departamento
  de nuestros RUC (`rucs_para_domicilio`: proveedores, clientes, Base de
  Compras). Los nombres del ubigeo salen de la lista del INEI del paquete npm
  `ubigeo-peru`, bajada en cada corrida. Las personas naturales vienen sin
  dirección. La vista lo muestra con `fichas_ruc_json`.
- **Cuándo:** lunes 09:40 + manual. ~1 min. No necesita Clave SOL.

#### Carpetas de OC (nacionales e importaciones) — `carpetas-oc.yml` → `scripts/carpetas-oc.mts`

- **Qué hace:** recorre la carpeta madre de compras nacionales
  («5. Ordenes de Compra», compartida como Lector con la cuenta de servicio)
  **solo por nombres**, sin descargar: de cada carpeta «OC 2026 - 0200
  PROVEEDOR - PROYECTO» saca la OC, y de cada archivo qué parece (factura,
  XML, guía…) y la serie del comprobante (`src/shared/lib/drive/carpetas-oc.ts`, la
  misma regla que `LegajoPorOC.gs`). Sube a `oc_carpeta` y a `oc_archivo`
  con origen `CARPETA` (migración 045), que `vinculos_oc()` usa para unir
  cada factura de SUNAT con su OC. Publica la hoja «OC - CARPETAS COMPRAS
  NACIONALES» (pestañas de OC y de ARCHIVOS) en la carpeta SUNAT.
- **Lectura por dentro:** lo que el nombre no explica («scan001.pdf»,
  «WhatsApp Image…», «FACTURA LUCY.pdf» sin número, «INVOICE», XML o ZIP sin
  serie) se baja y se lee: el XML/ZIP exacto, el texto del PDF (`pdftotext`)
  o, si es escaneo o foto, OCR (`tesseract`, español e inglés). Saca tipo,
  serie-número, RUC del emisor (validado con su dígito verificador) y la OC
  que cita el XML (`src/shared/lib/drive/lectura.ts`, la misma regla que el OCR de
  `LegajoPorOC.gs`). Cada archivo se lee una vez: queda en `lectura_archivo`
  (migración 048) y solo se relee si cambió o si dio error. Cada noche hasta
  3000 archivos / 45 min (nacionales) y 30 min (importaciones); lo que no
  alcance sigue la noche siguiente. En el cruce cuenta como «Lectura del
  documento», la fuente más segura. Detalle en `lecturas.csv` y en las
  columnas «Leído por dentro» de la pestaña ARCHIVOS.
- **Legajo y centro de costo:** de cada OC dice qué documentos tiene y cuál
  le falta (la regla de `LegajoPorOC.gs`: factura; guía si es bien; acta si
  es servicio; DAM si es importación) y le pone centro de costo: el de la OC
  en CG (o en el cuadro, si es importación) y, si no está, el de su carpeta
  de proyecto (`src/shared/lib/drive/legajo-carpeta.ts`; lo administrativo, por ahora,
  al área administrativa general). La regla por carpeta queda en
  `proyecto_centro_costo` y en la pestaña CENTRO DE COSTO; una fila con
  fuente `MANUAL` (corregida por Contabilidad) no se pisa (migración 049).
- **Cambios:** en cada corrida completa compara con la anterior y anota en
  `carpeta_cambio` (pestaña CAMBIOS, 60 días) las OC nuevas o que ya no
  están, los archivos nuevos, eliminados, modificados o renombrados, y las
  OC que se completaron o a las que ahora les falta algo.
- **En una computadora:** `pnpm carpetas:local` (ver
  `docs/carpetas-oc-local.md`): la carga pesada sin gastar minutos de GitHub;
  se corta y continúa donde quedó.
- **Importaciones:** el mismo script con `PROCEDENCIA=importacion` lee la
  carpeta de importaciones; ahí la OC va con 3 dígitos («172-2026», como en
  el cuadro de aprobaciones), se compara contra el legajo del cuadro en vez
  de CG y publica «OC - CARPETAS IMPORTACIONES». Cada carpeta madre reemplaza
  solo lo suyo (migración 046).
- **Cuándo:** cron 01:17 y 11:47 (completas, de verdad) + manual. GitHub
  atrasa a veces horas los horarios (el de las 02:00 del 02/10/2026 arrancó
  08:38); por eso la hoja GENERAL (`CarpetaMadre.gs`) mira cada hora si hay
  una lectura nueva y se pone al día apenas termina.
- **Al final** republica la hoja DETALLE (`publicar-detalle.mts`), que lee la
  vista ejecutiva: la columna «Legajo de la OC» sale de la carpeta madre
  (migración 054); el legajo de GENERAL, solo para las OC que la madre no tiene. A mano arranca en
  depuración (no toca la base ni la hoja); se elige nacionales, importaciones
  o ambas, y nacionales se puede limitar a un proyecto (`subcarpeta`). El resumen queda en la página de la corrida; los CSV, en el
  artefacto `carpetas-oc`. Solo una corrida completa y sin fallas reemplaza
  lo anterior; una parcial solo suma.

#### Fuentes de Compras, COMEX y Almacén — `fuentes-compras.yml` → `scripts/fuentes-compras.mts`

- **Qué hace:** lee la hoja privada de Contabilidad (`1sJhaKxa…`, compartida
  como Lector solo con la cuenta de servicio) que llena `CopiarFuentes.gs`
  a las 00:45 y 11:15: la base de compras nacionales, la de importaciones,
  el STATUS y las DUA de COMEX y los ingresos del kardex de Almacén (con el
  escaneo de cada vale). Lo junta por OC y por vale
  (`src/shared/lib/drive/fuentes-compras.ts`) y lo sube con `cargar_fuentes_compras`
  (migración 057), que anota en `fuente_cambio` lo que cambió desde la
  lectura anterior (un monto, una DAM, un vale corregido, anulado o
  eliminado). Si una pestaña llega con menos de la mitad de filas, no borra
  nada.
- **Cuándo:** como primer paso de «Carpetas de OC» (01:17 y 11:47; si falla,
  las carpetas se leen igual) y a mano solo, sin releer las carpetas.
- **Para qué:** `carpetas_madre_fuentes()` dice, de lo que le falta a cada
  carpeta, qué ya existe en otro lado y solo falta subir («◐ Por subir»: la
  guía que registró Almacén, la DAM o el costeo de COMEX, la factura que ya
  está en SUNAT) y completa comprador, fecha y monto de la OC. Sigue
  contando como incompleta hasta que el documento esté en la carpeta.
- **Local:** `pnpm fuentes:local` (con `FUENTES_JSON=archivo.json` lee
  las pestañas de un archivo en vez de la hoja; `DEBUG=1` no sube nada).

#### SUNAT detracciones — `sunat-detracciones.yml` → `scripts/local/detracciones/detracciones.mts`

- **Qué hace:** entra a SOL por el menú nuevo, abre «Consulta de Pago de
  Detracciones» y, por la API que esa pantalla usa por debajo, pide los
  depósitos por **fecha de pago**. De cada constancia nueva baja el HTML de
  SUNAT (lo mismo que «Guardar») y un PDF, y los archiva en Drive en
  `SUNAT_DRIVE_FOLDER/Detracciones/Compras|Ventas/AAAA-MM` (por período
  tributario), con el nombre `RUC-tipo-serie-número_DTR-constancia`. Guarda
  cada una en `detraccion_constancia` (migración 066) y, si bajó nuevas,
  republica **COMPROBANTES SUNAT - DETALLE**: la detracción va en la misma
  hoja que el resto de la extracción (seis columnas al final, con el enlace
  al PDF y al HTML de la constancia), que es la que lee la vista de Apps Script.
  En cada corrida publica además las pestañas **DETRACCIONES** (todas las
  constancias, con el caso: normal, revisar monto, factura de un año anterior,
  sin XML…) y **DETRACCIONES SIN CONSTANCIA** (migración 067).
- **Por fecha de pago, no por período:** un depósito puede llegar meses
  después de la factura. Lo ya guardado no se vuelve a bajar.
- **Cuándo:** cron 09:30 (últimos 10 días) + manual (`desde`, `hasta`, `dias`,
  `guardar`, `limite`). Primera carga: `desde` = 01/01/2026. Tope 90 min.
  Comparte `concurrency` con los de la cuenta de SOL.
- **Local:** `pnpm detracciones:local` (`DESDE=01/01/2026`, `GUARDAR=0` para probar).
- Detalle: **`docs/detracciones-spot.md`**.

#### SUNAT detracciones (reconocimiento) — `detracciones-reconocer.yml` → `scripts/local/detracciones/reconocer.mts`

- Prueba del recorrido, con la que se armó la corrida de arriba (07-08/10/2026).
- **Qué hace:** entra a SOL por el menú nuevo (tiene su propio login),
  llega a «Consulta de Pago de
  Detracciones», consulta un período, abre las primeras constancias y baja
  su HTML («Guardar») y un PDF. **No guarda nada** en la base ni en Drive:
  deja capturas, HTML, opciones de los filtros y lo que la página pide por
  debajo en el artefacto `bitacoras-detracciones-reconocer` (7 días).
- **Cuándo:** solo manual (`periodo`, `constancias`, `tipo_cuenta`,
  `entrada`). Tope 20 min. Comparte `concurrency` con los de la cuenta de SOL.
- **Local:** `pnpm detracciones:reconocer`.
- Detalle: **`docs/detracciones-spot.md`**.

#### Otros scripts

- `scripts/sire.mts`: prueba la cadena del SIRE **desde una máquina local**
  (`token`, `propuesta 202607`). No lo usa ningún workflow.

---

## 5. Credenciales — qué hay, dónde se configura, quién la usa

**Ninguna credencial está en el repositorio** (es público). Aquí van solo los
**nombres**; los valores están donde dice la columna "Dónde".

### 5.1 Secretos de GitHub Actions

_Settings → Secrets and variables → Actions_

| Secreto                                       | Qué es                                                                                                                                  | Lo usan                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `SUPABASE_URL` / `PROJECT_URL`                | URL del proyecto Supabase (se aceptan los dos nombres)                                                                                  | todos                               |
| `SUPABASE_ANON_KEY` / `ANON_KEY`              | Clave publicable de Supabase                                                                                                            | todos                               |
| `ROBOT_CORREO` / `ROBOT_CLAVE`                | Usuario "robot" de la base; los scripts entran con él, así la bitácora dice quién escribió                                              | todos                               |
| `SUNAT_RUC`                                   | RUC de la empresa (por omisión 20512201611)                                                                                             | descargar, extraer, individual      |
| `SUNAT_INROPRIN_CLIENT_ID` / `_CLIENT_SECRET` | Credenciales de la **API** de SUNAT (SIRE)                                                                                              | diario (y descargar/extraer, el ID) |
| `SUNAT_INROPRIN_USUARIO` / `_CLAVE`           | Usuario secundario de Clave SOL de la API                                                                                               | diario; respaldo de los demás       |
| `SUNAT_SOL_USUARIO` / `SUNAT_SOL_CLAVE`       | Usuario secundario de Clave SOL **ampliado** (ve boletas y la consulta individual). Si falta, los scripts caen a los `SUNAT_INROPRIN_*` | descargar, extraer, individual      |
| `SUNAT_DRIVE_FOLDER`                          | Carpeta de Drive donde se archivan XML/PDF (tiene valor por omisión en el código)                                                       | descargar, extraer, individual      |
| `GOOGLE_SA_EMAIL` / `GOOGLE_SA_PRIVATE_KEY`   | Cuenta de servicio de Google (Drive y Sheets)                                                                                           | todos menos padrón                  |
| `GOOGLE_DRIVE_FOLDER_ID`                      | Carpeta raíz donde se publican las hojas. Si falta, se guarda igual y solo se salta la hoja                                             | todos menos padrón                  |

### 5.2 Variables de entorno de Vercel

Son de la aplicación de viáticos y quedaron en `ROTAFOLIO-AUTOMOTRIZ`.

### 5.3 Propiedades de Apps Script

_En cada hoja: Extensiones → Apps Script → ⚙ Configuración → Propiedades del script_

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ROBOT_CORREO`, `ROBOT_CLAVE`, y según
el script `RUC_EMPRESA`, `CARPETA_RAIZ`. Los `LEGAJO_*` los escribe el propio
script (estado interno, no se configuran).

### 5.4 Local

`.env.local` (ignorado por git): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ROBOT_CORREO`,
`ROBOT_CLAVE`, `GOOGLE_SA_EMAIL`, `GOOGLE_SA_KEY_FILE` (la clave en `secrets/sa.json`,
también ignorada) y las de SUNAT. Para leer PDF: `LECTOR_TESSERACT`, `LECTOR_POPPLER`
(y `TESSDATA_PREFIX` si hace falta) — ver `docs/carpetas-oc-local.md`.

---

## 6. La base de datos (Supabase)

Proyecto `vqabgnynidehfqueupki`. **Todas las tablas tienen RLS**: los scripts y
Apps Script entran como el usuario robot; la app, como la persona.

### 6.1 Tablas principales (filas aproximadas al 30/09/2026)

**Viáticos (la app)**

| Tabla                                                                                               |        Filas | Qué guarda                               |
| --------------------------------------------------------------------------------------------------- | -----------: | ---------------------------------------- |
| `usuarios` / `roles_usuario`                                                                        |    157 / 136 | Personas y sus roles                     |
| `datos_bancarios`                                                                                   |           69 | Banco, cuenta y CCI de cada persona      |
| `memos` / `memo_asignados`                                                                          |    204 / 486 | Memos y a quién cubre cada uno           |
| `gastos`                                                                                            |            5 | Comprobantes rendidos en la app          |
| `liquidaciones`, `pagos`, `cajas_chicas`, `planillas_movilidad`, `solicitudes_memo`, `devoluciones` |  casi vacías | Flujos listos, con poco uso real todavía |
| `centros_costo`, `areas`, `empresas`, `parametros`                                                  | 38, 17, 1, 7 | Catálogos                                |

**SUNAT**

| Tabla                       |  Filas | Qué guarda                                                                                | La llena              |
| --------------------------- | -----: | ----------------------------------------------------------------------------------------- | --------------------- |
| `comprobantes_sunat`        | 13 736 | Cabeceras del SIRE: **lo que existe**                                                     | sunat-diario          |
| `cambios_comprobante_sunat` |      3 | Cuando SUNAT cambia un comprobante ya visto                                               | sunat-diario          |
| `consultas_sunat`           |     56 | Bitácora de consultas al SIRE                                                             | sunat-diario, app     |
| `cpe_comprobante`           |  4 379 | Cabecera leída del **XML**, con enlace a XML y PDF en Drive                               | descargar, individual |
| `cpe_item`                  |  7 576 | **Detalle de ítems** de cada comprobante                                                  | descargar, individual |
| `cpe_cuota`                 |    209 | Cuotas de pago a crédito                                                                  | descargar, individual |
| `padron_ruc`                |  1 586 | Condición de cada RUC proveedor                                                           | padrón                |
| `detraccion_constancia`     |      — | Una fila por constancia de depósito de detracción, con enlace a su PDF y su HTML en Drive | detracciones          |

**Órdenes de compra (OC)**

| Tabla                       |  Filas | Qué guarda                                                                                                               | La llena                                                         |
| --------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `oc_archivo`                | 10 530 | Cada archivo encontrado en las carpetas de OC de Drive                                                                   | Apps Script `SubirCapturaOC.gs`                                  |
| `oc_base_cg`                |  3 723 | Centro de costo de cada OC según Control de Gestión                                                                      | ídem                                                             |
| `oc_legajo`                 |    506 | Legajo por OC                                                                                                            | Apps Script `SubirLegajo.gs`                                     |
| `oc_carpeta`                |  1 433 | Cada carpeta de OC de las carpetas madre (nacionales e importaciones)                                                    | `carpetas-oc` (también sube a `oc_archivo` con origen `CARPETA`) |
| `lectura_archivo`           |      — | Lo leído por dentro de cada archivo (XML, PDF, OCR), para no leerlo dos veces                                            | `carpetas-oc`                                                    |
| `proyecto_centro_costo`     |      — | Centro de costo de cada carpeta de proyecto (para OC que no están en CG); `MANUAL` no se pisa                            | `carpetas-oc`, Contabilidad                                      |
| `carpeta_cambio`            |      — | Qué cambió en las carpetas madre entre dos corridas completas                                                            | `carpetas-oc`                                                    |
| `fuente_compra_oc`          |      — | Una fila por OC de la base de Compras (nacional e importación): fecha, monto, quién la hizo, forma de pago               | `fuentes-compras`                                                |
| `fuente_comex_oc`           |      — | Una fila por OC del STATUS de COMEX: llegada, agente, DAM, costeo y sus DUA                                              | `fuentes-compras`                                                |
| `kardex_vale`               |      — | Una fila por vale de Almacén (ingresos por compra, servicio o devolución y anulados), con la guía o factura y su escaneo | `fuentes-compras`                                                |
| `fuente_cambio`             |      — | Qué cambió en Compras, COMEX o Almacén de una lectura a otra                                                             | `fuentes-compras`                                                |
| `fuente_copia`              |      — | Cuándo copió `CopiarFuentes.gs` cada pestaña                                                                             | `fuentes-compras`                                                |
| `proveedor_sin_oc`          |      — | Proveedores que Contabilidad marca como «nunca llevan OC»: sus facturas no se alertan                                    | a mano                                                           |
| `equivalencia_centro_costo` |      2 | Centro de costo → código CONCAR, **solo lo confirmado**                                                                  | a mano                                                           |

### 6.2 Funciones clave (en las migraciones)

| Función                                                               | Qué hace                                                                                                                                                                                                                                              | Migraciones que la tocan               |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `guardar_cpe(p_empresa_ruc, p_docs)`                                  | Guarda comprobante + ítems; idempotente (repetir actualiza, no duplica)                                                                                                                                                                               | 032 a 036                              |
| `historico_comprobantes_sunat(p_periodo)`                             | Filas de la hoja **COMPROBANTES SUNAT**. `sunat-diario` la pide de a un período (`periodos_comprobantes_sunat()`): todo junto (~18 000, ~15 MB) pasaba los 8 s de la base                                                                             | 017, 039, 041, 042, 059                |
| `detalle_cpe(p_periodo)`                                              | Filas de la hoja **COMPROBANTES SUNAT - DETALLE**                                                                                                                                                                                                     | 032 a 036, 039, 041, 042               |
| `detalle_cpe_carpeta(p_periodo)`                                      | `detalle_cpe` + proyecto, de dónde sale el centro de costo y documentos de la carpeta madre (lo que publica el DETALLE)                                                                                                                               | 051                                    |
| `legajo_de_carpetas(p_empresa_ruc)`                                   | Una fila por carpeta de OC de las carpetas madre, para la pestaña CARPETA MADRE de GENERAL (`CarpetaMadre.gs`)                                                                                                                                        | 051                                    |
| `detalle_cpe_hoja(p_periodo)`                                         | La base de lo que publica la hoja **DETALLE** (ver `detalle_cpe_hoja_con_detraccion`): `detalle_cpe_carpeta` + base gravada, IGV, no gravado (del SIRE o del XML), tipo de cambio, total en soles y detracción a revisar                              | 053                                    |
| `porcentaje_detraccion(p_codigo)`                                     | El % de detracción de cada código de bien o servicio (anexos de la R.S. 183-2004/SUNAT)                                                                                                                                                               | 053                                    |
| `detalle_de_carpeta(p_carpeta)`                                       | El detalle de una carpeta de OC (archivos con su documento, datos de la OC, facturas unidas, cambios y lo que dicen Compras, COMEX y Almacén) para la vista                                                                                           | 055, 056, 057                          |
| `evidencias_de_fuentes(p_empresa_ruc)`                                | Por OC, los documentos que ya existen en otro lado: guía (Almacén), DAM y costeo (COMEX)                                                                                                                                                              | 057                                    |
| `carpetas_madre_fuentes(p_empresa_ruc)`                               | `carpetas_madre` + estado con «Por subir», lo que falta sin rastro, lo que existe en otro lado, fecha y monto de la OC, ingreso a Almacén, estado y llegada en COMEX. La usan `CarpetaMadre.gs` y la vista                                            | 057                                    |
| `cargar_fuentes_compras(p_empresa_ruc, p_fuente, p_filas)`            | Carga COMPRAS, COMEX, ALMACEN o COPIA y anota los cambios                                                                                                                                                                                             | 057                                    |
| `facturas_sin_oc_json(…)`, `carpetas_madre_fuentes_json(…)`           | Las mismas listas en UNA fila (jsonb), para no recalcular todo por cada página de 1000. Las usan la vista y `CarpetaMadre.gs`                                                                                                                         | 058                                    |
| `carpetas_madre(p_empresa_ruc)`                                       | `legajo_de_carpetas` + área responsable (por la carpeta madre), comprador, situación y forma de pago (del legajo por OC). La usa `CarpetaMadre.gs`                                                                                                    | 052                                    |
| `facturas_sin_oc(p_empresa_ruc, p_desde)`                             | Facturas recibidas sin OC unida, con señal ALTA (el proveedor trabaja con OC) o MEDIA (monto alto, no es gasto típico sin OC). Pestaña FACTURAS SIN OC de GENERAL. Ojo: la base corta a los 8 s cada consulta del robot; 058 la bajó de ~6 s a ~1,3 s | 052, 058                               |
| `vinculos_oc()`                                                       | Cruza comprobantes con archivos de las carpetas de OC                                                                                                                                                                                                 | 039, 040, 042, 045, 046, 048, 049, 050 |
| `cargar_captura_oc(...)`                                              | Recibe la captura de OC desde Apps Script                                                                                                                                                                                                             | 039, 042                               |
| `guardar_detracciones(p_empresa_ruc, p_filas)`                        | Guarda constancias de detracción (idempotente; no pisa enlaces con vacío)                                                                                                                                                                             | 066                                    |
| `detracciones_hoja(p_empresa_ruc)` / `detracciones_sin_constancia(…)` | Las pestañas DETRACCIONES (una fila por constancia, con su factura y el caso) y DETRACCIONES SIN CONSTANCIA (facturas con detracción sin depósito)                                                                                                    | 067                                    |
| `detalle_cpe_hoja_con_detraccion(p_periodo)`                          | Lo que publica la hoja **DETALLE**: `detalle_cpe_hoja` (sin tocar) + la constancia de detracción de cada comprobante (números, fecha de pago, depositado, PDF, HTML y estado)                                                                         | 066                                    |

La versión vigente de cada función es la de la **última** migración que la toca.

### 6.3 Migraciones

`docs/database/migrations/NNN_nombre_descriptivo.sql`, **en orden, sin saltarse
ninguna**. Cada una explica en su encabezado por qué existe. La última es
`043_lectura_de_cpe_sin_evaluar_por_fila.sql` (pendiente de aplicar al 30/09/2026). Se aplican a mano (editor SQL de Supabase) y se
versionan acá.

---

**Sin migrar (09/10/2026):** la lista SSCO no está en la base sino en la pestaña
**SSCO** del libro INROCONTA (`pnpm ssco:load`), porque el proyecto de Supabase
no admite migraciones por ahora.

## 7. Las hojas de Google que se publican

Todas en `GOOGLE_DRIVE_FOLDER_ID/SUNAT/`. Se reescribe solo la pestaña de
datos: los tableros que alguien arme en otras pestañas del mismo archivo no se
tocan.

| Hoja                             | Una fila por                          | La publican                              | Columnas destacadas                                                                                                                                        |
| -------------------------------- | ------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **COMPROBANTES SUNAT**           | comprobante (SIRE)                    | sunat-diario, app                        | montos, condición del RUC, OC, centro de costo, código CONCAR, alertas, archivo que confirma la OC                                                         |
| **COMPROBANTES SUNAT - DETALLE** | ítem (XML)                            | descargar, individual, detracciones, app | descripción, cantidad, precio, enlaces a PDF/XML, forma de pago, detracción, OC, archivo que confirma la OC, constancia de detracción (PDF, HTML y estado) |
| **… DETALLE AAAA-MM a AAAA-MM**  | ítem                                  | extraer rango                            | solo los meses pedidos                                                                                                                                     |
| **DETRACCIONES**                 | constancia de detracción (todas)      | detracciones                             | caso, período, fecha de pago, meses hasta el pago, factura, monto, dónde está la factura, PDF y HTML                                                       |
| **DETRACCIONES SIN CONSTANCIA**  | factura con detracción y sin depósito | detracciones                             | compra o venta, meses desde la emisión, detracción, PDF de la factura                                                                                      |

Las columnas se definen en `src/shared/lib/export/comprobantes-sunat.ts` y
`src/shared/lib/export/items-sunat.ts`. Las nuevas se agregan **siempre al
final** para no romper referencias de quien ya usa la hoja.

---

## 8. La aplicación web

Está en el repositorio `ROTAFOLIO-AUTOMOTRIZ` (INRO VIÁTICOS, Next.js en
Vercel). Desde ahí también se consulta el SIRE y la cobertura
(`sistema/sunat`), leyendo la misma base.

---

## 9. `src/shared/lib/` — la lógica compartida

| Carpeta                   | Para qué                                                                                                                                                                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/lib/dominio/` | `tipos.ts`: tipos compartidos (las reglas de viáticos quedaron en ROTAFOLIO-AUTOMOTRIZ)                                                                                                                                                                                            |
| `src/shared/lib/sunat/`   | `token.ts` (api-seguridad), `sire.ts`/`rce.ts` (propuesta del RCE), `cpe-xml.ts` (leer el XML UBL), `cpe-importacion.ts` (preparar el lote para `guardar_cpe`), `cpe-consulta.ts` (catálogo de consultas del portal), `consulta-ruc.ts`, `credenciales.ts`, `periodo.ts`, `zip.ts` |
| `src/shared/lib/export/`  | Armar las hojas: `comprobantes-sunat.ts`, `items-sunat.ts`, `csv.ts`                                                                                                                                                                                                               |
| `src/shared/lib/drive/`   | `servidor.ts` (subir archivos, crear carpetas, `publicarHoja`), `celdas.ts` (tipos de columna para que Sheets no adivine fechas), `rangos.ts`                                                                                                                                      |

---

## 10. Google Apps Script (`src/`)

El código vive acá versionado, pero **se ejecuta pegado en cada hoja de
Google**. Instalación de cada uno en `docs/apps-script.md`.

| Archivo                                                                     | Qué hace                                                                                                                                                                                             |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Codigo.gs` + `Tablero.html`                                                | Tablero de comprobantes SUNAT para Contabilidad                                                                                                                                                      |
| `CodigoPadron.gs` + `TableroPadron.html`                                    | Tablero SUNAT publicado como página                                                                                                                                                                  |
| `PadronRuc.gs`                                                              | Condición del RUC dentro del Sheet                                                                                                                                                                   |
| `Desglose.gs`                                                               | Desglose de ítems en la misma hoja                                                                                                                                                                   |
| `VistaEjecutiva.gs` + `VistaEjecutivaPagina.html`                           | Vista ejecutiva del DETALLE para compartir (con la sección Detracciones: constancias, casos y facturas sin constancia)                                                                               |
| `OrdenarCPE.gs`                                                             | Script suelto, de una sola vez: ordenó en carpetas los XML que el scraper subió antes de tenerlas                                                                                                    |
| `CapturaCarpetasOC.gs`                                                      | Recorre las carpetas de cada OC y lista sus archivos                                                                                                                                                 |
| `LecturaFacturas.gs`                                                        | Lee por OCR las facturas sin número en el nombre                                                                                                                                                     |
| `SubirCapturaOC.gs`                                                         | Sube la captura de OC a la base (`cargar_captura_oc`)                                                                                                                                                |
| `LegajoPorOC.gs`, `SubirLegajo.gs`, `VistaLegajo.gs` + `TableroLegajo.html` | Legajo por OC y su tablero                                                                                                                                                                           |
| `CarpetaMadre.gs`                                                           | Pestañas CARPETA MADRE, FACTURAS SIN OC y su resumen en GENERAL (de `carpetas_madre_fuentes`)                                                                                                        |
| `CopiarFuentes.gs`                                                          | Va en la hoja **privada** de Contabilidad: copia de los originales la base de Compras, el STATUS de COMEX y el kardex de Almacén (00:45 y 11:15), sin contactos ni bancos, para que el robot los lea |
| `AlertasLegajo.gs`                                                          | Avisos por correo a cada comprador (en pausa hasta validar la información)                                                                                                                           |

**Cómo funciona el cruce con las OC:** la captura lista los archivos de cada
carpeta de OC (con su enlace); la lectura saca RUC y serie-número del PDF
cuando el nombre no los trae; la base (`vinculos_oc()`) cruza eso con
`comprobantes_sunat` por **RUC + serie + número**. El enlace del archivo no
interviene en el cruce: se publica para poder verificarlo a mano. Si un
comprobante sale sin OC ni archivo, es que no hay nada en Drive que lo
respalde (o la captura no lo encontró).

---

## 11. Reporte de tasa de éxito (al 30/09/2026)

Hay **dos tasas distintas** y conviene no confundirlas:

- **Éxito del workflow:** la corrida terminó sin error.
- **Éxito por comprobante:** de lo que se intentó, cuánto quedó guardado.
  Un workflow puede terminar "verde" habiendo confirmado solo el 15%.

### 11.1 Por workflow (todas las corridas desde que existen)

| Workflow                       | Tipo   | Corridas |  OK |    % | Duración típica  |
| ------------------------------ | ------ | -------: | --: | ---: | ---------------- |
| SUNAT diario                   | cron   |       16 |  16 | 100% | 2 min            |
| SUNAT diario                   | manual |        4 |   4 | 100% | 1 min            |
| SUNAT descargar XML            | cron   |        7 |   7 | 100% | 10 min           |
| SUNAT descargar XML            | manual |       69 |  56 |  81% | 7 min (máx 49)   |
| SUNAT extraer rango            | manual |        5 |   5 | 100% | 3 min (máx 26)   |
| SUNAT padrón de RUC            | cron   |       10 |  10 | 100% | 8 min            |
| SUNAT padrón de RUC            | manual |        6 |   6 | 100% | 16 min           |
| SUNAT consultar CPE individual | manual |       34 |  28 |  82% | 32 min (máx 103) |

Las fallas se concentran en los días de puesta a punto de cada scraper
(descargar: 17/09 y 22-26/09; individual: 28-29/09). **Todos los cron han
corrido al 100%.**

### 11.2 Consultar CPE individual — éxito por comprobante

| Corridas             | Confirmados / intentados | Qué pasó                                                                                                                                                           |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #15 (prueba)         | 3 / 3                    | Primera descarga real                                                                                                                                              |
| #16                  | 0 guardados              | Cupo de Drive agotado en el 47 de 100; el guardado era todo al final y se perdieron los 46 ya confirmados (se recuperaron después) → se pasó a **guardar cada 20** |
| #17-19               | 248 / 264 (**94%**)      | SUNAT estable                                                                                                                                                      |
| #20-21               | ~45 / ~200 (~22%)        | SUNAT empieza a fallar                                                                                                                                             |
| #22-24               | 9 / 300 (3%)             | SUNAT cambió el desplegable de notas → **corregido** el 29/09                                                                                                      |
| #25, #28             | cancelados               | Se colgaban con SUNAT caído; el #28 alcanzó a guardar 40                                                                                                           |
| #29-35 (tras el fix) | 137 / 700 (**20%**)      | Casi todo lo fallido es SUNAT: «Error del Servidor, reintentar en 5 minutos»                                                                                       |

**Lectura:** con SUNAT estable el script confirma >90%. Desde el 29/09 la
tasa depende de la disponibilidad de SUNAT, no del código. Los que fallan
**no se pierden**: siguen pendientes y se reintentan en la próxima corrida.

### 11.3 Cobertura — qué de lo que existe ya tiene XML y detalle

Comprobantes de compra tipo 01/07/08 (sin la basura "tipo 53" del SIRE):

| Período | E001 en SIRE | E001 con XML | No-E001 en SIRE | No-E001 con XML |
| ------- | -----------: | -----------: | --------------: | --------------: |
| 2026-01 |          180 |       **0%** |             709 |          **0%** |
| 2026-02 |          255 |         100% |             902 |              0% |
| 2026-03 |          448 |         100% |           1 055 |              0% |
| 2026-04 |          299 |         100% |             824 |              0% |
| 2026-05 |          193 |         100% |             546 |              0% |
| 2026-06 |          228 |         100% |             951 |              0% |
| 2026-07 |          909 |         100% |           1 748 |              0% |
| 2026-08 |        1 041 |         100% |           2 106 |              0% |
| 2026-09 |          239 |        97.5% |             824 |       **60.1%** |

**Lo que dice la tabla:**

- **E001 está al día** de febrero en adelante. **Enero no se bajó nunca**
  (se puede con «SUNAT extraer rango», 01/01–31/01).
- **No-E001: solo se ha trabajado septiembre.** Enero–agosto suman ~8 800
  comprobantes sin XML. A ~100 por corrida y con la tasa actual, eso son
  semanas de corridas: es una **decisión pendiente** (ver sección 14).

---

## 12. Cómo hacer las tareas comunes

### Bajar no-E001 (lo normal: por la API)

Actions → **SUNAT CPE por API** → Run workflow (vacío = mes anterior + actual),
o en una laptop `pnpm cpe:local` — todo en `docs/pipeline-cpe-local.md`.

### Rehacer la hoja DETALLE sin bajar nada de SUNAT

`pnpm hojas:detalle` en la laptop (con `.env.local`). Para cuando cambian sus
columnas o lo que se le cruza (legajo, carpeta madre): `cpe:local` solo
republica si guardó comprobantes nuevos.

### Correr un lote manual de no-E001 por pantallas (respaldo)

Actions → **SUNAT consultar CPE individual** → Run workflow →
`debug` **desmarcado**, `periodo` 202609 (o el que toque), `orden` antiguo,
`limite` 100. Para solo probar: `debug` marcado y `limite` 3.

### Ver cómo salió una corrida

Abrir la corrida → job `consultar` → al final del paso principal:
`Listo: se confirmaron X de Y pendientes procesados (de Z en …)`.
Si algo falló, bajar el artefacto `capturas-cpe-individual`: las capturas
`resultado-*.png` muestran qué respondió SUNAT.

### Verificar en la base (no confiar solo en el log)

En el editor SQL de Supabase:

```sql
-- Cobertura por período y tipo de serie (la tabla 11.3)
with s as (
  select periodo, case when serie ilike 'E%' then 'E' else 'noE' end grupo,
         proveedor_ruc, tipo_comprobante, upper(serie) serie,
         coalesce(nullif(ltrim(numero,'0'),''),'0') numero
  from comprobantes_sunat
  where empresa_ruc='20512201611' and tipo_comprobante in ('01','07','08')
    and proveedor_ruc <> '0'),
c as (
  select proveedor_ruc, tipo_comprobante, upper(serie) serie,
         coalesce(nullif(ltrim(numero,'0'),''),'0') numero
  from cpe_comprobante where empresa_ruc='20512201611')
select s.periodo, s.grupo, count(*) en_sire, count(c.numero) con_xml,
       round(100.0*count(c.numero)/count(*),1) pct
from s left join c using (proveedor_ruc, tipo_comprobante, serie, numero)
group by 1,2 order by 1,2;
```

### Verificaciones locales

```bash
pnpm install --frozen-lockfile
pnpm typecheck           # tipos de scripts/ y src/shared/
pnpm db:consolidar --revisar   # docs/database/database.full.sql al día
```

### Cambiar el horario de un cron

Editar la línea `cron:` del workflow. Está en **UTC**: Lima es UTC-5 todo el
año (08:00 Lima = `0 13 * * *`). Mantener separados los que usan la cuenta
de SOL (`descargar`, `extraer`, `individual`).

### Agregar una columna a una hoja

1. Migración nueva que agregue el campo a `historico_comprobantes_sunat()` o
   `detalle_cpe()` (la segunda se borra y se crea, porque cambia su tipo).
2. `src/shared/lib/export/*.ts`: interfaz, cabecera, tipo de columna y valor — **al final**.

---

## 13. Índice de la documentación existente

| Documento                                 | Tema                                                                                            | Estado                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------- |
| **`docs/pipeline-cpe-local.md`**          | Pipeline de CPE por la API de SUNAT: cómo funciona, correrlo en local y en Actions, diagnóstico | **Vigente**               |
| `docs/cron-sunat.md`                      | Puesta en marcha de SUNAT diario (robot, secretos)                                              | Vigente                   |
| `docs/descarga-cpe-y-detalle-de-items.md` | Diseño de la descarga de XML y el detalle de ítems                                              | Vigente (diseño original) |
| `docs/scraper-cpe-hallazgos-tecnicos.md`  | Grilla virtual del portal, carreras, botón Imprimir                                             | Vigente                   |
| `docs/extraer-boletas-y-rangos-largos.md` | Boletas, rangos largos, hoja aparte                                                             | Vigente                   |
| `docs/carpetas-oc-local.md`               | Carga pesada de las carpetas de OC en una computadora (PowerShell, Tesseract, Poppler)          | Vigente                   |
| `docs/ESTADO-Y-PENDIENTES.md`             | Dónde vive todo y qué falta                                                                     | Vigente                   |
| `docs/apps-script.md`                     | Instalación de cada Apps Script, tableros, captura de OC                                        | Vigente                   |
| `docs/detracciones-spot.md`               | Constancias de detracción (SPOT): recorrido en SOL, Drive y cruce con facturas                  | En construcción           |

---

## 14. Pendientes y problemas conocidos

- **Backlog no-E001:** desde el 30/09/2026 se rellena por la API (`scripts/local/`).
  Agosto–septiembre hecho (2 342 de 2 362); marzo–julio en curso; enero–febrero
  pendiente. Estado, pendientes y comandos para continuar:
  **`docs/pipeline-cpe-local.md` §9-10**.
- **E001 de enero:** nunca se bajó; se resuelve con una corrida de «SUNAT
  extraer rango».
- **SUNAT inestable desde el 29/09:** «Error del Servidor, reintentar en 5
  minutos». Era un 500 de la consulta de cabecera: por la API se va directo al
  XML y los 500 que quedan son intermitentes (se reintentan solos).
- **`descargar-cpe.yml` no tiene `concurrency`:** si alguien lo corre a mano a
  la vez que otro workflow que usa la cuenta de SOL, pueden pisarse las
  sesiones.
- **Lectura de logs en vivo:** GitHub no expone el log de un job hasta que
  termina; para saber cuánto lleva una corrida larga, mirar la base
  (`cpe_comprobante` crece cada 20 confirmados).
- Pendientes de la app: pestaña de notas de crédito en la hoja de SUNAT,
  conexión con el MemoTracker, un reembolso real para cerrar el último tipo
  de memo (`docs/proceso-viaticos.md` §8-9).
