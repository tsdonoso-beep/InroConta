# INROCONTA

Comprobantes SUNAT para Contabilidad de **INROPRIN** (RUC 20512201611): trae
el registro de compras (SIRE), baja el XML/PDF de cada comprobante, los cruza
con las órdenes de compra y sus carpetas, y publica el libro **INROCONTA** en
Google Sheets. Corre en GitHub Actions; los tableros, en Google Apps Script.

La guía completa (workflows, credenciales, base de datos, tareas comunes):
**[docs/GUIA-DEL-REPOSITORIO.md](docs/GUIA-DEL-REPOSITORIO.md)**.

## Carpetas

| Carpeta | Qué hay |
|---|---|
| `.github/workflows/` | Los workflows de GitHub Actions (SUNAT diario, XML, padrón, carpetas de OC…) |
| `src/` | Google Apps Script: `.gs` y `.html` que se pegan en el libro (instalación en `docs/apps-script.md`) |
| `src/shared/lib/` | Lógica compartida de los scripts: SUNAT, Drive, armado de hojas |
| `scripts/` | Lo que corren los workflows y los comandos locales (`npm run …`) |
| `scripts/out/` | Resultados de cada corrida: `logs/`, `salida/`, `capturas/` (fuera de git) |
| `docs/` | Documentación |
| `docs/database/` | `database.full.sql` y `migrations/` de Supabase |
| `public/` | Archivos estáticos |

## En una computadora

```bash
npm ci
# .env.local y secrets/sa.json: ver docs/GUIA-DEL-REPOSITORIO.md §5.4
npm run cpe:local           # comprobantes por la API de SUNAT
npm run carpetas:local      # carpetas de OC (docs/carpetas-oc-local.md)
npm run hojas:detalle       # republicar COMPROBANTES SUNAT - DETALLE
npm run detracciones:local  # constancias de detracción a Drive y a la base (docs/detracciones-spot.md)
```

En PowerShell las variables van antes con `$env:`, por ejemplo
`$env:DEBUG="0"; npm run padron:local`.
