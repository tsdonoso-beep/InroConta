# Constancias de detracción (SPOT)

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
| 4 | Árbol del menú | Mis declaraciones y pagos → Consultas → Consultas de Presentación y Pago → **Consulta de Pago de Detracciones** | Cada nivel se despliega con un clic. La opción es el código **`55.2.1.1.4`** (`#nivel4_55_2_1_1_4`), y el script la elige por código (§7) |
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

- ~~¿La pantalla llama por debajo a una API?~~ **Sí** (5.ª corrida,
  08/10/2026): ver §8.
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
| `menu.mts` | Del menú nuevo a la consulta SPOT: la opción por código y, de respaldo, el árbol o el buscador |
| `api.mts` | La API de la consulta (§8), llamada desde la misma página: consultar y descargar la constancia |
| `spot.mts` | La pantalla SPOT ya abierta: filtros, tabla, modal, «Guardar». Se reusará en el script de verdad |
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

**Cuarta corrida (08/10/2026, run 37811142126):** `directo` entró **al primer
intento** al menú nuevo. Falló el árbol: el clic en «Opciones» no desplegó
nada, probablemente porque llegó antes de que la página enganchara sus
eventos. Lo que se aprendió del HTML del menú:

- La página trae en `var opciones` lo que el usuario puede abrir. El
  secundario **solo tiene esta opción**: `55.2.1.1.4` «Consulta de Pago de
  Detracciones», `url: /plataforma/fConsultaDetracciones.html`.
- El clic en una opción llama a
  `logoutAndLoad('MenuInternetPlataforma.htm?action=execute&code=55.2.1.1.4')`.
- Con `?exe=55.2.1.1.4` en la URL, la misma página hace ese clic por código
  (jQuery `trigger("click")` en `#nivel4_55_2_1_1_4` y sus padres).

Desde entonces `menu.mts` espera a que la página quede quieta (`networkidle`)
y elige la opción **igual que la página** (`porCodigo`). Los clics por texto
(`porArbol`) y el buscador quedan de respaldo.

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

**Quinta corrida (08/10/2026, run 37812238507):** la opción por código
**abrió la consulta SPOT** (con la tabla de los últimos días cargada), pero el
script no la reconoció: buscaba el texto «Periodo Tributario» y el primero que
encontraba estaba oculto. Ahora la reconoce por sus campos (`#periodo`,
`#tipoCuenta`) en el recuadro de `e-plataformaunica`. El registro de red
mostró la API de §8: desde entonces el reconocimiento consulta y baja las
constancias **por la API**, y la pantalla (filtros, tabla, modal) queda de
respaldo.

## 8. La API de la consulta SPOT

La pantalla es una fachada, como la de los XML: la consulta vive en un
recuadro de `https://e-plataformaunica.sunat.gob.pe/app/recaudacion/tributaria/internet/html/carrito.html`
(abierto por `servletAcceso?…&idFormulario=55.2.1.1.4`), que carga
`fconsultaDetracciones.html` y llama a esta API. Las rutas están en su código
público (`constantes-fconsultaDetracciones.js`, `fconsultaDetracciones.service.js`):

| Qué | Pedido | Respuesta |
|---|---|---|
| Consultar | `GET /v1/recaudacion/tributaria/declapago/detracciones/t/consultar?&fechaInicio=&fechaFin=&tipoCuenta=1&tipoConsulta=pagosIndividuales&periodo=202609` | `{ cod: 200, msg, resultado: [ … ] }`: una fila por depósito |
| Descargar la constancia («Guardar») | `POST …/t/descargarconstancia?numeroConstancia={n}`, cuerpo `""` | El HTML `constancia_dtr_{n}.html` |
| Ver la constancia (modal) | `GET …/e/obtenerconstancia?indice={i}&numeroConstancia={n}` | JSON. **Va antes de descargar**: sin él, `descargarconstancia` responde 500 |
| Exportar la tabla | `POST …/t/descargararchivoexcel` · `…/t/descargararchivotexto` | `.csv` · `.txt` |
| Parámetros | `GET …/t/obtenervaloresparametrosiniciales` | Catálogos: tipos de documento, bienes y servicios… |

- **Cabeceras:** `IdCache: <sessionStorage.token de la página>` e
  `IdFormulario: *MENU*`. El script llama **desde la misma página**
  (`frame.evaluate`), con sus cookies y su token: el token no sale de ahí.
- **Filtros:** `tipoCuenta` 1 Convencional · 2 Especial IVAP · 3 Ley N° 30737;
  `tipoConsulta` `pagosIndividuales` · `pagosMasivos` · `pagosTransPasajeros`.
  Al abrirse, la página consulta sola los últimos 3 días.
- **Una fila de `resultado`** (constancia 317505340, una venta):

  | Campo | Ejemplo | Campo | Ejemplo |
  |---|---|---|---|
  | `num_constancia` | 317505340 | `num_ruc_proveedor` | 20512201611 |
  | `num_cuenta` | 00002003147 | `des_prov` | INDUSTRIAS ROLAND PRINT S.A.C - INR |
  | `cod_tipcta` | 1 | `tip_doc_adq` / `num_doc_adq` | 06 / 20604269009 |
  | `fec_pago_desc` | 2026-10-07 | `des_adq` | CHINA CIVIL ENGINEERING CONSTRUCTIO |
  | `per_tributario` | 202608 | `tip_operacion` | 01 |
  | `cod_tipcomprobante` | 01 | `tip_bien` | 037 |
  | `num_serie` / `num_comprobante` | E001 / 00002283 | `mto_deposito` | 9406.0 |
  | `num_pres` | 7847239999 (n.° de operación) | `origen_desc` | WEB SUNAT |
  | `cod_usuario_sol` | CCECCPER | `num_npd` | *(vacío)* |

  Si `num_ruc_proveedor` es nuestro RUC, es una **venta** (el cliente nos
  depositó); si no, una **compra**.

**Sexta y séptima corridas (08/10/2026, runs 37816113939 y 37820519336):**
✅ en verde. Login, menú y consulta, sin tropiezos: **`consultar` 202609 →
17 depósitos (todos compras) en ~1,5 s**, con `resultado.json`. Las 3
constancias, en cambio, dieron **HTTP 500 «Request failed»** en
`descargarconstancia`. En la página, el clic en el número azul llama primero a
`constancia(numero, indice)` → `obtenerconstancia` (llena el modal), y recién
después «Guardar» descarga: SUNAT deja la constancia en la sesión en ese
primer paso. Desde entonces el reconocimiento llama a `obtenerconstancia`
antes de descargar. Prueba `indice` desde 0 y desde 1, y guarda el JSON del
modal y, si falla, el cuerpo del error.

**Octava corrida (08/10/2026, run 37825881312): ✅ funciona de punta a punta.**
Login → menú → consulta (202609: 17 depósitos en 1,4 s) → por cada
constancia, `obtenerconstancia` (cod 200) y `descargarconstancia` (HTTP 200,
~5,3 KB, el mismo HTML que baja «Guardar» a mano) → PDF. Las 3 de prueba
coinciden campo por campo con el modal de los pantallazos. `indice` es la
**fila de la tabla empezando en 0** (respondió a la primera con 0, 1 y 2).
Toda la corrida dura ~20 s, sin contar la instalación del navegador.

## 9. La corrida de verdad (`detracciones.mts`, workflow «SUNAT detracciones»)

Desde el 08/10/2026. Hace lo mismo que el reconocimiento, pero con todas las
constancias, y las guarda.

| Archivo | Qué hace |
|---|---|
| `detracciones.mts` | El principal: login, consulta por fecha de pago, cada constancia nueva, lote a la base, pestañas |
| `registro.mts` | Lo puro: compra o venta, nombre del archivo, carpeta, tramos de fechas, la fila de la base |
| `archivo.mts` | Copia en disco, PDF y subida a Drive sin repetir |
| `guardar.mts` | La base (`guardar_detracciones`, de a 20) y las pestañas |

**Cómo busca.** Por **fecha de pago**, mes calendario por mes calendario, en las
tres cuentas (Convencional, IVAP, Ley 30737), en «Pagos individuales». El cron
mira los últimos 10 días: entra todo lo depositado, sea del período que sea, y
deja margen para un día en que GitHub no corra. Si SUNAT responde 5xx a un
rango, se parte en dos hasta un día. Una respuesta «sin datos» se anota y se
sigue. Los **pagos masivos** solo se cuentan y se anotan en `pagos-masivos.json`
(su constancia es otra, en .txt): pregunta pendiente para Contabilidad.

**Qué baja.** De cada constancia que no esté ya en la base con su PDF y su
HTML: `obtenerconstancia` (con su fila de la consulta como `indice`) →
`descargarconstancia` → PDF. Después la copia en
`scripts/out/salida/detracciones/`, Drive y el lote.

**Orden en Drive** (dentro de `SUNAT_DRIVE_FOLDER`, al lado de `Recibidas/` y `Emitidas/`):

```
Detracciones/
├── Compras/AAAA-MM/   ← nosotros depositamos (somos el adquiriente)
└── Ventas/AAAA-MM/    ← un cliente nos depositó (somos el proveedor)
      <RUC proveedor>-<tipo>-<serie>-<número>_DTR-<constancia>.pdf
      <RUC proveedor>-<tipo>-<serie>-<número>_DTR-<constancia>.html
```

- **El mes es el período tributario** (el de la factura), no el del pago.
- **El nombre empieza como el XML de la factura**: buscar la factura en Drive
  trae también su constancia.
- **Nunca se repite un archivo:** cada carpeta se lista una vez y lo que ya
  está no se vuelve a subir.

**En la base:** `detraccion_constancia` (migración 066), una fila por
constancia, reconocida por su número.

**En el libro INROCONTA:**
- **DETRACCIONES**: una fila por constancia, con su factura del SIRE y del XML.
  Estado «Con factura», «Revisar monto» (difiere en más de S/ 1 de la
  detracción del SIRE o del XML; SUNAT redondea el depósito a soles) o
  «Sin factura».
- **DETRACCIONES SIN CONSTANCIA**: compras del SIRE desde 202601 con
  detracción y sin constancia guardada.

**Primera carga:** Actions → **SUNAT detracciones** → Run workflow → `desde`
`01/01/2026`. Para probar sin guardar: `guardar` desmarcado y `limite` 5.

**Antes de la primera corrida hay que aplicar la migración 066** en el editor
SQL de Supabase. Sin ella la corrida igual baja y archiva en Drive, pero no
guarda en la base (el lote queda en la bitácora) ni publica las pestañas.
