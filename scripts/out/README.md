# scripts/out — resultados de los scripts

Aquí cae todo lo que generan las corridas, locales o en GitHub Actions. Nada de
esto se sube al repositorio (está en `.gitignore`), salvo este archivo.

| Carpeta | Qué hay |
|---|---|
| `logs/<script>-<fecha>/` | Bitácora de cada corrida: `eventos.jsonl`, `estado.json`, `errores/` |
| `salida/<script>/` | Resultados: CSV, `resumen.md`, XML/PDF de respaldo (`salida/cpe/`) |
| `capturas/` | Capturas y HTML del portal de SUNAT en modo depuración |

En GitHub Actions estas mismas carpetas se suben como artefactos de la corrida.
