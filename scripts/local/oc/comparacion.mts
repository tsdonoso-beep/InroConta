// What another source knows of each OC, to compare the parent folder with it in the run's summary:
// for nationals, the base de CG and the links the retired capture followed; for imports, the
// approvals table (legajo) and the files its walk saw. Read from v2.

import { esComprobante } from '../../../src/shared/lib/drive/carpetas-oc.ts';
import { allRows, type Base } from './base.mts';
import { cgLines } from './carpetas.mts';
import type { Row } from './estado.mts';

/** If the source has the OC, which folders it links and how many invoices it saw there. */
export type Fuente = {
    nombre: string;
    corto: string;
    archivo: string;
    listado: Set<string>;
    enlaces: Map<string, Set<string>>;
    comprobantes: Map<string, number>;
};

const folderOf = (url: unknown) => /\/folders\/([\w-]{10,})/.exec(String(url ?? ''))?.[1] ?? '';
/** «115-2026» → «0115-2026», as CG writes it; empty if it is not an OC. */
const oc4 = (t: string) => {
    const m = /(\d{1,5})\s*-\s*(20\d\d)/.exec(t ?? '');
    return m ? `${m[1].padStart(4, '0')}-${m[2]}` : '';
};

function note(f: Fuente, oc: string, folderId: string, parece?: string) {
    if (folderId) f.enlaces.set(oc, (f.enlaces.get(oc) ?? new Set()).add(folderId));
    if (parece !== undefined && esComprobante(parece)) f.comprobantes.set(oc, (f.comprobantes.get(oc) ?? 0) + 1);
}

/** Nationals: the OCs in CG, and what the capture found following CG's links (archivo.origenes). */
export async function cgSource(sb: Base, companyRuc: string): Promise<Fuente> {
    const f: Fuente = {
        nombre: 'Frente a Control de Gestión',
        corto: 'CG',
        archivo: 'comparacion-cg.csv',
        listado: new Set((await cgLines(sb, companyRuc)).filter((r) => r.procedencia === 'NACIONAL').map((r) => r.oc)),
        enlaces: new Map(),
        comprobantes: new Map(),
    };
    const seen = await allRows<Row>(sb, 'archivo', 'drive_id,origenes', ['drive_id'], (q) => q.not('visto_captura_en', 'is', null));
    for (const a of seen)
        for (const s of (Array.isArray(a.origenes) ? a.origenes : []) as Row[])
            if (s.origen === 'CAPTURA')
                for (const o of String(s.oc ?? '')
                    .split(' / ')
                    .map(oc4)
                    .filter(Boolean))
                    note(f, o, folderOf(s.carpeta_url), s.parece ?? '');
    return f;
}

/** Imports: the approvals table as the legajo walk left it (the OC already with 3 digits). */
export async function approvalsSource(sb: Base, companyRuc: string): Promise<Fuente> {
    const f: Fuente = {
        nombre: 'Frente al cuadro de aprobaciones (legajo)',
        corto: 'cuadro',
        archivo: 'comparacion-cuadro.csv',
        listado: new Set(),
        enlaces: new Map(),
        comprobantes: new Map(),
    };
    const orders = await allRows<Row>(sb, 'orden_compra', 'id,codigo', ['id'], (q) =>
        q.eq('empresa_ruc', companyRuc).eq('procedencia', 'IMPORTACION').not('legajo_en', 'is', null),
    );
    const code = new Map(orders.map((o) => [o.id as string, o.codigo as string]));
    for (const o of orders) f.listado.add(o.codigo);
    for (const l of await allRows<Row>(sb, 'orden_compra_legajo', 'orden_compra_id,carpeta_id', ['orden_compra_id', 'carpeta_id']))
        if (code.has(l.orden_compra_id)) note(f, code.get(l.orden_compra_id)!, l.carpeta_id);
    const folders = await allRows<Row>(sb, 'carpeta_oc', 'drive_id,orden_compra_id', ['drive_id'], (q) =>
        q.eq('empresa_ruc', companyRuc).not('visto_legajo_en', 'is', null),
    );
    const ocOf = new Map(folders.map((c) => [c.drive_id as string, code.get(c.orden_compra_id)]));
    for (const c of folders) if (ocOf.get(c.drive_id)) note(f, ocOf.get(c.drive_id)!, c.drive_id);
    const files = await allRows<Row>(sb, 'archivo', 'drive_id,carpeta_id,parece', ['drive_id'], (q) => q.not('visto_legajo_en', 'is', null));
    for (const a of files) {
        const oc = ocOf.get(a.carpeta_id);
        if (oc && esComprobante(a.parece ?? '')) f.comprobantes.set(oc, (f.comprobantes.get(oc) ?? 0) + 1);
    }
    return f;
}
