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
                 Libro INROCONTA (Google Sheets) ──► App de Apps Script: la vista web de Contabilidad
```

| Pieza                                    | Dónde corre                                    | Cómo se actualiza                                      |
| ---------------------------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| Robots de SUNAT, carpetas y detracciones | GitHub Actions (cron diario, hora de Lima)     | Se leen de `main` en cada corrida                      |
| Base de datos                            | Supabase                                       | Migraciones de `docs/database/migrations/`             |
| Libro INROCONTA                          | Google Sheets                                  | Lo escriben los robots y la app                        |
| Vista web de Contabilidad                | Google Apps Script, dentro del libro INROCONTA | `pnpm deploy:app` (ver [Desplegar](#desplegar-la-app)) |

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

| Comando                     | Qué hace                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm test`                 | Pruebas unitarias (vitest): los `.gs` de la app, el despliegue y los workflows                         |
| `pnpm test:e2e`             | Pruebas de punta a punta (Playwright) de la vista web, en local                                        |
| `pnpm check`                | Tipos, lint, formato y que `database.full.sql` esté al día                                             |
| `pnpm lint` / `pnpm format` | ESLint / Prettier sobre todo el repositorio                                                            |
| `pnpm deploy:app`           | Prueba y despliega la app de Apps Script                                                               |
| `pnpm db:consolidar`        | Regenera `docs/database/database.full.sql` después de una migración nueva                              |
| `pnpm cpe:local`            | Comprobantes por la API de SUNAT ([docs/pipeline-cpe-local.md](docs/pipeline-cpe-local.md))            |
| `pnpm carpetas:local`       | Carpetas de OC ([docs/carpetas-oc-local.md](docs/carpetas-oc-local.md))                                |
| `pnpm hojas:detalle`        | Republica COMPROBANTES SUNAT - DETALLE                                                                 |
| `pnpm detracciones:local`   | Constancias de detracción a Drive y a la base ([docs/detracciones-spot.md](docs/detracciones-spot.md)) |

En PowerShell las variables van antes con `$env:`, por ejemplo `$env:DEBUG="0"; pnpm padron:local`. Los robots se
corren desde PowerShell o cmd: en Git Bash, `tar` es el de GNU y `domicilios:local` falla con rutas `D:\…`.

## Desplegar la app

La vista web vive en un proyecto de Apps Script dentro del libro INROCONTA. Se despliega desde aquí con
[clasp](https://github.com/google/clasp), nunca a mano desde el editor:

```bash
pnpm deploy:app "qué cambió"
```

1. Exige el árbol limpio: lo que sale publicado es siempre un commit.
2. Corre `pnpm test` y `pnpm test:e2e`. Si alguno falla, no se sube nada.
3. `clasp push`, crea una versión nueva y la pone en **la misma implementación de siempre**: el enlace `/exec` no
   cambia nunca. Un enlace nuevo solo aparece si se crea una implementación nueva, y eso no se hace.
4. Escribe en la pestaña **DESPLIEGUES** del libro el enlace vigente (celda B1) y una fila con la versión, el commit y
   los cambios que llevó. Ahí se ve rápido qué cambió en cada despliegue.

`pnpm deploy:app --dry-run` hace solo las comprobaciones y las pruebas, sin subir nada.

**La primera vez en cada computadora:**

1. Activar «Google Apps Script API» en <https://script.google.com/home/usersettings>.
2. `pnpm exec clasp login` con la cuenta que despliega (`pnpm exec clasp show-authorized-user` dice cuál es).
3. `.env.local` con `GOOGLE_SA_EMAIL` y `GOOGLE_SA_KEY_FILE=secrets/sa.json`, y la clave en `secrets/sa.json`: la
   cuenta de servicio es la que escribe la pestaña DESPLIEGUES.

**Ojo con la cuenta:** la app está publicada como «Ejecutar como: el usuario que implementa» (`appsscript.json`). Lee
el libro, Drive y la base con los permisos de quien despliega, así que hay que desplegar siempre con una cuenta que
tenga acceso a todo eso. Cambiar de cuenta cambia con qué permisos corre la vista para todos.

El proyecto (`apps-script/inroconta/`) es exactamente lo que hay en Apps Script: lo que no esté ahí no se sube, y lo
que se edite en el editor web se pierde en el siguiente despliegue.

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

| Carpeta                  | Qué hay                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `.github/workflows/`     | Los robots de GitHub Actions (SUNAT diario, XML, padrón, carpetas de OC, detracciones…)                   |
| `apps-script/inroconta/` | La app del área: el proyecto de Apps Script del libro INROCONTA (vista, carpeta madre, padrón), con clasp |
| `src/`                   | Otros Apps Script que se pegan a mano en sus libros ([docs/apps-script.md](docs/apps-script.md))          |
| `src/shared/lib/`        | Lógica compartida de los robots: SUNAT, Drive, armado de hojas                                            |
| `scripts/`               | Lo que corren los workflows, los comandos locales y el despliegue (`scripts/deploy/`)                     |
| `scripts/out/`           | Lo que deja cada corrida: bitácoras, salidas, capturas y reportes de pruebas (fuera de git)               |
| `tests/`                 | `unit/` (vitest), `e2e/` (Playwright), `fixtures/` (datos de prueba) y `helpers/`                         |
| `docs/`                  | Documentación; `docs/database/` tiene las migraciones de Supabase y `database.full.sql`                   |
