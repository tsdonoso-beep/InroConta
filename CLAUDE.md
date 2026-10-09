Mapa del repositorio (qué hay, dónde corre, credenciales, workflows, tasa de éxito): `docs/GUIA-DEL-REPOSITORIO.md`. Leerlo antes de tocar los workflows de SUNAT.

- Los scripts corren con `node --experimental-strip-types` (sin compilar): los imports llevan extensión `.ts`/`.mts` y rutas relativas.
- Todo lo que generan las corridas va a `scripts/out/` (fuera de git).
- Usar pnpm (hay `pnpm-lock.yaml`), no npm.
- En Windows, correr los scripts desde PowerShell o cmd: en Git Bash `tar` es GNU tar y `domicilios:local` falla con rutas `D:\…`.
