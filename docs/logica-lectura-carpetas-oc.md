# Lógica de lectura de las carpetas de OC (nacionales e importaciones)

> Documento para compartir. Explica **cómo INROCONTA interpreta** las
> carpetas de órdenes de compra en Google Drive: qué carpeta es una OC, qué
> tipo de documento es cada archivo, cómo se lee por dentro un PDF o un XML y
> qué documentos le faltan a cada OC.
>
> Viene con una versión **100 % Apps Script** (sin cuenta de servicio, con la
> API de Drive v2 para el OCR), lista para pegar:
> **`apps-script/compartir/LecturaCarpetasOC.gs`**. Esa versión da los mismos
> resultados que el sistema (se comparó función por función con el código
> TypeScript del repositorio).
>
> Código original, por si se quiere ver el detalle:
>
> | Qué                              | Archivo                                  |
> | -------------------------------- | ---------------------------------------- |
> | Carpeta → OC; archivo → tipo     | `src/shared/lib/drive/carpetas-oc.ts`    |
> | Lectura por dentro (XML/PDF/OCR) | `src/shared/lib/drive/lectura.ts`        |
> | Legajo: qué falta                | `src/shared/lib/drive/legajo-carpeta.ts` |
> | Lectura del XML de SUNAT         | `src/shared/lib/sunat/cpe-xml.ts`        |
> | Versión Apps Script original     | `apps-script/hojas/LegajoPorOC.gs`       |
> | El recorrido completo (Node)     | `scripts/carpetas-oc.mts`                |

---

## 1. Glosario: qué es cada documento

| Sigla / nombre                                   | Qué es                                                                                                                                                                                                      | Cuándo se exige             |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **OC** — Orden de Compra                         | Documento interno con que la empresa le compra un **bien** a un proveedor. Tiene número y año: `0200-2026`.                                                                                                 | Es la carpeta misma.        |
| **OS** — Orden de Servicio                       | Igual que la OC, pero para un **servicio**. **Comparte la numeración** con la OC.                                                                                                                           | Es la carpeta misma.        |
| **Factura**                                      | Comprobante de pago con IGV. Serie que empieza con **F** (`F001-260`) o, si es electrónica emitida desde SOL, con **E** (`E001-45`). Código SUNAT **01**.                                                   | **Siempre.**                |
| **Boleta**                                       | Comprobante a consumidor final. Serie con **B** (`B001-55`). Código **03**. Cuenta como "factura" para el legajo.                                                                                           | (cuenta como factura)       |
| **Nota de crédito / débito** (NC/ND)             | Corrige una factura (descuento / cargo). Código **07** / **08**. Cuenta como "factura".                                                                                                                     | (cuenta como factura)       |
| **RH** — Recibo por Honorarios                   | Comprobante de una persona natural por un servicio. Serie **E** (`E001-4`), código **R01**. Cuenta como "factura".                                                                                          | (cuenta como factura)       |
| **XML**                                          | El archivo oficial del comprobante electrónico (formato UBL 2.1 de SUNAT). Trae todo **exacto**: tipo, serie, número, RUC, montos e incluso la OC citada.                                                   | (cuenta como factura)       |
| **CDR**                                          | _Constancia de Recepción_ de SUNAT: el XML que SUNAT devuelve diciendo "aceptado". **No es la factura.** Suele llamarse `R-…xml` o `R-…zip`.                                                                | No cuenta.                  |
| **INVOICE / Commercial invoice**                 | La **factura del proveedor del exterior** (en importaciones). No tiene serie SUNAT; tiene un número libre (`SZ-2026-0045`).                                                                                 | (cuenta como factura)       |
| **Proforma / Proforma invoice**                  | Cotización formal **antes** de la compra. **No es la factura**, aunque diga "invoice".                                                                                                                      | Opcional.                   |
| **Guía de remisión** (GR / GRE)                  | Documento que acompaña el **traslado físico** de un bien. Serie **T001**, **EG07**… Código **09**. Se reconoce porque trae _punto de partida_ y _de llegada_.                                               | Si la OC es de un **bien**. |
| **Acta de conformidad**                          | Documento donde el área usuaria dice que el **servicio** se hizo bien.                                                                                                                                      | Si es un **servicio** (OS). |
| **DAM** (antes **DUA**)                          | _Declaración Aduanera de Mercancías_: el documento de aduanas con que se nacionaliza lo importado. Número `aduana-año-10-correlativo`: `118-2026-10-123456`. **DUA** es el nombre antiguo; se tratan igual. | Si es **importación**.      |
| **Cuadro de costeo**                             | Excel de COMEX que reparte flete, seguro y aduanas sobre la importación (`COSTEO FINAL OC 012-2026.xlsx`).                                                                                                  | Si es **importación**.      |
| **SWIFT** (MT103, TT copy)                       | Comprobante bancario de una **transferencia al exterior** (pago al proveedor extranjero).                                                                                                                   | Opcional (se registra).     |
| **BL / AWB / Packing list**                      | Documentos de embarque (marítimo _Bill of Lading_, aéreo _Air Waybill_, lista de empaque). Se agrupan como "documento de importación" y cuentan como DAM para el legajo.                                    | (apoya la DAM)              |
| **Detracción** (SPOT)                            | Depósito al Banco de la Nación que se descuenta de ciertas facturas.                                                                                                                                        | No cuenta para el legajo.   |
| **Requerimiento, Cotización, Contrato, Correos** | Documentos de apoyo de la compra.                                                                                                                                                                           | Se registran; no se exigen. |
| **Ficha técnica** (FT)                           | Hoja de especificaciones del producto. **Ojo:** `FT_…` es ficha técnica, **no** factura.                                                                                                                    | No cuenta.                  |

---

## 2. Cómo están ordenadas las carpetas

```
5. Ordenes de Compra/                                   ← CARPETA MADRE (nacionales)
  01) TALLERES ESPECIALIZADOS/                          ← carpeta de PROYECTO (1er nivel)
    OC 2026 - 0200 COMERCIALIZADORA LUCY - TALLERES ESPECIALIZADOS/   ← carpeta de la OC
      Factura y Guía/                                   ← subcarpeta (pista del tipo)
        20603268467-01-F001-260.pdf
        20603268467-01-F001-260.xml
      scan001.pdf                                       ← nombre que no dice nada → se lee por dentro
    OS 0911 -2026 SERVICIOS GENERALES J.VARGAS - TALLERES ESPECIALIZADOS/
```

Para **importaciones** es igual, con otra carpeta madre; los nombres suelen
llevar `IMPO`, `IMP`, `IMPORTACIÓN` o incluso `0C` (cero en vez de O).

**Regla de herencia:** cada carpeta hereda la OC de la de arriba. Todo lo que
está debajo de `OC 2026 - 0200 …` (en cualquier subcarpeta, a cualquier
profundidad) es de la OC 0200-2026. El primer nivel debajo de la madre es el
**proyecto**.

---

## 3. Paso 1 — ¿Esta carpeta es una OC? (`carpetaDeOC_`)

Se busca en el nombre: **[prefijo] + número y año** (en cualquier orden) +
**proveedor** + `-` + **proyecto**.

- **Prefijo** aceptado: `OC`, `O.C.`, `OS`, `0C` (con cero), `ORDEN DE COMPRA`,
  `ORDEN DE SERVICIO`, `IMP`, `IMPO`, `IMPORTACIÓN`, `IMPO OC`, `OC IMPO`, opcionalmente `N°`.
- **Número y año:** `0200-2026`, `2026 - 0200`, `0911 -2026`, `0200_2026`.
  Un sufijo `.1`/`.2` (`1296.1-2025`) es una **parte** de la misma OC 1296.
- **OC u OS:** si empieza con `OS` u `ORDEN DE SERVICIO` → **OS** (servicio); si no, **OC** (bien).
- **Proveedor y proyecto:** lo que queda después del número; se corta en el
  **último** `-`.

| Nombre de carpeta                                                | Resultado                                                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `OC 2026 - 0200 COMERCIALIZADORA LUCY - TALLERES ESPECIALIZADOS` | OC **0200-2026**, prov. COMERCIALIZADORA LUCY, proy. TALLERES ESPECIALIZADOS |
| `OS 0911 -2026 SERVICIOS GENERALES J.VARGAS - TALLERES …`        | **OS** 0911-2026                                                             |
| `IMPO OC 172-2026 NINGBO ABC - PAQ 2 CHINA` (importación)        | OC **172-2026**                                                              |
| `0C 101-2026 SHENZHEN XYZ` (importación)                         | OC **101-2026**                                                              |
| `0200-2026 LUCY` (sin prefijo)                                   | OC 0200-2026 (sin prefijo se piden **3 dígitos o más**)                      |
| `2026-01 ENERO`                                                  | **no es OC** (sin prefijo y solo 2 dígitos)                                  |
| `Factura y Guía`                                                 | no es OC → subcarpeta de la OC de arriba                                     |

### ⚠️ Nacional vs. importación: numeraciones DISTINTAS

Compras nacionales e importaciones llevan **contadores separados**. Para que
no se mezclen:

- **Nacional → 4 dígitos:** `0172-2026`
- **Importación → 3 dígitos:** `172-2026`

`0172-2026` y `172-2026` son **OC diferentes**. La procedencia sale de **qué
carpeta madre** se está leyendo. Si un dato viene de una tabla sin
procedencia, se decide por la cantidad de dígitos (`ocNormalizada_`).

### Una OC dentro de otra

Dentro de una carpeta de OC, una subcarpeta solo se toma como **otra** OC si
su nombre **empieza** con OC/OS y tiene **otro** número. Así
`Facturas 0123-2026` dentro de la OC 0123 no se confunde con una OC nueva.

---

## 4. Paso 2 — ¿Qué es cada archivo, por su NOMBRE? (`clasificarArchivo_`)

Primero se **limpia** el nombre (`textoPlano_`): sin tildes, mayúsculas, sin
extensión, solo letras y números, y se separan letras de números
(`F001` → `F 001`). Luego se aplican estas reglas **en orden**; gana la primera:

1. **XML** (por extensión o tipo): `XML`. Si empieza con `R-` → **CDR** (no es la factura). Un `R-….zip` también es CDR.
2. **`.eml` / `.msg`** → correo.
3. **Número de DAM** en el nombre (`118-2026-10-123456`: 3 dígitos, año, **10**, correlativo) → **DAM**.
4. **Nombre como lo baja SUNAT** `RUC-TIPO-SERIE-NÚMERO` (`20603268467-01-F001-260.pdf`): el código de tipo manda —
   `01` factura, `03` boleta, `07` NC, `08` ND, `09` guía, `R01` RH.
5. **Palabras clave** (la lista `CATEGORIAS`, en este orden, gana la primera que calce):

   | Orden | Categoría                | Palabras / frases que la delatan                                           |
   | ----: | ------------------------ | -------------------------------------------------------------------------- |
   |     1 | CUADRO DE COSTEO         | COSTEO, CUADRO DE COSTEO                                                   |
   |     2 | NOTA DE CRÉDITO          | NC, NOTA DE CREDITO                                                        |
   |     3 | NOTA DE DÉBITO           | ND, NOTA DE DEBITO                                                         |
   |     4 | **PROFORMA**             | PROFORMA, PROFORMA INVOICE, PRO FORMA _(va antes que FACTURA a propósito)_ |
   |     5 | **FACTURA**              | FACTURA, FACT, FAC, FE, INVOICE, INV, COMMERCIAL INVOICE                   |
   |     6 | FICHA TÉCNICA            | FT, FICHA TECNICA                                                          |
   |     7 | BOLETA                   | BOLETA, BV                                                                 |
   |     8 | RECIBO POR HONORARIOS    | RH, RHE, RXH, HONORARIOS                                                   |
   |     9 | COMPROBANTE (revisar)    | COMPROBANTE, CPE                                                           |
   |    10 | DETRACCIÓN               | DETRACCION, SPOT                                                           |
   |    11 | **SWIFT**                | SWIFT, MT103, TT, TT COPY, BANK SLIP _(antes que PAGO)_                    |
   |    12 | **DAM**                  | **DAM, DUA, LEVANTE**, DECLARACION ADUANERA                                |
   |    13 | PAGO                     | PAGO, VOUCHER, TRANSFERENCIA, CONSTANCIA, DEPOSITO, ABONO, ADELANTO        |
   |    14 | GUÍA                     | GUIA, GR, GRE, REMISION                                                    |
   |    15 | ACTA DE CONFORMIDAD      | ACTA, CONFORMIDAD, ACTA DE RECEPCION                                       |
   |    16 | DOCUMENTO DE IMPORTACIÓN | BL, AWB, PACKING, DESADUANAJE, ADUANA, BILL OF LADING                      |
   |    17 | CONTRATO                 | CONTRATO                                                                   |
   |    18 | COTIZACIÓN               | COTIZACION, COT, QUOTATION, QUOTE                                          |
   |    19 | ORDEN DE COMPRA/SERVICIO | OC, OS, PO, ORDEN DE COMPRA, PURCHASE ORDER                                |
   |    20 | REQUERIMIENTO            | REQUERIMIENTO, REQ, RQ                                                     |
   |    21 | CORREO / CAPTURA         | CORREO, EMAIL, GMAIL, CAPTURA, SCREENSHOT, WHATSAPP                        |
   |    22 | DATOS BANCARIOS          | CCI, CUENTA BANCARIA                                                       |

   **Errores de tipeo:** en palabras de 5 letras o más se acepta 1 letra
   distinta (`FACURA` ≈ FACTURA); 2 si tiene 6 o más y empieza igual. Hay una
   lista negra de palabras parecidas que **no** son (`FACTOR`, `BOLETIN`, `REMISOR`, `CONTRATISTA`…).

6. **Correcciones:** `FT F001-123` o `PROFORMA F001-123` con serie SUNAT **sí** son factura.
7. **Solo la serie:** si no hubo palabra pero hay serie → `F…` factura, `B…` boleta, `E…` "factura o RH".
8. **La subcarpeta:** si el nombre no dice nada, se usa el nombre de la
   subcarpeta (solo las que están **debajo** de la carpeta de la OC):
   `Guías / scan001.pdf` → **GUÍA (por la carpeta)**.
9. Si nada → **OTRO**.

### La serie del comprobante en el nombre (`serieEnNombre_`)

Busca `letra F/B/E + 3 caracteres` + separador + número, y quita los ceros a la izquierda:

| Nombre                           | Serie        | Nota                                                         |
| -------------------------------- | ------------ | ------------------------------------------------------------ |
| `F001-00018178.pdf`              | `F001-18178` |                                                              |
| `01F0010031388.pdf`              | `F001-31388` | tipo SUNAT (01) pegado a la serie                            |
| `PDF-DOC-E001-3720547523939.pdf` | `E001-37`    | SUNAT pega el RUC del emisor (11 dígitos) al final; se quita |

### Ejemplos completos

| Nombre del archivo                | Parece                       | Por qué                       |
| --------------------------------- | ---------------------------- | ----------------------------- |
| `20603268467-01-F001-260.pdf`     | FACTURA, serie F001-260      | tipo SUNAT `01` en el nombre  |
| `R-20603268467-01-F001-260.xml`   | CDR (no es factura)          | empieza con `R-`              |
| `DUA 172.pdf`                     | DAM                          | palabra DUA                   |
| `118-2026-10-123456.pdf`          | DAM                          | forma de número de DAM        |
| `PROFORMA INVOICE PI-2026-03.pdf` | PROFORMA (no factura)        | PROFORMA va antes que FACTURA |
| `FT_tornillos.pdf`                | FICHA TÉCNICA                | FT = ficha técnica            |
| `PAGO SWIFT.pdf`                  | SWIFT                        | SWIFT va antes que PAGO       |
| `COSTEO FINAL OC 012-2026.xlsx`   | CUADRO DE COSTEO             | va antes que OC               |
| `BL MSKU123.pdf`                  | DOCUMENTO DE IMPORTACIÓN     | BL = bill of lading           |
| `FACURA LUCY.pdf`                 | FACTURA (sin serie)          | error de tipeo tolerado       |
| `scan001.pdf`                     | OTRO → **se lee por dentro** | el nombre no dice nada        |

---

## 5. Paso 3 — Leer POR DENTRO lo que el nombre no explica

No se abre todo (es lento): solo lo que vale la pena, por **prioridad**
(`prioridadDeLectura_`). **No se abre** si: no es un tipo legible, ya trae
serie en el nombre, pesa más de 25 MB, o es un CDR.

| Prioridad | Qué se abre                                                                                                |
| :-------: | ---------------------------------------------------------------------------------------------------------- |
|   **4**   | XML o ZIP sin serie en el nombre (barato y exacto)                                                         |
|   **3**   | El nombre dice comprobante pero sin número (`FACTURA LUCY.pdf`, `INVOICE.pdf`)                             |
|   **2**   | Nombre genérico (`scan`, `docs`, `WhatsApp Image`, `IMG`, `CamScanner`…) u `OTRO`, o lo dijo la subcarpeta |
|   **1**   | Solo dice "OC" (`docs proveedor oc150-2026.pdf` suele ser la factura escaneada)                            |

### Cómo se abre cada tipo

| Tipo                    | Cómo (Apps Script)                                                                                                                                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **XML**                 | `DriveApp.getFileById(id).getBlob().getDataAsString()` y se lee con expresiones regulares.                                                                                                                                                                      |
| **ZIP**                 | `Utilities.unzip(blob)` → los XML de adentro. Puede traer factura **y** CDR: se elige el de raíz `Invoice`/`CreditNote`/`DebitNote`.                                                                                                                            |
| **PDF / imagen**        | **Drive API v2:** `Drive.Files.copy({title, parents}, id, {convert: true, ocr: true, ocrLanguage: 'es'})` → crea un Documento de Google con el texto (OCR) → `DocumentApp.openById(copia.id).getBody().getText()` → se borra la copia con `Drive.Files.remove`. |
| **Documento de Google** | `DocumentApp.openById(id).getBody().getText()`.                                                                                                                                                                                                                 |

### Del XML (lo más confiable)

El XML de SUNAT (UBL 2.1) dice todo exacto:

| Dato             | Dónde está en el XML                                                           |
| ---------------- | ------------------------------------------------------------------------------ |
| Tipo             | Raíz `CreditNote` → 07; `DebitNote` → 08; si no, `cbc:InvoiceTypeCode` (01/03) |
| Serie-número     | El primer `cbc:ID` con forma `XXXX-NNNN`                                       |
| RUC del emisor   | `cac:AccountingSupplierParty` → `cac:PartyIdentification` → `cbc:ID`           |
| RUC del cliente  | `cac:AccountingCustomerParty` → … (si no es el de la empresa, se avisa)        |
| **OC que cita**  | `cac:OrderReference` → `cbc:ID`                                                |
| CDR (no factura) | Raíz `ApplicationResponse`                                                     |

### Del texto (PDF u OCR): se pide el RASGO, no solo la palabra

Un PDF puede traer varios documentos (factura en la hoja 1, guía en la 2).
Para cada uno se busca algo **propio** de ese documento:

| Documento   | Rasgo que se exige en el texto                                                                                                                                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Factura** | Palabra FACTURA (tolerando OCR: `FACIURA`, `FACTUPA`, `FAC TURA`) **+** "ELECTRONICA" o (serie + "R.U.C."). Boleta: "BOLETA DE VENTA" + serie B. NC/ND: "NOTA DE CRÉDITO/DÉBITO ELECTRONICA". RH: "RECIBO POR HONORARIOS" + serie E. INVOICE: "COMMERCIAL INVOICE" o "INVOICE NO/#/NUMBER/DATE". |
| **Guía**    | "PUNTO DE PARTIDA", "PUNTO DE LLEGADA", "MOTIVO DEL TRASLADO" o "DATOS DEL TRASLADO". _(Una factura **cita** su guía, pero no trae punto de partida.)_                                                                                                                                           |
| **DAM**     | "DECLARACION ADUANERA DE MERCANCIAS", o "DAM" seguido del número `NNN-AAAA-10-NNNNNN`.                                                                                                                                                                                                           |
| **Acta**    | "ACTA DE CONFORMIDAD", "ACTA DE RECEPCION" o "CONFORMIDAD DEL SERVICIO".                                                                                                                                                                                                                         |
| **SWIFT**   | "MT103", "SWIFT COPY/MESSAGE" o el campo `:32A:`.                                                                                                                                                                                                                                                |
| **OC**      | "ORDEN DE COMPRA/SERVICIO" en los primeros 300 caracteres, y **solo si no se halló otra cosa** _(una OC dice "factura a 30 días" sin ser factura)_.                                                                                                                                              |

**La serie en el texto** tolera los errores típicos del OCR: `FO01` → `F001`,
`BOO]` → `B001`, `F001 N° 113668`, `F001 - 00113668`. También reconoce
facturas físicas (`FACTURA 001- N° 0031388`). Las series de guía (`T001`,
`EG07`) se **saltan** para no confundirlas con la factura.

**El RUC del emisor:** el primer RUC (11 dígitos que empiezan con 10, 15, 16,
17 o 20) que **no** sea el de la empresa y que pase el **dígito verificador**
de SUNAT (módulo 11, pesos `5,4,3,2,7,6,5,4,3,2`). Antes se corrigen `O`→`0` e
`I/L`→`1` entre dígitos. Un RUC mal leído por el OCR casi nunca pasa la verificación.

**Resultado de cada lectura:**

- `LEÍDO` — se encontró comprobante con serie-número.
- `SIN COMPROBANTE` — se leyó, pero no es (o no se reconoce) un comprobante.
- `SIN TEXTO` — menos de 20 letras/números (imagen en blanco, PDF protegido).
- `ERROR` — no se pudo bajar o leer.

---

## 6. Paso 4 — El legajo: qué le falta a cada OC

Cada archivo se convierte en uno o más **documentos del legajo**, por lo que
parece por el nombre **más** lo que se leyó por dentro (`clavesDeArchivo_`).
Factura, boleta, NC, ND, RH, XML e INVOICE cuentan todos como **Factura**;
BL/AWB/packing cuentan como **DAM**.

**Requeridos** (`documentosDeOC_`):

| Siempre | Si es bien (OC)  | Si es servicio (OS) | Si es importación          |
| ------- | ---------------- | ------------------- | -------------------------- |
| Factura | Guía de remisión | Acta de conformidad | DAM **y** Cuadro de costeo |

Detalle importante: el "OC" u "OS" del nombre de la carpeta **no siempre
acierta** (hay servicios en carpetas "OC"). Por eso, si la carpeta **ya trae**
guía **o** acta, esa decide y no se pide la otra.

**Estado:** `OK` (no falta nada) · `INCOMPLETA` (falta algo) · `VACÍA` (sin archivos).

---

## 7. Trampas aprendidas (por qué la lógica es así)

- **`FT_…` es ficha técnica**, no factura (así nombran algunos proveedores).
- **"Proforma invoice" no es la factura**: por eso PROFORMA va antes que FACTURA.
- **`R-…xml` es el CDR** de SUNAT, no la factura.
- **Un ZIP puede traer dos XML** (factura + CDR): hay que elegir el de raíz `Invoice`.
- **`0C` con cero** en carpetas de importaciones.
- **`2026-01 ENERO` no es la OC 1**: sin prefijo se piden 3 dígitos.
- **Nacional `0172-2026` ≠ importación `172-2026`.**
- **La carpeta de la OC no sirve de pista** para sus archivos (diría "orden de compra" de todo); solo las subcarpetas de abajo.
- **El RUC de la empresa** (`20512201611`) aparece en todas las facturas pero nunca es el proveedor.
- **SUNAT pega el RUC al número** en algunos nombres (`PDF-DOC-E001-37320547523939`).
- **El tipo de archivo de un Excel contiene "xml"** en su MIME: solo se trata como XML si la extensión es `.xml` o el MIME es exactamente `text/xml`/`application/xml`.

---

## 8. Cómo usar `LecturaCarpetasOC.gs`

1. Crear una **hoja de cálculo nueva** → _Extensiones_ → _Apps Script_ → pegar el archivo.
2. A la izquierda, **Servicios (+)** → **Drive API** → versión **v2** → _Agregar_ (necesario para el OCR de PDF e imágenes).
3. Las dos carpetas madre **ya vienen puestas** arriba del archivo (las mismas que usa INROCONTA):

   | Área                  | Variable                   | Carpeta madre                                                                                    |
   | --------------------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
   | Compras nacionales    | `CARPETA_NACIONALES_ID`    | [5. Ordenes de Compra](https://drive.google.com/drive/folders/1oGUtE0IhqwanRsmuuA7QlQRB_koZzOH3) |
   | Importaciones (COMEX) | `CARPETA_IMPORTACIONES_ID` | [Importaciones](https://drive.google.com/drive/folders/1oJjtLinBgWej-ofRisFyheC29UwdicKi)        |

   La cuenta que corre el script tiene que poder **ver** esas carpetas (al menos como Lector). Si cambian, el ID es lo que va después de `/folders/` en el enlace.

4. Guardar y **recargar la hoja**: aparece el menú **«Carpetas de OC»**.
5. Usar en orden:
   - **1 / 2. Leer nombres** (nacionales / importaciones): recorre la carpeta madre **solo por nombres** (no abre nada) y llena la pestaña **ARCHIVOS** (una fila por archivo: OC, proveedor, proyecto, qué parece, serie, prioridad de lectura).
   - **3. Leer por dentro los pendientes**: abre los archivos con prioridad > 0, de mayor a menor, y llena las columnas «Leído: …». Apps Script corta a los 6 minutos: **repetirlo** hasta que diga "quedan 0". Lo ya leído no se vuelve a leer, ni siquiera si se repite el paso 1 o 2.
   - **4. Armar legajo por OC**: pestaña **OC**, una fila por OC con sus documentos, lo que le falta y su estado.

**Límites a saber:**

- Si la carpeta madre es muy grande y el paso 1/2 no termina en 5 minutos,
  poner `SUBCARPETA = 'TALLERES'` (o el proyecto que sea) e ir por partes.
- Una OC cuya carpeta no tiene **ningún** archivo no aparece en la pestaña OC
  (la tabla se arma a partir de los archivos).
- Para correrlo solo cada noche: _Activadores_ (reloj) → `leerPorDentroPendientes` cada 10 minutos, por ejemplo.
