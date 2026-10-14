// The folders, the invoices without OC and the changes from the base, each list in ONE call (the
// *_json functions, migration 058), each on its own so a screen only waits for its own.
import 'server-only';
import { err, ok, type Result } from 'neverthrow';
import type { SourceError } from '../../../shared/errors.ts';
import { rpc, select } from '../../../shared/supabase/rpc.ts';
import { nameCase, sentenceCase } from '../../../shared/text.ts';
import type { LegajoPort } from '../application/ports/LegajoPort.ts';
import {
    fileIdOf,
    folderIdOf,
    type ChangesRead,
    type Folder,
    type FolderChange,
    type FoldersRead,
    type NoOcInvoice,
    type NoOcRead,
    type SourceCopy,
} from '../domain/entities/Folder.ts';
import type { FolderDetail } from '../domain/entities/FolderDetail.ts';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));

const folder = (f: Row): Folder => ({
    isImport: f.procedencia === 'Importación',
    area: s(f.area_responsable),
    buyer: nameCase(s(f.comprador)),
    paymentStatus: sentenceCase(s(f.situacion_pago)),
    paymentForm: s(f.forma_pago),
    oc: s(f.oc),
    supplier: nameCase(s(f.proveedor)),
    project: s(f.proyecto_carpeta).trim(),
    folderName: s(f.carpeta_nombre),
    folderId: folderIdOf(s(f.carpeta_url)),
    status: s(f.estado),
    missing: s(f.le_falta),
    documents: s(f.documentos),
    sunatInvoices: Number(f.facturas_sunat_n) || 0,
    costCenter: nameCase(s(f.cc_nombre)),
    lastChange: s(f.ultimo_cambio),
    lastChangeAt: s(f.ultimo_cambio_fecha),
    loadedAt: s(f.cargado_en),
    statusDetail: s(f.estado_detalle),
    toUpload: s(f.por_subir),
    missingNowhere: s(f.falta_sin_rastro),
    buyerSource: s(f.comprador_segun),
    ocDate: s(f.fecha_oc),
    amountPen: n(f.monto_soles),
    warehouseEntry: s(f.ingreso_almacen),
    comexStatus: sentenceCase(s(f.estado_comex)),
    plantArrival: s(f.llegada_planta),
    sourceChanges: Number(f.cambios_fuentes) || 0,
    company: s(f.empresa) || 'INROPRIN',
    companySource: s(f.empresa_segun),
});

const noOc = (f: Row): NoOcInvoice => ({
    signal: s(f.senal),
    reason: s(f.razon),
    likelyArea: s(f.area_probable),
    likelyBuyer: nameCase(s(f.comprador_probable)),
    issuedOn: s(f.fecha_emision),
    ruc: s(f.proveedor_ruc),
    name: nameCase(s(f.proveedor_nombre)),
    number: `${s(f.serie)}-${s(f.numero)}`,
    currency: s(f.moneda) || 'PEN',
    total: Number(f.total) || 0,
    supplierOcs: s(f.ocs_del_proveedor),
    pdf: fileIdOf(s(f.enlace_pdf)),
});

const change = (f: Row): FolderChange => ({
    at: s(f.fecha),
    isImport: f.procedencia === 'Importación',
    oc: s(f.oc),
    type: sentenceCase(s(f.tipo)),
    detail: s(f.detalle),
    folderId: folderIdOf(s(f.carpeta_url)),
});

const now = () => new Date().toISOString();

export class SupabaseLegajoAdapter implements LegajoPort {
    async readFolders(companyRuc: string): Promise<Result<FoldersRead, SourceError>> {
        const [folders, copies] = await Promise.all([
            rpc<Row[]>('carpetas_madre_fuentes_json', { p_empresa_ruc: companyRuc }),
            // Optional: without it, the screen only loses the «read on» note.
            select<SourceCopy>('fuente_copia', (c) =>
                c.from('fuente_copia').select('pestana,filas,fin,resultado,leido_en').eq('empresa_ruc', companyRuc).order('pestana'),
            ),
        ]);
        if (folders.isErr()) return err(folders.error);
        return ok({ folders: (folders.value ?? []).map(folder), copies: copies.unwrapOr([]), readAt: now() });
    }

    async readNoOc(companyRuc: string): Promise<Result<NoOcRead, SourceError>> {
        const r = await rpc<Row[]>('facturas_sin_oc_json', { p_empresa_ruc: companyRuc });
        return r.map((rows) => ({ noOc: (rows ?? []).map(noOc), readAt: now() }));
    }

    async readChanges(companyRuc: string): Promise<Result<ChangesRead, SourceError>> {
        const r = await select<Row>('carpeta_cambio', (c) =>
            c
                .from('carpeta_cambio')
                .select('fecha,procedencia,oc,tipo,detalle,carpeta_url')
                .eq('empresa_ruc', companyRuc)
                .order('fecha', { ascending: false })
                .order('id', { ascending: false })
                .limit(500),
        );
        return r.map((rows) => ({ changes: rows.map(change), readAt: now() }));
    }

    readFolder(companyRuc: string, folderId: string): Promise<Result<FolderDetail | null, SourceError>> {
        return rpc<FolderDetail | null>('detalle_de_carpeta', { p_carpeta: folderId, p_empresa_ruc: companyRuc });
    }
}
