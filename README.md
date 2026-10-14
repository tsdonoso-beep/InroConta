# INROCONTA

El sistema de comprobantes SUNAT del área de Contabilidad de **INDUSTRIAS ROLAND PRINT S.A.C. — INROPRIN**
(RUC 20512201611).

Cada día trae de SUNAT el registro de compras (SIRE) y baja el XML y el PDF de cada comprobante. Los archiva en Google
Drive, guarda el detalle de ítems en la base y los cruza con las órdenes de compra (OC), sus carpetas y sus centros de
costo. Además baja las constancias de detracción. Todo termina en el libro **INROCONTA** de Google Sheets y en su **vista
web**, que es lo que usa Contabilidad.

> La guía completa (cada workflow, credenciales, tablas y funciones de la base, tareas comunes y problemas conocidos)
> está en **[docs/GUIA-DEL-REPOSITORIO.md](docs/GUIA-DEL-REPOSITORIO.md)**. Lo que está en curso y lo que falta:
> [docs/ESTADO-Y-PENDIENTES.md](docs/ESTADO-Y-PENDIENTES.md).

## Cómo está armado

```
SUNAT (SIRE, API de comprobantes, SOL)          Drive (carpetas de OC)      Hoja privada (Compras, COMEX, Almacén)
        │                                              │                                │
        └──────────────► GitHub Actions: los robots de scripts/ (Node + Playwright) ◄───┘
                                       │
                         Supabase (comprobantes, ítems, OC, detracciones…)
                                       │
                 Libro INROCONTA (Google Sheets) ──► App web (Next.js en Vercel): la vista de Contabilidad
```

| Pieza                                    | Dónde corre                                   | Cómo se actualiza                                    |
| ---------------------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| Robots de SUNAT, carpetas y detracciones | GitHub Actions (cron diario, hora de Lima)    | Se leen de `main` en cada corrida                    |
| Base de datos                            | Supabase                                      | Migraciones de `docs/database/migrations/`           |
| Libro INROCONTA                          | Google Sheets                                 | Lo escriben los robots y la app                      |
| Vista web de Contabilidad                | Vercel (Next.js, `src/app`)                   | `vercel --prod` (ver [Desplegar](#desplegar-la-app)) |
| Pestañas CARPETA MADRE y PADRÓN RUC      | Apps Script del libro INROCONTA (activadores) | `pnpm apps-script:push`                              |

## Primeros pasos

Hace falta **Node 22** y **pnpm** (la versión exacta está en `packageManager` de `package.json`; con
`corepack enable` se usa sola).

```bash
pnpm install
pnpm exec playwright install chromium
```

`pnpm install` también activa los hooks de git (husky). Para correr los robots en una computadora hace falta además
`.env.local` y la clave de la cuenta de servicio en `secrets/sa.json`; los dos están fuera de git y se describen en la
[guía, §5.4](docs/GUIA-DEL-REPOSITORIO.md#54-local).

## Comandos

| Comando                     | Qué hace                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                  | La app web (Next.js) en `localhost:3000`, con los datos reales del libro ([docs/app-web.md](docs/app-web.md)) |
| `pnpm build`                | Compila la app web como en Vercel                                                                             |
| `pnpm apps-script:push`     | Sube CarpetaMadre.gs y PadronRuc.gs (`apps-script/inroconta/`) a su proyecto de Apps Script                   |
| `pnpm ssco:db archivo.xlsx` | Carga la lista SSCO de SUNAT en la base (`--dry-run` solo la lee)                                             |
| `pnpm ruc:fichas`           | Trae de SUNAT la ficha completa de los RUC del padrón que no la tienen (`--dry-run` no guarda)                |
| `pnpm test`                 | Pruebas unitarias (vitest): las reglas de la app web, los `.gs` y los workflows                               |
| `pnpm check`                | Tipos, lint, formato y que `database.full.sql` esté al día                                                    |
| `pnpm lint` / `pnpm format` | ESLint / Prettier sobre todo el repositorio                                                                   |
| `pnpm db:consolidar`        | Regenera `docs/database/database.full.sql` después de una migración nueva                                     |
| `pnpm cpe:local`            | Comprobantes por la API de SUNAT ([docs/pipeline-cpe-local.md](docs/pipeline-cpe-local.md))                   |
| `pnpm carpetas:local`       | Carpetas de OC ([docs/carpetas-oc-local.md](docs/carpetas-oc-local.md))                                       |
| `pnpm hojas:detalle`        | Republica COMPROBANTES SUNAT - DETALLE                                                                        |
| `pnpm detracciones:local`   | Constancias de detracción a Drive y a la base ([docs/detracciones-spot.md](docs/detracciones-spot.md))        |

En PowerShell las variables van antes con `$env:`, por ejemplo `$env:DEBUG="0"; pnpm padron:local`. Los robots se
corren desde PowerShell o cmd: en Git Bash, `tar` es el de GNU y `domicilios:local` falla con rutas `D:\…`.

## Desplegar la app

La vista de Contabilidad es la app web de `src/app` (Next.js), en Vercel. Desde el 13/10/2026 reemplaza a la
vista de Apps Script, que se retiró. Se despliega desde la raíz con la CLI de Vercel enlazada al proyecto
(`vercel link`, una vez):

```bash
vercel --prod
```

Las variables de entorno, el cliente OAuth de Google y quién puede entrar están en [docs/app-web.md](docs/app-web.md).

En `apps-script/inroconta/` quedan solo los scripts que mantienen pestañas del libro (CarpetaMadre.gs y
PadronRuc.gs, con sus activadores). Se suben con `pnpm apps-script:push` (la primera vez en cada computadora:
activar «Google Apps Script API» en <https://script.google.com/home/usersettings> y `pnpm exec clasp login`). Lo
que se edite en el editor web se pierde en el siguiente push.

## Calidad

- **Formato:** Prettier (`.prettierrc.json`). **Lint:** ESLint con las reglas recomendadas de JavaScript y TypeScript.
- **Hooks:** antes de cada commit, lint-staged (ESLint y Prettier sobre lo que se commitea), el typecheck y la
  comprobación de `database.full.sql`. El mensaje pasa por commitlint.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) en inglés (`type(scope): subject`), máximo
  ~300 líneas y cada uno funcional por sí solo (las migraciones y `database.full.sql` no cuentan).
- **Código nuevo en inglés**; lo que ve Contabilidad (hojas, columnas, la vista), en español.
- **Archivos de hasta 300 líneas** de código: lo nuevo nace así y lo existente se parte cuando se toca.
- El commit que solo cambió el formato está en `.git-blame-ignore-revs`; para que `git blame` lo salte en local:
  `git config blame.ignoreRevsFile .git-blame-ignore-revs`.

## Carpetas

| Carpeta                    | Qué hay                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `.github/workflows/`       | Los robots de GitHub Actions (SUNAT diario, XML, padrón, carpetas de OC, detracciones…)          |
| `apps-script/inroconta/`   | El proyecto de Apps Script del libro INROCONTA (carpeta madre y padrón), con clasp               |
| `apps-script/hojas/`       | Otros Apps Script que se pegan a mano en sus libros ([docs/apps-script.md](docs/apps-script.md)) |
| `src/app/`, `src/modules/` | La app web (Next.js), con DDD y arquitectura hexagonal ([docs/app-web.md](docs/app-web.md))      |
| `src/shared/lib/`          | Lógica compartida de los robots y la app: SUNAT, Drive, armado de hojas                          |
| `scripts/`                 | Lo que corren los workflows, los comandos locales y el despliegue (`scripts/deploy/`)            |
| `scripts/out/`             | Lo que deja cada corrida: bitácoras, salidas, capturas y reportes de pruebas (fuera de git)      |
| `tests/`                   | `unit/` (vitest), `e2e/` (Playwright), `fixtures/` (datos de prueba) y `helpers/`                |
| `docs/`                    | Documentación; `docs/database/` tiene las migraciones de Supabase y `database.full.sql`          |
