# Carpetas de OC en tu computadora (`npm run carpetas:local`)

El mismo script que corre cada noche en GitHub (`scripts/carpetas-oc.mts`),
corrido en una computadora. Sirve para la **carga pesada**: abrir y leer por
dentro miles de PDF la primera vez, sin gastar minutos de GitHub y sin
límite de 6 horas.

**Se puede cortar cuando sea.** Lo leído se guarda en la base cada 50
archivos (`lectura_archivo`); al volver a correr el mismo comando sigue
donde quedó y no relee nada. El recorrido de carpetas (nombres) sí se repite
en cada corrida: tarda unos minutos.

**No lo corras al mismo tiempo que la corrida de GitHub** (02:00 a. m.): las
dos reemplazan las mismas tablas.

## 0. Con Claude en tu computadora (opcional)

Claude Code también corre en tu computadora y ahí sí ve tus carpetas: en la
app de escritorio de Claude, pestaña **Code** → elegir la carpeta del
repositorio (`InroConta`), o en una terminal dentro de esa
carpeta, `claude`. Lee esta guía y la de `GUIA-DEL-REPOSITORIO.md`; le puedes
pedir «corre la carga de carpetas de OC según docs/carpetas-oc-local.md y
avísame el resumen». Puede correr el comando, seguir la bitácora y
explicarte el resultado; lo que no puede es tocar nada fuera de esa carpeta
sin pedirte permiso.

## 1. Lo que ya tienes (de `npm run cpe:local`)

El repositorio clonado, `npm install` hecho y el `.env.local` con
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ROBOT_CORREO`, `ROBOT_CLAVE`,
`GOOGLE_SA_EMAIL` y `GOOGLE_SA_KEY_FILE` (la clave en `secrets/sa.json`).
Nada más hace falta para recorrer las carpetas y leer los XML y ZIP.

## 2. Para leer PDF y escaneos (una sola vez)

Sin esto el script igual corre: lee XML y ZIP, y deja los PDF e imágenes
para la corrida de GitHub (en el resumen salen como «sin herramienta para
leerlos»).

**Tesseract (el OCR):**

```bash
winget install --id UB-Mannheim.TesseractOCR
```

Después baja el español: `spa.traineddata` desde
<https://github.com/tesseract-ocr/tessdata_fast> y cópialo a
`C:\Program Files\Tesseract-OCR\tessdata\`.

Si Windows no deja copiar ahí (pide administrador), usa una carpeta propia:
crea `C:\Users\<tu usuario>\tessdata`, copia en ella `spa.traineddata` más
`eng.traineddata` y `osd.traineddata` (de la carpeta `tessdata` de
Tesseract) y agrega `TESSDATA_PREFIX` al `.env.local` (abajo). El script le
pasa sus variables a Tesseract, así que la encuentra. Para comprobar:
`tesseract --list-langs` con esa variable puesta debe mostrar `spa`.

**Poppler (texto de los PDF):** baja el último `Release-…zip` de
<https://github.com/oschwartz10612/poppler-windows/releases> y descomprímelo
en `C:\poppler`. El zip trae una carpeta `poppler-<versión>` adentro: mueve
su contenido para que quede `C:\poppler\Library\bin\pdftoppm.exe`.

**Dile al script dónde están** — agrega al `.env.local` (con `/`: en ese
archivo las barras invertidas se pueden romper si lo editas desde Git Bash):

```
LECTOR_TESSERACT=C:/Program Files/Tesseract-OCR/tesseract.exe
LECTOR_POPPLER=C:/poppler/Library/bin
# solo si el español quedó en una carpeta propia:
TESSDATA_PREFIX=C:/Users/<tu usuario>/tessdata
```

## 3. Los comandos

Cada uno, en una ventana de terminal **aparte** (no la terminal integrada de
la app de Claude ni del editor: si la app se reinicia, se lleva la corrida).
La pantalla queda en blanco mientras corre: el avance va a
`scripts/out/logs/carpetas-oc-<fecha>/eventos.jsonl` (y `estado.json` dice si terminó).
Terminó cuando vuelve a aparecer el `PS …>` o `$`.

**PowerShell** (la terminal por omisión de Windows) — primero
`cd D:\Documents\GitHub\InroConta` (o donde esté el repositorio):

```powershell
# Prueba: solo mira, no guarda nada
$env:PROCEDENCIA="nacional"; $env:LEER_MAX="200"; npm run carpetas:local

# La carga de verdad, compras nacionales
$env:DEBUG="0"; $env:PROCEDENCIA="nacional"; $env:LEER_MAX="20000"; $env:LEER_MINUTOS="120"; npm run carpetas:local

# Importaciones (en la misma ventana: las demás variables siguen puestas)
$env:PROCEDENCIA="importacion"; npm run carpetas:local
```

Las variables de `$env:` duran mientras la ventana esté abierta: para volver
a una prueba después de una carga, abre otra ventana (o
`Remove-Item Env:DEBUG`), si no la «prueba» guarda.

**Git Bash:**

```bash
# Prueba: solo mira, no guarda nada (resultado en scripts/out/salida/carpetas-oc/)
PROCEDENCIA=nacional LEER_MAX=200 npm run carpetas:local

# La carga de verdad, compras nacionales: hasta 2 h de lectura por corrida
DEBUG=0 PROCEDENCIA=nacional LEER_MAX=20000 LEER_MINUTOS=120 npm run carpetas:local

# Importaciones
DEBUG=0 PROCEDENCIA=importacion LEER_MAX=20000 LEER_MINUTOS=120 npm run carpetas:local
```

Cómo reparte el trabajo (no hace falta tocar nada; los valores por omisión
se ajustan solos a la computadora):

- **Recorrido**: una cola continua de carpetas con 16 consultas a Drive a la
  vez (`PARALELO_DE_A_UNA`); apenas se lee una carpeta, sus subcarpetas
  entran a la cola.
- **Lectura**: dos topes separados. `DESCARGAS` (8): archivos bajando a la
  vez —es espera de red—. `PROCESADORES` (uno por núcleo de la
  computadora): OCR a la vez, cada uno en su propio proceso. Mientras unos
  archivos se bajan, otros ya se están leyendo.
- **OCR**: página por página, y para apenas encuentra el comprobante (casi
  siempre en la primera).
- Si la computadora se pone lenta mientras la usas, baja los procesadores:
  `PROCESADORES=2`.
- `LEER_MINUTOS`: cuánto lee antes de guardar todo y terminar. Si se acaba
  el tiempo, vuelve a correr el mismo comando.
- `SUBCARPETA=TALLERES`: solo ese proyecto (la corrida no reemplaza lo de
  los otros ni anota cambios).
- Deja la computadora sin suspenderse (Windows → Energía → «Nunca»): si se
  suspende, la corrida se congela.

Al terminar, el resumen sale en la pantalla y en
`scripts/out/salida/carpetas-oc/<nacionales|importaciones>/resumen.md`, con los CSV de
detalle al lado. La hoja «OC - CARPETAS …» se publica igual que desde GitHub.
