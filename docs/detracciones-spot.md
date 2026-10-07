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

1. **Primero, por GitHub Actions** (workflow manual, en modo reconocimiento:
   no guarda nada, solo deja capturas y HTML de cada pantalla en el artefacto).
   Las corridas las lanza el usuario desde la pestaña Actions.
2. **Cuando el recorrido esté claro**, en una laptop (más rápido, para el
   atrasado), con el mismo script.
3. Al final, la corrida diaria en Actions.

Como todos los que usan la cuenta de SOL: **nunca a la vez** que
`descargar-cpe`, `extraer-cpe-rango`, `consultar-cpe-individual` o
`sunat-cpe-api`.

## 4. El recorrido en SOL

Una sección por pantallazo: qué se ve, qué se hace y qué hay que tener en
cuenta al automatizarlo.

| # | Pantalla | Qué se hace | Notas para el script |
|---|---|---|---|
| 1 | Menú de SOL → … | *(pendiente de pantallazo)* | |
| 2 | Filtros | *(pendiente)* | |
| 3 | Resultado | *(pendiente)* | |
| 4 | Descarga | *(pendiente)* | |
| 5 | La constancia | *(pendiente)* | |

## 5. Datos de la constancia

*(Se llena al ver una constancia: qué campos trae y cuáles sirven para unirla
con la factura —RUC del proveedor, tipo, serie y número—.)*

## 6. Preguntas abiertas

- ¿La pantalla llama por debajo a una API (como «Nueva Consulta» a
  `api-cpe`)? Si la hay, se baja directo, sin pantallas.
- ¿Se puede pedir por rango de fechas o hay que ir constancia por constancia?
- ¿Carpeta de Drive propia o, además, una copia en la carpeta de la OC?
