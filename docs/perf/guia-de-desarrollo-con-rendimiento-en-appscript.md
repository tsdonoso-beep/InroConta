# Guía de desarrollo con rendimiento en Apps Script

Una guía para **desarrollar cualquier app** sobre **Google Apps Script + Google Sheets** que sea rápida desde el diseño: formularios, tableros, reportes, consultas sobre planillas grandes, flujos de aprobación… Las reglas salen de mediciones reales en producción (septiembre–octubre 2026). Se midieron con **GramaKanban**, un tablero kanban en uso diario, que aparece **solo como ejemplo**: lo que vale es el principio, que se aplica igual a cualquier proceso.

**Cómo usarla:**

- **Al diseñar una app nueva:** leer la sección 1 (el modelo de costos: qué es caro y qué no) y la 2 (los principios). La 9 es una lista para empezar, y la 6 trae código para copiar.
- **Cada principio dice:** la regla, por qué (con la cifra medida), cómo aplicarla, **cuándo no conviene** y un ejemplo.
- **Si en otro proyecto algo no cuadra** (otra cuenta, otro dominio, otro tamaño de datos), el **kit portátil** (sección 4.1) mide lo mismo en ese proyecto. Es opcional: solo hace falta para confirmar una cifra que se sospecha distinta.
- **Grado de confianza** de cada cifra:
  - ●●● medida varias veces, con más de 15 llamadas o en sesiones distintas;
  - ●● una sesión, con 8 a 15 llamadas;
  - ● pocas llamadas: es una pista, no una regla.

---

## 1. El modelo de costos (lo que hay que tener en la cabeza)

En Apps Script **lo caro no son los datos ni la CPU: son los VIAJES**, cada uno con un costo fijo alto, sin importar cuánto lleve.

| Viaje                                                                                     | Costo fijo                                                                                           | Lo que casi no importa                                                        | Evidencia                                                  |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Navegador → servidor** (`google.script.run`)                                            | **p50 ≈ 0.9–1.1 s**, aunque el servidor no haga nada                                                 | El tamaño: 1 KB y 1 MB tardan lo mismo                                        | ●●● 3 sesiones; "ejecución vacía" y "peso del viaje"       |
| **Servidor → hoja** (cualquier pedido: leer, `getLastRow`, `getSheetByName`, `getSheets`) | **~150–350 ms** en frío (hasta ~900 en el p95)                                                       | Las columnas: 1000 filas x 1 col 208 ms vs x 19 col 244 ms                    | ●●● `diagnosticoVelocidad`, `lab1a`, `lab1b`               |
| **Leer filas**                                                                            | ~0.16 ms por fila, encima del costo fijo                                                             | —                                                                             | ●● 26 mil filas x 19 col: 4.3 s                            |
| **Una escritura** (con candado + flush)                                                   | **~850 ms de servidor**, casi igual para 1 o 20 cambios                                              | Cuántas filas escribe (hasta decenas)                                         | ●● lote de 1, 2, 5, 10 y 20                                |
| **Escribir un bloque** (`setValues` + `flush`, sin candado)                               | **~300 ms fijos + ~1.2 ms por fila**: 1 fila ~300–390 · 10 ~380–450 · 100 ~600–785 · 1000 ~1.5–2.2 s | —                                                                             | ●● `kit3` (06/10)                                          |
| **`appendRow` en un bucle**                                                               | **~320 ms CADA uno** (10 seguidos: 3.2–3.4 s, contra ~400 ms de un `setValues` de 10 filas)          | —                                                                             | ●● `kit3`                                                  |
| **Leer entre escrituras**                                                                 | 10 × (escribir + leer) = **2.7–4.3 s**, contra ~450 ms escribiendo las 10 seguidas                   | Escribir celda por celda **sin** leer en medio (~450 ms, casi como un bloque) | ●● `kit3`                                                  |
| `getLastRow`                                                                              | ~85 ms **cada vez** (nunca se recuerda)                                                              | —                                                                             | ●● `kit1`, `lab1a`                                         |
| **`CacheService`**                                                                        | get ~25 ms, put ~50–80 ms; 1 MB en trozos: get ~40, put ~120 ms                                      | El tamaño (1 KB y 90 KB cuestan casi lo mismo)                                | ●●● `lab4`, `kit4`, tablero real con caché                 |
| `PropertiesService`                                                                       | get ~40 ms, set ~70 ms                                                                               | —                                                                             | ●● `kit4`                                                  |
| `LockService` tomar y soltar                                                              | ~120–180 ms (p95 ~700)                                                                               | —                                                                             | ●●                                                         |
| Servicio dentro de un bucle (`Utilities.formatDate`, `Session.getScriptTimeZone`)         | ~0.2–0.34 ms **por llamada**: mil filas ≈ 0.2–0.7 s (JS puro: ~1 ms las mil)                         | —                                                                             | ●●● `lab5`, `lab5b`, `kit5`                                |
| CPU pura (JS)                                                                             | JSON de 355 KB: stringify ~8 ms, parse ~2 ms; gzip ~32 ms                                            | —                                                                             | ●● `kit5`                                                  |
| **Activador de tiempo** (`after(1000)`)                                                   | corrió a los **115 s**                                                                               | —                                                                             | ● una prueba                                               |
| Página con datos dentro (213 KB)                                                          | ~2 s más hasta el primer script que una página vacía (2470 vs 431 ms)                                | —                                                                             | ●● una apertura de cada una (la prueba 0 del kit mide más) |

**Tres sorpresas que cambian cómo medir:**

1. **Apps Script recuerda lo leído dentro de una ejecución**, por rango. La segunda lectura del mismo rango cuesta 11–50 ms en vez de 100–600 ms. Cualquier escritura le hace olvidar todo, y las lecturas de 1000 filas o más no se recuerdan nunca. **Una prueba que repite algo dentro de la misma ejecución mide la memoria, no la hoja.** Lo que vive el usuario es la llamada "fría" (una ejecución nueva).
2. **La hoja "pesada" casi nunca es el problema.** Se sospechó de las fórmulas (`HOY()`, QUERY). El diagnóstico mostró `flush` en 0 ms y columnas con fórmulas leídas en 2 ms. El problema era la **cantidad de viajes**. Medir antes de arreglar evitó optimizar lo que no era.
3. **Una pausa no "enfría" nada.** La llamada después de 25 s sin uso no fue más lenta (1338 ms contra 2510 enseguida; ● n=5). No sirve hacer "pings" para mantener caliente.

---

## 2. Principios generales

Cada uno trae: **regla · por qué · cómo · cuándo no · cómo comprobarlo en otra app**.

### P1 · Contar viajes, no datos

- **Regla:** diseñar cada pantalla y cada acción para hacer **la menor cantidad de llamadas** al servidor y de pedidos a la hoja. El tamaño de lo que viaja casi no importa (hasta ~1–2 MB).
- **Por qué:** sección 1. Cada llamada cuesta ~1 s fijo y cada pedido a la hoja ~150–350 ms. En GramaKanban, abrir pasó de 43 pedidos a 5 (y a 0 con caché): de 5.7 s a 2 s de servidor, sin cambiar qué datos se leen.
- **Cómo:** una llamada por pantalla (o ninguna, si sale de la caché). En el servidor, un pedido por tabla (P2) y un lote por acción (P3).
- **Cuándo no:** si lo que viaja pasa de varios MB (miles de filas completas), el tamaño sí pesa. Ver P10.
- **Comprobar:** kit pruebas 1, 2, 3 y `kit1_pedidosSueltos`.

### P2 · Leer: un pedido por tabla

- **Regla:** cada tabla se lee con **un** `getRange('A2:T').getValues()` (rango abierto) y las filas vacías del final se recortan en memoria. **Nunca** `getLastRow()` + `getRange()` (son dos pedidos). Las pestañas se piden **una vez** con `getSheets()` y se arma un mapa por nombre.
- **Por qué:** cada consulta suelta (`getLastRow`, `getMaxRows`, `getSheetByName`) cuesta como una lectura. El costo va **por fila, casi nada por columna**, así que conviene traer todas las columnas de una vez.
- **Cómo:** recetas 6.1 y 6.2.
- **Ojo:** `getLastRow()` **miente** si alguna columna tiene `ARRAYFORMULA`, porque esa columna "ocupa" toda la hoja. Para saber la última fila real, mirar desde abajo la columna de ID.
- **Cuándo no:** tablas de decenas de miles de filas cuando solo hace falta una parte (P10).
- **Comprobar:** `kit1_pedidosSueltos`, `kit2_leer`.

### P3 · Escribir: costo fijo → juntar en lotes, y el candado corto

- **Regla:** una escritura cuesta casi lo mismo con 1 cambio que con 20. **Juntar** los cambios seguidos en **una** llamada y **un** candado. No leer entre escrituras.
- **Por qué:**
  - lote de 1 cambio ~2.5 s y lote de 20 ~2.0 s (●● p50);
  - 10 cambios: uno por uno, 25 s · todos a la vez, 7.8 s · pool de 3, 10.2 s · **un lote, 2.3 s** (●●).
  - Las escrituras se acumulan solas hasta que algo **lee** o hace `flush`; una lectura en medio obliga a Google a escribir todo y responder. Ejemplo: `getLastRow()` después de `appendRow` costaba +430 ms. Medido con el kit: 10 escrituras con una lectura entre cada una, **2.7–4.3 s**; las mismas 10 sin leer en medio, ~450 ms.
  - **`appendRow` NO se acumula:** cada uno cuesta ~320 ms (10 seguidos, 3.2–3.4 s). Para varias filas, **un** `setValues` del bloque (~400 ms las 10).
  - Un bloque cuesta ~300 ms fijos + ~1.2 ms por fila (1000 filas ≈ 1.5–2.2 s).
- **Concurrencia:** el candado pone a las personas en fila. Con 4 escribiendo a la vez, cada escritura tardó p50 3.2 s y hasta 9 s (●●), y todo ese tiempo extra fue espera del candado. **El candado debe durar lo mínimo:** nunca llamadas externas, esperas ni avisos dentro de él.
- **Cómo:** en el navegador, una cola que junta los cambios de ~300 ms y los manda juntos (receta 6.5). En el servidor, un candado, una lectura de IDs, todos los cambios, un `flush`.
- **Cuándo no:** acciones que la persona hace de a una y espera ver confirmadas (guardar un formulario). Ahí el lote no aporta nada.
- **Comprobar:** kit pruebas 6 (escritores a la vez) y 7 (tamaño), y `kit3_escribir`.

### P4 · No repetir: caché con versión (y parchar, no tirar)

- **Regla:** lo que se lee seguido se guarda en `CacheService` con una **versión**. **Toda** escritura **parcha** la copia (dentro del candado) o cambia la versión.
- **Por qué:**
  - abrir el tablero real con caché, **1197 ms** (servidor 100), contra leer la hoja, 2649 ms (servidor 1370) (●●);
  - después de escribir, la apertura siguiente: invalidar todo, 2447 ms · por secciones, 2233 · **parchar, 1361** (●●, 0 datos viejos en 24 aperturas).
- **Reglas de correctitud** (salieron de pruebas que **fallaron** y tenían razón):
  1. Guardar la copia con la versión que había **antes** de leer la hoja. Si alguien escribió en medio, la versión ya cambió y esa copia no se sirve.
  2. **Toda** escritura actualiza o invalida **todas** las copias. Una sola que se olvide deja una copia vieja, y los parches siguientes se apilan encima.
  3. El parche (leer copia → corregir → guardar) va **dentro del candado**. Si no, dos personas leen la misma copia y la segunda pisa a la primera.
  4. Las invalidaciones que pasan **sin** candado (activadores, funciones que no lo usan) también lo toman.
  5. Lo editado **a mano** en la hoja se detecta con un activador instalable "Al editar", que invalida.
  6. Un **vencimiento** (p. ej. 10 min) cubre lo que cambia por otras vías (otro script, una pestaña nueva creada a mano).
  7. Parchar **releyendo de la hoja** las filas cambiadas, no armándolas con lo que mandó el navegador. Así la copia queda idéntica a una lectura completa.
  8. Lo personal (quién es, la fecha de hoy) **no** va en la copia: se recalcula en cada llamada.
- **Detalles:** ~100 KB por clave, así que se parte en trozos, cada uno con la versión adelante, y se lee todo con **un** `getAll`. Sin comprimir fue más rápido a este tamaño (210 KB: ~56 ms; con gzip 47 KB pero ~92 ms).
- **Cuándo no:**
  - datos que cambian por vías que no se pueden detectar (otro sistema escribiendo por API), salvo con un vencimiento muy corto;
  - datos por persona: necesitan una caché por persona;
  - más de ~800 KB: no entra en 10 trozos.
- **Comprobar:** kit prueba 8 (caché vs hoja), `kit4_cacheYPropiedades`; y en la app propia, una prueba de estrés como la 10 de `LabCarga`.

### P5 · Mostrar algo YA: esqueleto primero

- **Regla:** la página llega **vacía y liviana** con un esqueleto (rectángulos grises con la forma de la pantalla), y los datos llegan después en una llamada, idealmente desde la caché.
- **Por qué:** con 213 KB de datos dentro de la página, 4957 ms de pantalla en blanco; vacía, el esqueleto se ve a los 433 ms (●●). Meter datos en la página **sí** pesa, a diferencia de `google.script.run` (P1), porque Google mete la página en un marco y la procesa entera.
- **Cuándo no:** páginas con muy pocos datos (unos KB), donde un viaje extra (~1 s) cuesta más que el peso.
- **Comprobar:** kit prueba 0. Abrir varias veces `?kit=peso&kb=0`, `100`, `300` y `1000`.

### P6 · Escrituras optimistas

- **Regla:**
  1. pintar el cambio YA;
  2. mandar;
  3. avisar "guardado" **solo** al confirmar;
  4. si falla, revertir, señalar dónde (p. ej. sacudir la tarjeta) y decir el motivo.

  La escritura devuelve lo guardado, y el navegador actualiza su copia **sin recargar todo**.

- **Por qué:** cada escritura tarda ~2–3 s de ida y vuelta (P3), y nadie debería esperarla.
- **Detalles:** un elemento nuevo lleva un ID temporal y no se puede usar hasta tener el real. Si varios cambios fallan juntos, se revierten del último al primero.

### P7 · Paralelo: sirve para lecturas independientes, no para partir una carga

- **Apps Script no tiene hilos.** Lo que hace sus veces:
  - **Varias `google.script.run` a la vez** desde el navegador: cada una es una ejecución aparte y **sí van en paralelo** (32 llamadas: de a 1 33 s, de a 16 2.7 s; ●●). Cada una sigue costando ~1 s.
  - **`UrlFetchApp.fetchAll`** dentro del servidor: 4 consultas gviz, 2735 → 1113 ms; 13 páginas, 10285 → 5309 ms (●●).
- **Partir una carga** en 4 llamadas paralelas **no** ganó: 2821 ms contra 2409 de una sola (●●). Cada llamada paga su costo fijo y la más lenta manda.
- **Escrituras en paralelo:** pelean por el candado (P3).
- **Comprobar:** kit pruebas 4 (¿hay un techo de llamadas simultáneas?) y 5 (¿la hoja se frena con lecturas en paralelo?), y `kit6_fetchAll`.

### P8 · Lo lento va por detrás, y no hay colas de servidor rápidas

- **Regla:** los avisos (Chat, correo) los devuelve la escritura y el navegador los manda **después**, en otra llamada, fuera del candado. Mucho envío a un webhook: uno por segundo, con reintento si responde 429.
- **Los activadores de tiempo no sirven como cola interactiva:** "dentro de 1 s" corrió a los 115 s. Sirven para trabajo que puede esperar minutos.
- **Riesgo:** si la persona cierra la pestaña justo en ese segundo, el aviso se pierde. En GramaKanban se aceptó.

### P9 · Ningún servicio de Google dentro de un bucle

- **Regla:** `Utilities.formatDate`, `Session.getScriptTimeZone`, `getRange` sueltos, etc. van **fuera** de los bucles. Para fechas, JS puro (`getFullYear`…), con una **red de seguridad**: la primera vez, comparar contra `Utilities` en 3 fechas y volver a `Utilities` si no coinciden.
- **Por qué:** ~0.34 ms por llamada. Con 26 mil filas, `formatDate` tardó ~19 s y JS puro 331 ms. JS da lo mismo porque Apps Script corre en la zona horaria del script: 0 diferencias en 812 fechas reales (●●●).
- **Comprobar:** `kit5_cpu`.

### P10 · Grandes volúmenes (decenas de miles de filas)

Medido con 26 mil filas x 19 columnas:

| Qué                                                        | Tiempo                       |
| ---------------------------------------------------------- | ---------------------------- |
| Página de 200 filas por número de fila                     | **120 ms**                   |
| gviz (consulta tipo SQL por URL: filtrar, contar, paginar) | ~700–800 ms                  |
| Fórmula QUERY                                              | ~1040 ms                     |
| Leer todo                                                  | 4300–5956 ms y ~14.6 MB      |
| 13 páginas leídas a la vez desde el navegador              | 3826 ms (● n=3)              |
| TextFinder                                                 | **22 s**                     |
| Navegador: armar 26k elementos                             | ~4.7 s (virtualizado: 40 ms) |
| Navegador: filtrar / ordenar 26k en memoria                | 30 / 22 ms                   |

- **Reglas:**
  - mostrar = paginar por número de fila;
  - buscar, filtrar o contar = gviz (varias a la vez con `fetchAll`);
  - **nunca** traer todo ni usar TextFinder;
  - en el navegador, **virtualizar** (crear solo lo visible).
- **Dibujar:** pintar crece en línea recta (~0.6 ms por elemento, 75 % es el dibujo del navegador). `content-visibility:auto` lo hace 3–4 veces más rápido, **pero el scroll salta** si los elementos tienen alto variable (saltos de ~800 px medidos). Solo sirve con alto fijo.

### P11 · Medir bien (sin esto, todo lo anterior es adivinar)

- Medir **en producción**, **en frío** (una ejecución nueva por llamada) y por **percentiles**: p50 es la vez típica, p90 y p95 las malas.
- **Turnar** los casos (A, B, C, A, B, C…), para que una racha de red lenta les toque a todos.
- Para cada llamada lenta, separar dónde se fue el tiempo: **antes** de que empezara el servidor, **en** el servidor, o **después**.
- Cronómetros por tramos en el servidor (`⏱ nombre: N ms · tramo1 X · tramo2 Y`) desde el día 1.
- **Pruebas con control:** una prueba que busca errores tiene que demostrar que es capaz de encontrar uno. Ejemplo: romper la copia a propósito y ver que la detecta.
- Los mensajes de error deben decir **el error real y la cuenta**. Uno que decía "corre lab0_preparar" en realidad escondía "esta cuenta no tiene acceso".
- **No inventar números:** lo que no se midió se dice ("los 300 ms del lote no están medidos").

### P12 · Correctitud mientras se optimiza

- **Regresión:** antes de un cambio grande, guardar una copia del código ("referencia"). Correr la referencia y el código nuevo sobre la **misma hoja simulada**, con las mismas acciones, y exigir hojas y respuestas **idénticas**. Contar también los pedidos.
- **Laboratorio aparte:** las pruebas que escriben van a un **archivo aparte** y a claves de caché propias; en la app real, solo lectura.
- **Simular antes de mandar:** funciones que deciden pero no envían nada, corridas en el editor real, antes de soltar algo que escribe en un Chat o en la hoja.
- **Estrés:** varias "personas" a la vez escribiendo y leyendo, y al final comparar el resultado con la fuente, campo por campo.

---

## 2b. Cómo se traduce a otros tipos de app

No son mediciones nuevas: es aplicar los principios a apps que no son un tablero.

| Tipo de app                                                                   | Lo que más pesa                                       | Diseño recomendado                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Formulario de registro** (alta de pedidos, solicitudes)                     | Guardar: candado + escritura (~2–3 s de ida y vuelta) | Escritura optimista con confirmación (P6). **Un** `setValues` de la fila completa, no celda por celda (P3). ID con una lectura de la columna de IDs, dentro del candado. Los catálogos (listas desplegables) desde la caché (P4). |
| **Tablero o dashboard** (indicadores, gráficos)                               | Leer muchas hojas al abrir                            | Esqueleto primero (P5). Un pedido por hoja (P2) y el resultado **ya calculado** en caché con versión (P4). No calcular en el navegador lo que se puede dejar calculado al escribir.                                               |
| **Buscador o consulta sobre una planilla grande** (decenas de miles de filas) | Traer datos que no se van a mostrar                   | Paginar por número de fila o gviz para filtrar y contar (P10). Varias consultas a la vez con `fetchAll` (P7). Virtualizar la lista (P10). Nunca TextFinder.                                                                       |
| **Flujo de aprobaciones** (pasa por varias personas, con avisos)              | Avisos y escrituras de varias personas a la vez       | Avisos por detrás (P8). Candado corto (P3). Caché parchada para que cada uno vea el estado al día (P4). Activador "Al editar" si alguien toca la hoja a mano (sección 3).                                                         |
| **Carga masiva / importación** (pegar o subir cientos de filas)               | Escribir fila por fila                                | Un solo `setValues` en bloque (P3); validar en memoria antes de escribir; si hay avisos, uno por segundo y fuera del candado (P8).                                                                                                |
| **Reporte para descargar o imprimir**                                         | Leer y formatear mucho de una vez                     | Leer en un pedido (P2), fechas en JS (P9), armar en memoria y devolver una sola vez (el tamaño de la respuesta casi no importa hasta ~1–2 MB, P1).                                                                                |

**Preguntas para cualquier pantalla nueva:**

1. ¿Cuántas llamadas al servidor hace al abrir y en cada acción? (meta: 1 o ninguna)
2. ¿Cuántos pedidos a la hoja hace cada una?
3. ¿Qué ve la persona mientras espera?
4. ¿Qué pasa si falla?
5. ¿Qué se repite y puede ir a la caché, y quién la invalida o la parcha?

## 3. Errores comunes que ya costaron caro

- **Varias cuentas de Google abiertas** en el navegador: `google.script.run` falla con PERMISSION_DENIED. Probablemente también explica las colas de ~43 s: aparecieron en una sesión y **en ninguna** de ~1000 llamadas con una sola cuenta en ventana privada (●●, falta la prueba con varias cuentas).
- **Activador "Al editar":** uno simple no puede usar `UrlFetchApp`; hay que instalarlo. **No fiarse de `e.range`:** al pegar, Google puede reportar solo la celda donde se pegó. Lo robusto es revisar la tabla entera y recordar lo ya procesado.
- **Lo que escribe un script no dispara "Al editar".** Sirve para corregir datos sin re-avisar, pero también significa que las escrituras de la app tienen que invalidar la caché por su cuenta.
- **`console.log` muy largo se corta** ("Logging output too large"): escribir en partes.
- **IDs repetidas** cuando la gente pega filas a mano con numeración propia. Validar o avisar.

---

## 4. Herramientas

### 4.1 Kit portátil (`gs/KitRendimiento.gs` + `html/KitRendimientoPagina.html`)

**Para comprobar las reglas en CUALQUIER otra app.** No depende de GramaKanban. Crea su propio archivo ("KIT rendimiento (se puede borrar)") y nunca toca la app.

- **Instalar en otra app:**
  1. Copiar los dos archivos al proyecto.
  2. En su `doGet(e)`, poner al principio: `if (e && e.parameter && e.parameter.kit) return _paginaKit(e.parameter.kit, e.parameter.kb);`
  3. Guardar.
- **Editor** (en orden): `kit0_preparar` (una vez) → `kit1_pedidosSueltos` → `kit2_leer` → `kit3_escribir` → `kit4_cacheYPropiedades` → `kit5_cpu` → `kit6_fetchAll`.
- **Navegador** (app web `/dev`, ventana privada con la cuenta dueña):
  - `?kit=1` → pruebas 1 a 8 (~12 min) y 9 (pausas);
  - `?kit=peso&kb=0|100|300|1000` → peso de la página. Abrir cada una varias veces y luego `?kit=1` muestra la tabla.
- **Qué responde:** el piso por llamada, si pesa bajar o **subir** datos, si hay un techo de llamadas simultáneas, si la hoja se frena con lecturas en paralelo, **cuántas personas pueden escribir a la vez**, si escribir cuesta por fila o es fijo, caché contra hoja, pausas, y dónde se pierde el tiempo de las llamadas lentas.
- Prueba local: `node _pruebas/kit.js`. Lo corre **solo** (como en otro proyecto) y dentro de GramaKanban, y comprueba que no toque la app.

### 4.2 Laboratorios de GramaKanban (específicos)

- `gs/Lab.gs` + `html/LabPagina.html`: pedidos sueltos, escala, memoria, caché, fechas, escrituras, 26k, en frío.
- `gs/LabCarga.gs` + `html/LabCargaPagina.html` (`?lab=carga`): estrategias de caché (invalidar / parchar / secciones), peso, pools, dividir, colas de escritura, 26k en paralelo, calentar, tablero real, tamaño del lote, **estrés de la caché parchada**, quién soy; y en el editor `fetchAll` y retraso de activadores.
- `gs/Diagnostico.gs`: ¿la hoja es pesada? (solo lee).

### 4.3 Pruebas locales (`_pruebas/`, con `node`, sin internet)

- `gas_mock.js`: simulación de Apps Script que **cuenta pedidos** (lecturas, consultas, caché, escrituras). Hojas que fallan si un rango se sale, caché con límite de 100 KB, Propiedades, candado, activadores y `fetchAll`.
- `regresion.js`: referencia contra código nuevo, misma hoja simulada, exige todo idéntico. Incluye el choque lectura/escritura, la caché idéntica a la hoja, lotes y la red de seguridad de las fechas.
- `armar_navegador.js` + `servidor.js` → la app real en el navegador con el servidor .gs simulado y una red falsa (`window.__lat`). Sirve para arrastrar y soltar, scroll, parpadeos y fallos.
- **Los tiempos de la simulación no valen.** Solo dicen si el código corre y cuántos pedidos hace.

---

## 5. Despliegue sin clasp (copiando a mano)

- El editor no tiene carpetas. Los `.gs` comparten **un** ámbito global. Los HTML van **sin** `.html` y deben coincidir con los `include()`. Un `.gs` y un HTML **no** pueden llamarse igual.
- Si queda un archivo viejo con las mismas funciones, todo está declarado dos veces y nada funciona ("Identifier … has already been declared": algo se pegó dos veces).
- **Las constantes de primer nivel no deben depender de otro archivo** (`const X = [HOJA_TAREAS]`): si Apps Script carga ese archivo antes, falla al arrancar. Usar una función.
- App web: _Administrar implementaciones → lápiz → **Nueva versión**_ (no "Nueva implementación", que cambia el enlace). Antes de publicar, probar en el enlace `/dev` de "Probar implementaciones", que usa el código guardado.
- Parámetros en la URL: `?nombre=valor` (`?lab=carga`, no `?=labcarga`).
- Si un archivo de JS queda mal pegado, la consola (F12) dice "X is not defined" y el arranque se corta a medias.
- Subir **juntos** los archivos que se llaman entre sí.

---

## 6. Recetas (código)

### 6.1 Mapa de pestañas (un pedido para todas)

```javascript
let _mapaHojas = null;
function _hojaDe(nombre) {
  if (!_mapaHojas) {
    _mapaHojas = {};
    SpreadsheetApp.getActive()
      .getSheets()
      .forEach(function (h) {
        _mapaHojas[h.getName()] = h;
      });
  }
  return _mapaHojas[nombre] || SpreadsheetApp.getActive().getSheetByName(nombre);
}
```

### 6.2 Leer una tabla en un pedido

```javascript
function _leerAbierto(hoja, desdeFila, nCols) {
  if (!hoja) return [];
  try {
    return hoja.getRange('A' + desdeFila + ':' + String.fromCharCode(64 + nCols)).getValues();
  } catch (e) {
    // red de seguridad: la forma vieja (dos pedidos)
    const ultima = hoja.getLastRow();
    return ultima >= desdeFila ? hoja.getRange(desdeFila, 1, ultima - desdeFila + 1, nCols).getValues() : [];
  }
}
// Después: recortar desde abajo las filas cuyo ID esté vacío.
```

### 6.3 Fechas en JS con red de seguridad

```javascript
let _fechasJSok = null;
function _fechasJS() {
  if (_fechasJSok === null) {
    try {
      const p = [new Date(2026, 0, 15, 8, 30), new Date(2026, 6, 15, 23, 5), new Date()];
      _fechasJSok = p.every(function (d) {
        return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm") === _fechaHoraJS(d);
      });
    } catch (e) {
      _fechasJSok = false;
    }
  }
  return _fechasJSok;
}
function _fechaJS(v) {
  return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2);
}
function _fechaHoraJS(v) {
  return _fechaJS(v) + 'T' + ('0' + v.getHours()).slice(-2) + ':' + ('0' + v.getMinutes()).slice(-2);
}
```

### 6.4 Caché con versión que se parcha

Implementación completa en `gs/ApiLectura.gs` de GramaKanban: `api_cargarTodo`, `_cacheTableroLeer`, `_cacheTableroGuardar`, `_tableroParcharTareas`, `_tableroCambio`, `_tableroCambioConCandado`. Esqueleto:

```javascript
function cargar() {
  const c = leerCache(); // UN getAll: versión + meta + trozos
  if (c.datos) return conLoPersonal(c.datos);
  const d = leerHoja();
  guardarCache(d, c.version); // con la versión de ANTES de leer
  return d;
}
function escribir(cambios) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    aplicar(cambios);
    SpreadsheetApp.flush();
    parcharCache(filasCambiadas); // relee esas filas, corrige la copia, versión nueva en el MISMO putAll
  } finally {
    lock.releaseLock();
  }
}
function invalidar() {
  CacheService.getScriptCache().put('version', Utilities.getUuid(), 21600);
}
```

### 6.5 Cola de escrituras en el navegador (lotes)

Implementación en `html/js_Base.html` de GramaKanban (`encolarMovimiento` / `enviarMovimientos`) y `api_moverTareas` en el servidor:

- encolar con un temporizador de ~300 ms (**valor no medido**);
- mandar todo en una llamada;
- cada cambio recibe su propia respuesta (ok o error);
- los fallidos se revierten del último al primero;
- mandar lo pendiente en `pagehide` y al ocultar la pestaña.

---

## 7. Caso GramaKanban: antes → después

| Qué (p50)                                  | Antes (24/09)                    | Después (02/10)                                              |
| ------------------------------------------ | -------------------------------- | ------------------------------------------------------------ |
| Leer el tablero en el servidor             | 4.3–5.7 s                        | 1.4 s de la hoja · **0.1 s desde la caché**                  |
| Abrir, ida y vuelta                        | ~4.1 s (+ ~2 s de página pesada) | **~1.2 s** desde la caché, con el esqueleto visible a ~0.4 s |
| Pedidos a la hoja: abrir · guardar · mover | 43 · 16 · 8–21                   | 5 (0 con caché) · 4 · 2                                      |
| 10 movimientos seguidos                    | ~25 s (uno por uno)              | ~2.3 s (lote)                                                |
| Apertura después de un cambio              | relee la hoja (~2.4 s)           | sale de la caché (~1.4 s)                                    |

**Probado y descartado:**

- `content-visibility`: el scroll saltaba.
- Caché por secciones: casi no gana.
- Mandar al navegador solo lo que cambió: el tamaño no importa.
- Partir la carga en llamadas paralelas: no gana.
- Cola con activadores: 115 s.
- TextFinder: 22 s.
- gzip en la caché: más lento a este tamaño.

---

## 8. Problemas abiertos e ideas

- **Colas de ~43 s:** confirmar si vienen de tener varias cuentas abiertas. Correr la prueba 4 del kit, o la 3 de `LabCarga`, en una ventana normal con varias cuentas, y comparar las llamadas lentas.
- **Ediciones que no disparan "Al editar"** (pestañas nuevas a mano, otros scripts): la caché las ve con hasta 10 min de atraso.
- **Ideas sin aplicar:**
  - lotes para acciones masivas;
  - "¿cambió?" barato al volver a la pestaña (pedir solo la versión);
  - virtualizar si pasa de ~1000 elementos;
  - API avanzada de Sheets (`batchGet`), que pide permisos nuevos.

### Pruebas pendientes (al 06/10/2026)

1. **`kit5_cpu` y `kit6_fetchAll` no terminaron.** `kit5` imprimió todas sus mediciones y después el registro quedó en "Cargando…" ~11 min. `kit6` nunca mostró resultados. Revisar en _Ejecuciones_ el estado de esas dos (¿Completado, Error, Tiempo agotado?) antes de repetirlas. Sospechas sin confirmar: el editor dejó de refrescar el registro (la ejecución pudo haber terminado), o el paso que guarda en la hoja RESULTADOS del kit (`kit5`), o las consultas gviz (`kit6`), que dependen del token y del acceso al archivo del kit.
2. **Kit en el navegador:** `?kit=peso&kb=0|100|300|1000` (3 aperturas cada una) y `?kit=1` → "▶ 1 a 8" y "9 · Pausas". Responde: subir datos, techo de llamadas a la vez (hasta 32), lecturas en paralelo, cuántas personas escribiendo a la vez, escritura por fila, caché vs hoja y peso de la página.
3. **Cuelgues de ~43 s:** repetir "4 · Cuántas a la vez" del kit (o "3 · Pools" de `?lab=carga`) en una **ventana normal con varias cuentas** y comparar las llamadas lentas con las de la ventana privada.
4. **Medir el tablero publicado** con los últimos cambios (caché parchada y lotes), si se subieron: líneas `⏱ api_cargarTodo … desde caché`, `⏱ api_moverTareas` y `⏱ api_guardarTarea` de _Ejecuciones_, y `⏱ tablero con datos a los N ms` de la consola.

## 9. Lista para empezar una app nueva

1. Cronómetros por tramos desde el día 1.
2. Correr el **kit portátil** en el proyecto nuevo: confirma el modelo de costos de esa cuenta y ese dominio.
3. Una llamada por pantalla; un pedido por tabla; mapa de pestañas (P1, P2).
4. Esqueleto primero; datos desde caché con versión (P4, P5).
5. Escrituras optimistas, en lote, con candado corto; avisos por detrás (P3, P6, P8).
6. **Toda** escritura parcha o invalida la caché, dentro del candado; activador "Al editar" si la gente toca la hoja a mano (P4).
7. Nada de servicios de Google dentro de bucles; fechas en JS con red de seguridad (P9).
8. Para decenas de miles de filas: paginar, gviz, virtualizar (P10).
9. Regresión local contra una referencia, estrés con control, y medir en producción en frío por percentiles (P11, P12).
