# ¿Qué hace INROCONTA?

> Explicación de las funcionalidades del sistema, para quien llega por primera vez.
> El detalle técnico (cada robot, credenciales, tablas) está en
> [`GUIA-DEL-REPOSITORIO.md`](GUIA-DEL-REPOSITORIO.md).

## En una frase

**INROCONTA junta en un solo lugar todo lo que Contabilidad necesita sobre las compras de
INDUSTRIAS ROLAND PRINT S.A.C. (INROPRIN, RUC 20512201611).** Trae cada comprobante desde SUNAT,
guarda su XML y su PDF, lo cruza con la orden de compra (OC) y su carpeta en Drive, y avisa lo que
falta o lo que no cuadra.

Antes, todo esto se hacía a mano: entrar a SUNAT, bajar facturas una por una, buscar la OC en Drive
y revisar si estaba la guía o la DAM. Ahora lo hacen **robots cada día**, y Contabilidad lo ve en
una **app web** y en un **libro de Google Sheets**.

---

## 1. Cómo funciona (vista general)

```
   SUNAT                       Google Drive                   Áreas de la empresa
 (comprobantes,            (carpetas de OC de           (base de Compras, STATUS de
  detracciones, RUC)        nacionales e importaciones)  COMEX, kardex de Almacén)
        │                           │                               │
        └──────────────┬────────────┴───────────────┬───────────────┘
                       ▼                            ▼
             ROBOTS (corren solos cada día en GitHub Actions)
                       │
                       ▼
             BASE DE DATOS (Supabase): todo queda guardado y cruzado
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
  Libro INROCONTA              App web INROCONTA
  (Google Sheets)              (la pantalla que usa Contabilidad)
```

- **Los robots** traen la información. Nadie tiene que apretar nada: tienen horario.
- **La base de datos** guarda todo y hace los cruces (factura ↔ OC ↔ carpeta).
- **El libro y la app** muestran el resultado a Contabilidad.

---

## 2. Lo que hacen los robots cada día

| Hora (Lima)   | Robot                   | Qué hace                                                                                                                                                                                                                                                                                                      |
| ------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00:45 y 11:15 | **Copiar fuentes**      | Copia a una hoja privada la base de Compras, el STATUS de COMEX y el kardex de Almacén, para que los robots puedan leerlos sin tocar los originales.                                                                                                                                                          |
| 01:17 y 11:47 | **Carpetas de OC**      | Recorre las carpetas de OC de **compras nacionales** e **importaciones** en Drive: reconoce cada OC y qué es cada archivo (factura, guía, DAM, acta…). Si el nombre no lo dice, **lee el archivo por dentro** (XML, PDF o foto con OCR). Arma el **legajo** de cada OC: qué documentos tiene y cuál le falta. |
| 08:00         | **SUNAT diario (SIRE)** | Pide a SUNAT el **registro de compras** del mes actual y del anterior. Es la lista oficial de **qué comprobantes existen** a nombre de la empresa.                                                                                                                                                            |
| 08:00 y 08:30 | **Descargar XML y PDF** | Baja de SUNAT el **XML y el PDF** de cada comprobante, los archiva en Drive por mes y guarda el **detalle de ítems** (qué se compró, cantidad, precio).                                                                                                                                                       |
| 09:00         | **Padrón de RUC**       | Revisa cada proveedor en SUNAT: si es **buen contribuyente** o **agente de retención o percepción**.                                                                                                                                                                                                          |
| 09:30         | **Detracciones**        | Baja las **constancias de depósito de detracción** pagadas en los últimos 10 días, las archiva en Drive y las une con su factura.                                                                                                                                                                             |
| Lunes 09:40   | **Domicilio fiscal**    | Actualiza la dirección fiscal (distrito, provincia, departamento) de los proveedores con el padrón que publica SUNAT.                                                                                                                                                                                         |

> Si SUNAT está caída o lenta, el robot no pierde nada: lo que no pudo bajar queda pendiente y se
> intenta en la siguiente corrida.

---

## 3. Las funcionalidades, una por una

### 3.1 Comprobantes de SUNAT

- **Lista completa de compras** del SIRE: RUC, razón social, serie y número, fecha, montos, IGV y
  detracción.
- **XML y PDF de cada comprobante**, archivados en Drive (`Recibidas/AAAA-MM`, `Emitidas/AAAA-MM`).
- **Detalle de ítems** leído del XML: descripción, cantidad, precio unitario, forma de pago (contado
  o crédito, con sus cuotas), guía y OC citadas, placa del vehículo (combustible y peajes).
- **Cambios:** si SUNAT modifica un comprobante que ya se había visto, queda registrado.

### 3.2 Cruce con las órdenes de compra (OC)

- Cada factura de SUNAT se une con su **OC** comparando **RUC + serie + número** con lo encontrado
  en las carpetas de Drive (o con la OC que cita el propio XML).
- **Facturas sin OC:** las que no tienen ninguna OC ni archivo en Drive que las respalde. Se pueden
  marcar proveedores que "nunca llevan OC" para que no salgan como alerta.
- **Centro de costo** de cada compra: el que dice Control de Gestión para esa OC o, si no está ahí,
  el de la carpeta de proyecto donde está guardada.

### 3.3 Legajo por OC (¿está completa la carpeta?)

Por cada OC dice qué documentos tiene y cuál le falta:

| Siempre | Si es un bien    | Si es un servicio   | Si es importación            |
| ------- | ---------------- | ------------------- | ---------------------------- |
| Factura | Guía de remisión | Acta de conformidad | DAM (DUA) y cuadro de costeo |

- Estado de cada carpeta: **OK**, **INCOMPLETA** o **VACÍA**.
- **"Por subir":** si el documento que falta ya existe en otro lado (la guía que registró Almacén,
  la DAM o el costeo de COMEX, la factura que ya está en SUNAT), lo señala para que solo falte
  subirlo a la carpeta.
- **Cambios en las carpetas:** OC nuevas, archivos agregados, borrados o renombrados, y OC que se
  completaron o a las que ahora les falta algo.

> Cómo se reconoce cada carpeta y cada documento:
> [`logica-lectura-carpetas-oc.md`](logica-lectura-carpetas-oc.md).

### 3.4 Detracciones

- Todas las **constancias de depósito** (PDF y HTML de SUNAT), unidas a su factura.
- Casos para revisar: el monto no cuadra con la factura, la factura es de un año anterior, no hay
  XML…
- **Facturas con detracción sin constancia:** las que deberían tener depósito y todavía no lo tienen.

### 3.5 Impuestos y retenciones

- **Impuestos:** IGV, montos no gravados, notas de crédito y detracciones del período; **cuadre de
  ventas e IGV por mes** (como el PDT 621).
- **Retenciones:** los comprobantes de retención que emitió la empresa al pagar a sus proveedores
  (3 % del régimen), lo retenido cada mes y las retenciones mal hechas.

### 3.6 Proveedores (RUC)

- **Condición en SUNAT:** buen contribuyente, agente de retención o percepción.
- **Ficha del proveedor** con su domicilio fiscal.
- **Aviso SSCO:** comprobantes recibidos de proveedores de la lista SSCO de SUNAT.

### 3.7 Compras de Almacén y COMEX

- Lee la **base de Compras** (fecha, monto, comprador y forma de pago de cada OC), el **STATUS de
  COMEX** (llegada, agente, DAM y costeo de cada importación) y el **kardex de Almacén** (ingresos y
  salidas, con el escaneo de cada vale).
- Registra lo que cambia de un día a otro: un monto, una DAM, un vale corregido, anulado o
  eliminado; y marca si el cambio fue en un mes ya cerrado.

---

## 4. Dónde lo ve Contabilidad

### 4.1 La app web INROCONTA

Se entra con la cuenta de Google de la empresa (solo los usuarios autorizados).

| Grupo                  | Pantalla                  | Para qué sirve                                                                         |
| ---------------------- | ------------------------- | -------------------------------------------------------------------------------------- |
| **Comprobantes SUNAT** | **Resumen**               | Indicadores del período: cuánto se compró, a quién, con qué alertas.                   |
|                        | **Impuestos**             | IGV, notas de crédito, detracciones y cuadre de ventas e IGV por mes.                  |
|                        | **Detracciones**          | Constancias, casos a revisar y facturas sin constancia.                                |
|                        | **Retenciones**           | Retenciones emitidas, lo retenido cada mes y las mal hechas.                           |
|                        | **Buscar factura**        | Encontrar un comprobante y ver sus ítems, su PDF, su XML y la ficha del proveedor.     |
|                        | **Consulta RUC**          | La condición de un proveedor en SUNAT y su domicilio.                                  |
|                        | **Precios**               | "¿Cuánto pagamos por…?": el precio de cada producto mes a mes.                         |
|                        | **Proveedores**           | Mapa de calor proveedor × mes y los principales proveedores del período.               |
|                        | **OC y centros de costo** | Cuántas compras tienen OC y centro de costo, y los gastos locales de cada importación. |
| **Compras y legajo**   | **Legajo por OC**         | El estado de la carpeta de cada OC y lo que le falta.                                  |
|                        | **Facturas sin OC**       | Facturas de SUNAT que no tienen respaldo en Drive.                                     |
|                        | **Kardex**                | Los movimientos de Almacén y sus cambios (para el cuadre).                             |
|                        | **Cambios del robot**     | Qué cambió en las carpetas de OC, día por día.                                         |
| **Administración**     | **Usuarios**              | Quién puede entrar a la app (solo administradores).                                    |

El menú muestra **avisos con número** (por ejemplo, detracciones a revisar o comprobantes de
proveedores SSCO) para saber dónde hay algo pendiente.

### 4.2 El libro INROCONTA (Google Sheets)

| Pestaña                                                | Qué tiene                                               |
| ------------------------------------------------------ | ------------------------------------------------------- |
| **COMPROBANTES SUNAT**                                 | Un comprobante por fila, con su OC y centro de costo.   |
| **COMPROBANTES SUNAT - DETALLE**                       | Un ítem por fila, con enlaces al PDF, XML y detracción. |
| **DETRACCIONES** / **DETRACCIONES SIN CONSTANCIA**     | Las constancias y las facturas que aún no la tienen.    |
| **OC - CARPETAS COMPRAS NACIONALES / IMPORTACIONES**   | Cada OC y cada archivo de las carpetas de Drive.        |
| **CARPETA MADRE**, **FACTURAS SIN OC**, **PADRÓN RUC** | Resúmenes que mantiene Apps Script dentro del libro.    |

> Los robots solo reescriben su pestaña de datos: si alguien arma tablas o gráficos en otras
> pestañas del mismo archivo, no se tocan.

---

## 5. Qué NO hace (todavía)

- **No registra en CONCAR:** prepara la información, pero el asiento lo hace Contabilidad.
- **No modifica las fuentes:** la base de Compras, COMEX, Almacén y las carpetas de Drive **solo se
  leen**.
- **No corrige las carpetas:** si falta la guía o la DAM, avisa; subirla le toca al área.
- **Alertas por correo a compradores:** el script existe, pero está en pausa hasta validar la
  información.

---

## 6. Glosario rápido

| Término               | Qué es                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------- |
| **SIRE**              | Sistema de SUNAT con el registro oficial de compras y ventas.                                 |
| **CPE**               | Comprobante de pago electrónico (factura, boleta, nota de crédito o débito).                  |
| **XML / CDR**         | El XML es el archivo oficial del comprobante; el CDR es la constancia de SUNAT que lo acepta. |
| **OC / OS**           | Orden de compra (un bien) / orden de servicio.                                                |
| **Legajo**            | El conjunto de documentos que respalda una compra (factura, guía, acta, DAM…).                |
| **DAM (antes DUA)**   | Declaración aduanera con que se nacionaliza una importación.                                  |
| **Detracción (SPOT)** | Parte de una factura que se deposita en el Banco de la Nación a nombre del proveedor.         |
| **Retención**         | El 3 % del IGV que la empresa retiene al pagar a ciertos proveedores.                         |
| **Centro de costo**   | El proyecto o área al que se carga un gasto.                                                  |
| **Kardex**            | El registro de entradas y salidas de Almacén.                                                 |
