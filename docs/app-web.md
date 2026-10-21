# La app web (Next.js)

La cara de INROCONTA para Contabilidad. Desde el 13/10/2026 tiene las 11 secciones de la vista de
Apps Script, que se retiró (en `apps-script/inroconta/` quedan solo los scripts que mantienen
pestañas del libro).

## Estructura: DDD + hexagonal, como GRAMA

```
src/
  app/                          Next (presentación): páginas, rutas y componentes de pantalla
    (app)/                      lo que pide sesión; el layout es el marco (menú) y se monta una vez
      (resumen)/ impuestos/ detracciones/ factura/ ruc/ precios/ proveedores/ oc/
      legajo/ sin-oc/ cambios/  una carpeta por pantalla, con su vista
      _comprobantes/            lo que comparten las pantallas SUNAT: almacenes, filtros, KPIs, gráficos
      _ruc/                     la tarjeta del proveedor, la ficha SUNAT y el aviso SSCO
      _lib/                     los almacenes del navegador (resource.ts, stores.ts)
      _components/              el menú
    api/                        lo que pide el navegador: comprobantes (compacto, con ETag), productos,
                                líneas de una factura, legajo, carpeta, detracciones, ruc y ficha
    _lib/                       perf.ts (medir con PERF_LOG=1) y api.ts (sesión + Result → JSON)
  modules/<contexto>/           un bounded context: comprobantes, legajo, detracciones, ruc
    domain/                     PURO: entidades y políticas (Doc, documentsFromLines, summary)
    application/                casos de uso + puertos; views.ts = lo que el navegador puede usar
    infrastructure/             los adaptadores de los puertos (la hoja, Supabase)
    composition.ts              conecta adaptadores con casos de uso: lo único que llama src/app
  shared/
    lib/                        lo compartido con los robots (SUNAT, Drive, hojas)
    supabase/ google/ auth/ config/   clientes del servidor, login y acceso
    ui/                         piezas de diseño (tarjeta, KPI, hueco, formatos)
```

Las fronteras las vigila **dependency-cruiser** (`pnpm depcruise`, dentro de `pnpm check`), con las
reglas de GRAMA: el dominio no importa nada de afuera, la aplicación habla con la infraestructura solo
por puertos, `src/app` solo entra por `composition.ts` o `application/`, y `src/shared/lib` no sabe
nada de la app. Las pruebas de las reglas de cada contexto están en `tests/unit/modules/`.

## Velocidad de carga

Con las reglas de GRAMA (memoria «velocidad de una pantalla»): **medir antes y después, y medir en
`pnpm start`**, nunca en `dev`, que compila cada ruta la primera vez.

```bash
pnpm perf
```

Ese comando corre contra un `pnpm build && pnpm start` (con `DEV_USER_EMAIL` para saltar Google), y
`pnpm perf --rsc` mide lo que viaja en cada clic. Las lecturas del servidor se ven con
`PERF_LOG=1`. Medido el 13/10/2026 (`next start`, caché caliente):

|                                                 | Antes             | Después                                                            |
| ----------------------------------------------- | ----------------- | ------------------------------------------------------------------ |
| Abrir Resumen                                   | 725 ms · 8,2 MB   | 27 ms · 39 KB                                                      |
| Abrir Impuestos                                 | 1 798 ms · 8,2 MB | 23 ms · 31 KB (el cuadre llega detrás)                             |
| Cada clic entre secciones                       | 0,4–1,5 s · 7 MB  | 10–13 ms · 6–8 KB                                                  |
| Cambiar un filtro                               | 7 MB              | 0 bytes                                                            |
| Comprobantes, una vez por pestaña               | —                 | 123 ms · 1,2 MB gzip; 304 si el libro no cambió                    |
| Primera visita con el servidor recién arrancado | 3,4 s             | 0,3 s (`googleapis` se carga solo al leer una hoja: costaba 2,7 s) |

Lo que lo hace posible, en el orden en que se aplicó:

1. **Pedir menos:** los comprobantes viajan en formato compacto (`application/wire.ts`): una fila
   por comprobante y cada texto repetido una sola vez.
2. **Una vez por pestaña:** `_comprobantes/docs-store.ts` los guarda en el navegador y todas las
   pantallas SUNAT los comparten. Empiezan a viajar desde el `<head>` (preload del layout) y se
   revalidan al volver a la pestaña (con ETag, 304 si no cambió nada).
3. **Filtros en el navegador:** `_comprobantes/filter-store.ts` escribe la URL con
   `history.replaceState` y no le pide nada al servidor (`useSearchParams` no se volvía a pintar
   con ese `replaceState` en Next 16).
4. **Lo lento va detrás:** el cuadre de Impuestos es una promesa que la página no espera; llega en
   la misma respuesta y nunca rechaza (un fallo es un valor y se dice en palabras).
5. **El cascarón ES la pantalla:** cada vista se pinta entera desde el primer momento y solo los
   números son huecos (`shared/ui/hueco.tsx`, sin blur) mientras llegan.
6. **`staleTimes`** (30 s / 300 s): volver a una pantalla ya vista es instantáneo.

**Sin `loading.tsx`, a propósito:** las páginas no esperan nada del servidor (los datos los tiene
el navegador), así que no hace falta; y con un `loading.tsx` que montaba la misma vista, la página
dejaba de hidratarse (visto el 13/10/2026: los botones sin React, los datos sin pintar). Si una
pantalla futura sí espera al servidor, se le pone y se prueba que hidrate.

**Lo que queda lento:** la primera lectura de una instancia nueva del servidor (~7 s, la hoja). La
pantalla se ve igual con sus huecos. El arreglo de fondo es que el robot deje los comprobantes ya
armados al publicar la hoja.

### Compras y legajo (13/10/2026)

Medido en `next start`. Las pantallas en sí ya eran rápidas (13–19 ms, 5 KB); lo que se esperaba
era la lectura de la base, que era UNA para las tres:

| Lectura de la base                  | Tiempo    | Viaja (gzip)                       |
| ----------------------------------- | --------- | ---------------------------------- |
| `carpetas_madre_fuentes_json`       | 3,3–3,6 s | 130 KB (Legajo por OC)             |
| `facturas_sin_oc_json`              | 1,7 s     | 71 KB (Facturas sin OC)            |
| `carpeta_cambio` (los últimos 500)  | 0,28 s    | 11 KB (Cambios del robot)          |
| Antes, las tres juntas              | 5,8 s     | 212 KB para cualquiera de las tres |
| `detalle_de_carpeta` (abrir una OC) | ~0,9 s    | 3–5 KB                             |

Lo que se hizo:

1. **Pedir menos:** una lectura por pantalla (`/api/legajo/carpetas`, `/sin-oc`, `/cambios`).
   Cambios ya no espera los 3,5 s de las carpetas.
2. **Leer en el tiempo ocioso, y guardarlo en la memoria de la pestaña** (RAM; nunca
   localStorage ni sessionStorage): cuando la primera pantalla ya tiene sus comprobantes,
   `_components/idle-warmup.tsx` lee, **una detrás de otra** (a la vez se estorbaban en la base: 6 s
   y 7 s), los cambios, las facturas sin OC, las detracciones, las fichas RUC y las carpetas, salvo
   con «ahorro de datos». Así esas pantallas abren con sus datos. Los números del menú (Impuestos,
   Detracciones, Legajo, Sin OC, Cambios, SSCO) salen de esa memoria con `peek()`, que mira sin
   pedir: con `use()` el menú disparaba todas las lecturas a la vez al montarse (visto el
   14/10/2026).
3. **El detalle de una carpeta, en cola y de fondo:** cuesta ~0,9 s en la base porque
   `detalle_de_carpeta` calcula `evidencias_de_fuentes` y `vinculos_oc` de TODA la empresa (~1 s
   cada una) y se queda con una OC. Pedirlo al posar el ratón en cada fila saturaba la base (15 a la
   vez: 7–10 s cada uno y cortes por el tope de 8 s, `57014`). Ahora `keyed()` (`_lib/resource.ts`)
   precarga **uno a la vez** y en la memoria de la pestaña: todas las filas visibles en orden (y las
   de «Ver más» al final), pausando si la pestaña está oculta, y la fila donde el ratón se
   queda 150 ms pasa al frente. Lo que se abre se pide al momento. Medido: abrir la 7.ª fila tras la
   precarga, 0,2 s.

**Lo que queda en el detalle:** acotar `evidencias_de_fuentes` a la OC (un parámetro opcional,
migración pequeña) quita ~1 s; `vinculos_oc` (187 líneas, la usan muchas funciones) es el otro
~1 s. Sacar las facturas de los comprobantes del navegador en vez de `vinculos_oc` NO sirve: por
número de OC coinciden 38 de 40, y la columna «Carpeta de la OC» del DETALLE viene vacía en los
14 475 comprobantes (comprobado el 13/10/2026).

**Lo que queda:** la función de las carpetas sigue costando 3,5 s (y más si coincide con otras
lecturas), una vez cada 10 min por instancia del servidor. Las dos salidas, por coste: (a) sin tocar
la base, la caché de datos de Next en Vercel (`unstable_cache`), compartida entre instancias: la
paga solo el primero cada 10 min; (b) con una migración, que el robot de carpetas deje el resultado
ya armado en una tabla al terminar (dos veces al día) y la lectura baje a ~0,3 s.

**`pnpm dev` silencia el aviso `DEP0108` de `zlib`:** sale del `fetch` que Next trae compilado
(`next/dist/compiled/edge-runtime`), no de nuestro código ni de nuestras dependencias, y en
producción no aparece.

## De dónde salen los datos

- **Los comprobantes** se leen de la pestaña **COMPROBANTES SUNAT - DETALLE** del libro, la que los
  robots publican desde la base. Es lo mismo que la base pero ya calculado: ~7 s contra ~93 s de
  pedírselo a `detalle_cpe_hoja_con_detraccion` por páginas (medido el 13/10/2026). Se guarda 15 min
  en la memoria del servidor.
- **Precios y el detalle de una factura** salen de esa misma lectura (las líneas quedan en la
  memoria del servidor): no se vuelve a leer la hoja.
- **Lo que no está en esa hoja** (cuadre de ventas, legajo, facturas sin OC, cambios, detracciones,
  fichas RUC, lista SSCO) se pide a la base con las funciones `*_json`, que contestan en una
  consulta (las detracciones, por páginas de 1000). Se entra como el usuario robot, igual que los
  scripts. Se guarda 10 min (legajo, detracciones) o 30 min (RUC) en la memoria del servidor; en
  el navegador, cada lectura se hace una vez por pestaña (`_lib/stores.ts`) y la comparten las
  pantallas que la usan.

## Quién entra

Con Google, solo cuentas `@inroprin.com` que estén en la pestaña **USUARIOS** del libro
(columnas «Correo» y «Rol»). Contabilidad da o quita acceso editando una fila; el cambio vale en
unos minutos. Los correos de `INROCONTA_ADMINS` entran siempre (para el primer ingreso).

## Variables de entorno

En `.env.local` para la laptop, y en Vercel → Settings → Environment Variables:

| Variable                                   | Para qué                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `SUPABASE_URL_V2`, `SUPABASE_SECRET_KEY`   | La base v2 (docs/database/v2/), con la llave secreta: solo el servidor la usa           |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | El cliente OAuth del login (abajo)                                                      |
| `NEXTAUTH_SECRET`                          | Firma la sesión: `openssl rand -base64 32`                                              |
| `NEXTAUTH_URL`                             | La URL pública de la app (en local, `http://localhost:3000`)                            |
| `INROCONTA_ADMINS`                         | Correos que entran siempre, separados por coma                                          |
| `DEV_USER_EMAIL`                           | Solo en la laptop (`dev` o `start`, nunca en Vercel): entra como ese usuario sin Google |

## El cliente OAuth de Google (una vez)

Google Cloud Console, en el proyecto de la cuenta de servicio → APIs y servicios → Credenciales →
Crear credenciales → ID de cliente de OAuth → **Aplicación web**:

- Orígenes de JavaScript autorizados: la URL de Vercel (y `http://localhost:3000`).
- URI de redireccionamiento autorizados: `<URL>/api/auth/callback/google` (y
  `http://localhost:3000/api/auth/callback/google`).
- Pantalla de consentimiento: tipo **Interno** (solo la organización inroprin.com).

## Desplegar

La app no lee hojas ni Drive: en Vercel no va la cuenta de servicio de Google, ni las claves de
SUNAT, ni la base vieja. La CLI sube SOLO lo que lista `.vercelignore` (una lista blanca: `src/`,
`public/` y la configuración del build); `secrets/`, `scripts/out/` y lo demás no salen de la laptop.

Desde la raíz del repositorio, con la CLI de Vercel enlazada al proyecto (`vercel link`, una vez):

```bash
vercel --prod
```
