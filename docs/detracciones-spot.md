# Constancias de detracción (SPOT) — en construcción

> Cómo se bajan de SUNAT SOL las **constancias de depósito de detracción**,
> se archivan en Drive y se dejan sus datos en la base para cruzarlas con las
> facturas. Se documenta paso a paso, a partir de los pantallazos del
> recorrido, **antes** de programar. Empezado el 07/10/2026.

---

## 1. Objetivo

- **Qué:** el PDF de cada constancia de depósito de detracción (el
  descargable del menú SPOT de SOL).
- **Para qué:** tenerla como documento digital para contrastar y operar:
  saber qué factura ya tiene su depósito y cuál falta.
- **Dónde queda:**
  - El PDF, en **Google Drive** (carpeta a definir, p. ej. `Detracciones/AAAA-MM`).
  - Sus datos (número de constancia, fecha, monto, proveedor, factura), en
    **Supabase**, para cruzarlos con `comprobantes_sunat` y `cpe_comprobante`.

## 2. Qué ya existe

- Del **XML de la factura** se lee la detracción: cuenta del Banco de la
  Nación, código de bien o servicio, porcentaje y monto
  (`src/shared/lib/sunat/cpe-xml.ts` → `pagoDe`; columnas `detraccion_*` de
  `cpe_comprobante`).
- Del **SIRE** viene el monto de detracción (`comprobantes_sunat`).
- El **login a SOL** que se va a reusar: `scripts/local/sol/sesion.mts`.
- La **subida a Drive** con respaldo en disco: `scripts/local/comun/drive.mts`.
- **Falta:** la constancia misma (el depósito).

## 3. Dónde se corre

1. **Primero, por GitHub Actions**, en modo reconocimiento (§7). Las
   corridas las lanza el usuario desde la pestaña Actions.
2. **Cuando el recorrido esté claro**, en una laptop (más rápido, para el
   atrasado), con el mismo script.
3. Al final, la corrida diaria en Actions.

Como todos los que usan la cuenta de SOL: **nunca a la vez** que
`descargar-cpe`, `extraer-cpe-rango`, `consultar-cpe-individual` o
`sunat-cpe-api`.

## 4. El recorrido en SOL

Pantallazos del usuario del 07/10/2026.

| # | Pantalla | Qué se hace | Notas para el script |
|---|---|---|---|
| 1 | `sunat.gob.pe/sol.html` | «Ingresar» del recuadro **MIS DECLARACIONES Y PAGOS** (no el de Trámites y consultas) | El script no necesita esta página: va directo al menú (paso 2) |
| 2 | Ingreso (`api-seguridad.sunat.gob.pe/…/loginMenuSol?…&state=…`) | RUC + usuario + clave, «Iniciar sesión» | Mismo formulario que ya llena `entrar()` (`#txtRuc`, `#txtUsuario`, `#txtContrasena`). El `state` del enlace es **temporal**: no se guarda; se pide el menú y SUNAT redirige al ingreso con uno nuevo. Usuario: el **ampliado** (`SUNAT_SOL_USUARIO`), no el del SIRE |
| 3 | Menú nuevo (`e-menu.sunat.gob.pe/cl-ti-itmenu2/MenuInternetPlataforma.htm?pestana=*&agrupacion=*`) | Clic en «Opciones»: el árbol aparece recién ahí | Es **otro menú** que el de los XML (`cl-ti-itmenu/MenuInternet.htm` → «Empresas»). «Bienvenido,» también aparece, así que `menuVisible()` sirve |
| 4 | Árbol del menú | Mis declaraciones y pagos → Consultas → Consultas de Presentación y Pago → **Consulta de Pago de Detracciones** | Cada nivel se despliega con un clic. Anotar la URL o el código de opción (`exe=…`) que abre: quizá se pueda ir directo |
| 5 | «Consulta - Sistema de Pago de Obligaciones Tributarias (SPOT)» | Filtros y «Consultar» → tabla | Ver §4.1 y §4.2 |
| 6 | Constancia (ventana encima de la tabla) | Clic en el **número azul** de la columna «Constancia» | Abre un modal «CONSTANCIA DE DEPÓSITO — SISTEMA DE PAGO DE OBLIGACIONES TRIBUTARIAS D.LEG. 940», con botones Imprimir, Guardar y E-mail. Datos en §5 |
| 7 | Descarga | «Guardar» | Baja **`constancia_dtr_<número>.html`** (~5 KB). Es un **HTML, no un PDF**. En Playwright: `page.waitForEvent("download")` antes del clic. Después cerrar el modal (×) y seguir con la fila siguiente |

### 4.1 Filtros de la consulta SPOT

| Filtro | Por omisión | Notas |
|---|---|---|
| Fecha de pago Desde / Hasta | Últimos 3 días (04/10 a 07/10) | **Se pueden dejar vacías** y consultar solo por período (probado el 07/10/2026 con 202609) |
| Tipo de Cuenta | «Seleccione Tipo de Cuenta» | En la prueba: «Cuenta de Detracciones Convencional». Las demás opciones, por ver |
| Pagos | «Pagos individuales» | Opciones por ver (¿«masivos»?) |
| Periodo Tributario | vacío (`aaaamm`) | Al hacer clic abre un selector de mes (año + Ene…Dic). Probar si acepta escribir `202609` directo; si no, usar el selector |

### 4.2 La tabla de resultado

Columnas: #, Tipo de Cuenta, N° de Cuenta, Fecha pago, Periodo Tributario,
Comprobante, **Constancia** (número azul: enlace), Proveedor, Adquiriente,
Operación, Bien ó Servicio, Monto Depósito, Número de Pago de Detracciones,
Origen.

Lo que se ve en el ejemplo:

- **Trae los dos sentidos.** Fila 1: INROPRIN es el **proveedor** (un cliente
  depositó en nuestra cuenta: venta). Filas 2 y 3: INROPRIN es el
  **adquiriente** (nosotros depositamos: compra). Se guardan los dos, con el
  sentido marcado.
- **El período tributario no es la fecha de pago** (fila 1: período 202608,
  pagado el 07/10/2026). Para el cruce con la factura manda el
  **comprobante** (tipo, serie y número) y el RUC del proveedor, no las fechas.
- El comprobante viene como «01 - FACTURA E001 - 00002283»: hay que separar
  tipo, serie y número (y quitar ceros a la izquierda para cruzar, como en
  `comprobantes_sunat`).
- Aparecen series E001 y FE02: las constancias no dependen de cómo se emitió
  la factura.

## 5. Datos de la constancia

Ejemplo del 07/10/2026 (constancia 317405442). Campos del modal y del HTML
que se descarga:

| Campo | Ejemplo | Para qué sirve |
|---|---|---|
| Número de constancia | 317405442 | **Identidad** de la constancia (no se repite) y nombre del archivo |
| Usuario SOL | TESCRAFT | Quién hizo el depósito |
| N° Cuenta de detracciones (Banco de la Nación) | 00046129075 | Contrastar con la cuenta que trae el XML de la factura |
| Tipo de Cuenta | Cuenta de Detracciones Convencional | |
| Ruc del Proveedor | 20554893784 | **Cruce** con la factura |
| Nombre/Razón Social del Proveedor | CRAFT MULTIMODAL PERU SOCIEDAD ANON | |
| Tipo / Número de Documento del Adquiriente | 06 - RUC / 20512201611 | Si es nuestro RUC: compra; si no: venta |
| Nombre/Razón Social del Adquiriente | INDUSTRIAS ROLAND PRINT S.A.C - INR | |
| Tipo de Operación | 01 - Venta de bienes o prestación de servicio | |
| Tipo de Bien ó servicio | 037 - Demás Servicios gravados con el IGV | Contrastar con el código y el % del XML (`porcentaje_detraccion`) |
| Monto del depósito | S/166.00 | Contrastar con el monto de detracción del SIRE y del XML |
| Fecha y hora de pago | 06/10/2026 17:58:29 | |
| Periodo Tributario | 202609 | Carpeta de Drive |
| Tipo de Comprobante | 01 - FACTURA | **Cruce** |
| Número de Comprobante | FE02 - 00070678 | **Cruce** (serie y número, sin ceros a la izquierda) |
| Número de operación | 7847135864 | Operación del banco |
| Número de Pago de Detracciones | *(vacío)* | |

El cruce con la factura: **RUC del proveedor + tipo + serie + número**, igual
que `vinculos_oc()` con `comprobantes_sunat`.

## 6. Preguntas abiertas

- ¿La pantalla llama por debajo a una API (como «Nueva Consulta» a
  `api-cpe`)? Si la hay, se baja directo, sin pantallas.
- Sin fechas y por período, sí deja (07/10/2026). Falta ver: las otras
  opciones de «Tipo de Cuenta» y «Pagos», y si la tabla se pagina. El
  reconocimiento lo anota solo (lista las opciones y captura la página entera).
- ~~¿HTML o PDF?~~ **Decidido (07/10/2026): los dos.** El HTML original de
  SUNAT y un PDF impreso por el mismo navegador, que Drive muestra como
  documento. Carpeta propuesta: `Detracciones/AAAA-MM` (por período tributario).
- ¿Carpeta de Drive propia o, además, una copia en la carpeta de la OC?

## 7. El reconocimiento (`scripts/local/detracciones/`)

Corrida de prueba que **no guarda nada** en la base ni en Drive: recorre la
ruta de §4 y deja la evidencia para armar el script de verdad.

| Archivo | Qué hace |
|---|---|
| `reconocer.mts` | El principal: login, menú, filtros, tabla, constancias de prueba, `resumen.json` |
| `spot.mts` | La ruta del menú nuevo y la pantalla SPOT (filtros, tabla, modal, «Guardar»): se reusará en el script de verdad |
| `red.mts` | Registra lo que la página pide por debajo, **sin** claves, tokens ni cookies, y nada del ingreso |

**Cómo entra** (`ENTRADA`, input `entrada` del workflow):

- **`directo` (por omisión):** login en el menú nuevo, con el mismo
  `entrar()` de siempre. En la 1.ª corrida (08/10/2026, run 37808718099)
  quedó 3 de 3 veces en la portada `api-seguridad.sunat.gob.pe/?state=&code=…`:
  era el formulario apurado, que también tumbaba el menú de siempre (abajo).
- **`antiguo`:** login por el menú de siempre y el menú nuevo en **otra
  pestaña**. El menú nuevo tiene **su propio cliente** en api-seguridad
  (`59d39217-…`; el de siempre es `4f3b88b3-…`) y no toma esa sesión: pide
  ingresar otra vez (3.ª corrida, run 37810466261), y se ingresa ahí. Son dos
  logins seguidos (puede pedir captcha): queda de respaldo.

La bitácora anota cada página por la que pasa el login (`[ruta]`, sin `state`
ni `code`), para ver dónde se queda si vuelve a fallar.

**Segunda corrida (08/10/2026, run 37809532012):** con `antiguo` cayó igual
en la portada, 3 de 3: el problema es el **login mismo**, no el menú nuevo
(el de los XML tampoco habría entrado). Arreglo en `sol/ingreso.mts`, que
usan todos los scripts de `scripts/local/`: esperar a que cargue el formulario
antes de llenarlo y, si cae en la portada, llevar el `code` al menú. Ver
`docs/pipeline-cpe-local.md` §9 («Aprendido… sobre el login»).

**Tercera corrida (08/10/2026, run 37810466261):** con ese arreglo el login de
siempre entró **al primer intento** («sesión abierta en 0 s»; la URL del
formulario traía `state`). El menú nuevo, en otra pestaña, pidió ingresar de
nuevo (su propio cliente): por eso `directo` pasó a ser lo normal.

**En GitHub:** Actions → **SUNAT detracciones (reconocimiento)** → Run
workflow (`periodo` vacío = mes anterior; `constancias` 3). Al terminar,
bajar el artefacto `bitacoras-detracciones-reconocer`.

**En una laptop:** `npm run detracciones:reconocer`; para ver el navegador,
`HEADLESS=0` (en PowerShell `$env:HEADLESS="0"; npm run detracciones:reconocer`;
sin ventana no se imprime el PDF).

Qué mirar en `scripts/out/logs/detracciones-reconocer-<fecha>/`:

| Archivo | Para qué |
|---|---|
| `resumen.json` | Lo encontrado: URL de la consulta, opciones de los desplegables, filas, constancias bajadas, señales de paginación |
| `capturas/` | Una imagen por paso; si algo falló, `errores/` tiene captura + HTML |
| `controles-antes.json` / `-despues.json` | Los ids reales de cada campo, para fijar los selectores |
| `resultado.html` / `.txt` | La página con la tabla |
| `constancias/` | `constancia_dtr_<número>.html`, su `.pdf` y el texto del modal |
| `red.jsonl`, `red/` | ¿Hay una API? Si la tabla o la constancia llegan como JSON, se pide directo, sin pantallas |
