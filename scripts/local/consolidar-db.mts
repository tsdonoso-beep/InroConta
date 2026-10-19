// Genera docs/database/database.full.sql: todas las migraciones de docs/database/migrations/, en orden, en un solo archivo.
//
//   pnpm db:consolidar               (regenerarlo después de agregar una migración)
//   pnpm db:consolidar --revisar     (falla si el archivo quedó desactualizado; para CI)
//   pnpm db:consolidar --v2          (la base nueva: docs/database/v2/ → database.full.v2.sql)
//
// Corrido sobre una base vacía de Supabase, deja el esquema como está hoy:
// tablas, políticas de fila y la versión vigente de cada función (la última
// migración que la toca gana, igual que al aplicarlas una por una). Es solo
// ESTRUCTURA: los datos viven en Supabase y se respaldan aparte.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const V2 = process.argv.includes('--v2');
const DIR = join(process.cwd(), 'docs', 'database', V2 ? 'v2' : 'migrations');
const NOMBRE = V2 ? 'database.full.v2.sql' : 'database.full.sql';
const SALIDA = join(process.cwd(), 'docs', 'database', NOMBRE);

export function consolidar(archivos: Array<{ nombre: string; sql: string }>, nombre = 'database.full.sql'): string {
    const huella = createHash('sha256');
    for (const a of archivos) huella.update(a.nombre).update('\0').update(a.sql);
    const partes = [
        '-- ════════════════════════════════════════════════════════════════',
        `-- ${nombre} — GENERADO, no editar a mano (pnpm db:consolidar${nombre === 'database.full.sql' ? '' : ' --v2'})`,
        `-- ${archivos.length} migraciones: ${archivos[0]?.nombre ?? '-'} → ${archivos[archivos.length - 1]?.nombre ?? '-'}`,
        `-- huella: ${huella.digest('hex').slice(0, 16)}`,
        '--',
        '-- Aplicar sobre una base VACÍA (proyecto nuevo de Supabase): SQL Editor →',
        '-- pegar todo → Run. Para una base existente, aplicar solo las migraciones',
        `-- que falten, una por una, desde docs/database/${nombre === 'database.full.sql' ? 'migrations' : 'v2'}/.`,
        '-- ════════════════════════════════════════════════════════════════',
        '',
    ];
    for (const a of archivos) {
        partes.push(
            '',
            `-- ┌──────────────────────────────────────────────────────────────`,
            `-- │ ${a.nombre}`,
            `-- └──────────────────────────────────────────────────────────────`,
            '',
        );
        partes.push(a.sql.replace(/^\uFEFF/, '').replace(/\s+$/, ''), '');
    }
    return partes.join('\n') + '\n';
}

export function leerMigraciones(dir = DIR): Array<{ nombre: string; sql: string }> {
    const nombres = readdirSync(dir)
        .filter((n) => /^\d{3}_.+\.sql$/.test(n))
        .sort();
    nombres.forEach((n, i) => {
        const esperado = String(i + 1).padStart(3, '0');
        if (!n.startsWith(esperado)) throw new Error(`falta la migración ${esperado} (encontré ${n}): no se consolida con huecos`);
    });
    // Sin \r: con core.autocrlf, en Windows los archivos llegan con CRLF y la huella no debe
    // depender de la máquina donde se genera.
    return nombres.map((nombre) => ({ nombre, sql: readFileSync(join(dir, nombre), 'utf8').replace(/\r\n/g, '\n') }));
}

if (process.argv[1]?.endsWith('consolidar-db.mts')) {
    const texto = consolidar(leerMigraciones(DIR), NOMBRE);
    if (process.argv.includes('--revisar')) {
        const actual = existsSync(SALIDA) ? readFileSync(SALIDA, 'utf8').replace(/\r\n/g, '\n') : '';
        if (actual !== texto) {
            console.error(`✗ docs/database/${NOMBRE} está desactualizado: corre pnpm db:consolidar${V2 ? ' --v2' : ''}`);
            process.exit(1);
        }
        console.log(`✓ docs/database/${NOMBRE} al día`);
    } else {
        writeFileSync(SALIDA, texto);
        console.log(`✓ ${SALIDA} (${(texto.length / 1024).toFixed(0)} KB)`);
    }
}
