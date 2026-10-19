// How an OC folder is told in words, the same in the legajo screens and in the DETALLE tab: what
// documents it has and where its cost centre came from.
import { DOCUMENTOS } from './legajo-carpeta.ts';

/**
 * {"Factura": 1, "OC": 2} → «Factura 1 · OC 2», in the legajo's order. `swiftAsPayment`: a national
 * OC's SWIFT is its «Pago de OC» (the legajo screens say so; the DETALLE tab keeps «SWIFT»).
 */
export function documentsText(docs: Record<string, number> | null, swiftAsPayment: boolean): string {
    if (!docs) return '';
    const order = DOCUMENTOS.map((d) => d.nombre);
    const rank = (k: string) => (order.indexOf(k) < 0 ? 99 : order.indexOf(k));
    return Object.entries(docs)
        .sort((a, z) => rank(a[0]) - rank(z[0]))
        .map(([k, n]) => `${swiftAsPayment && k === 'SWIFT' ? 'Pago de OC' : k} ${n}`)
        .join(' · ');
}

/** Where the OC's cost centre came from, in words (the old texto_cc_segun). */
export function costCentreSource(segun: string | null, isImport: boolean): string | null {
    switch (segun) {
        case 'CG':
            return 'Control de Gestión';
        case 'CUADRO':
        case 'LEGAJO':
            return 'Cuadro de aprobaciones';
        case 'PROYECTO':
            return isImport ? 'Su carpeta de proyecto (las demás OC, según el cuadro)' : 'Su carpeta de proyecto (las demás OC, según CG)';
        case 'NOMBRE':
            return 'Nombre de la carpeta del proyecto';
        case 'ADMINISTRATIVO':
            return 'Carpeta administrativa (área general)';
        case 'MANUAL':
            return 'Corregido a mano';
        case 'SIN_ASIGNAR':
            return 'Sin asignar';
        default:
            return null;
    }
}
