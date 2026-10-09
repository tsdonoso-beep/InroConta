# INROCONTA

Comprobantes SUNAT para Contabilidad de **INROPRIN** (RUC 20512201611): trae
el registro de compras (SIRE), baja el XML/PDF de cada comprobante, los cruza
con las órdenes de compra y sus carpetas, y publica el libro **INROCONTA** en
Google Sheets. Corre en GitHub Actions; los tableros, en Google Apps Script.

La guía completa (workflows, credenciales, base de datos, tareas comunes):
**[docs/GUIA-DEL-REPOSITORIO.md](docs/GUIA-DEL-REPOSITORIO.md)**.

## Carpetas

| Carpeta              | Qué hay                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `.github/workflows/` | Los workflows de GitHub Actions (SUNAT diario, XML, padrón, carpetas de OC…)                        |
| `src/`               | Google Apps Script: `.gs` y `.html` que se pegan en el libro (instalación en `docs/apps-script.md`) |
| `src/shared/lib/`    | Lógica compartida de los scripts: SUNAT, Drive, armado de hojas                                     |
| `scripts/`           | Lo que corren los workflows y los comandos locales (`pnpm …`)                                       |
| `scripts/out/`       | Resultados de cada corrida: `logs/`, `salida/`, `capturas/` (fuera de git)                          |
| `docs/`              | Documentación                                                                                       |
| `docs/database/`     | `database.full.sql` y `migrations/` de Supabase                                                     |
| `public/`            | Archivos estáticos                                                                                  |

## En una computadora

```bash
ppnpm install --frozen-lockfile
# .env.local y secrets/sa.json: ver docs/GUIA-DEL-REPOSITORIO.md §5.4
pnpm cpe:local              # comprobantes por la API de SUNAT
pnpm carpetas:local         # carpetas de OC (docs/carpetas-oc-local.md)
pnpm hojas:detalle          # republicar COMPROBANTES SUNAT - DETALLE
pnpm detracciones:local     # constancias de detracción a Drive y a la base (docs/detracciones-spot.md)
```

En PowerShell las variables van antes con `$env:`, por ejemplo
`$env:DEBUG="0"; pnpm padron:local`.
