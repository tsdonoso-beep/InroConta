// The DETALLE tab's lines, read from the v2 base and built as the web app builds them
// (src/shared/lib/export/detail-v2.ts): a document without XML has its line too. Every robot
// that publishes the tab (pipeline, descargar-cpe, consultar-cpe-individual) reads it here.

import { detailLinesFromV2 } from '../../../src/shared/lib/export/detail-v2.ts';
import { readDetailSource } from '../../../src/shared/lib/export/detail-v2-read.ts';
import type { FilaDetalleCpe } from '../../../src/shared/lib/export/items-sunat.ts';
import { base } from './base.mts';
import { RUC } from './config.mts';

/** Every line of the tab; only those of `periodos` (AAAAMM of the issue date) when given. Throws if the read fails. */
export async function leerDetalle(periodos: string[] = []): Promise<FilaDetalleCpe[]> {
    const filas = detailLinesFromV2(await readDetailSource(base(), RUC));
    return periodos.length ? filas.filter((f) => periodos.includes(f.periodo ?? '')) : filas;
}
