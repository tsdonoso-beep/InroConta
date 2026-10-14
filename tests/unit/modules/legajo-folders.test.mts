// Legajo por OC (src/modules/legajo/domain/policies/folders.ts): the rules of pintarLegajo() and
// detalleCarpeta() of the Apps Script view, on small hand-made folders.
import { describe, expect, it } from 'vitest';
import type { Folder } from '../../../src/modules/legajo/domain/entities/Folder.ts';
import type { FolderDetail } from '../../../src/modules/legajo/domain/entities/FolderDetail.ts';
import {
    ALL_COMPANIES,
    DEFAULT_FOLDER_FILTERS,
    UNKNOWN_BUYER,
    companiesOf,
    effectiveCompany,
    folderList,
    legajoDocs,
    otherFiles,
    toUploadNames,
} from '../../../src/modules/legajo/domain/policies/folders.ts';

const folder = (p: Partial<Folder>): Folder => ({
    isImport: false,
    area: 'Compras nacionales',
    buyer: '',
    paymentStatus: '',
    paymentForm: '',
    oc: 'OC-1',
    supplier: '',
    project: '',
    folderName: '',
    folderId: '',
    status: 'INCOMPLETA',
    missing: '',
    documents: '',
    sunatInvoices: 0,
    costCenter: '',
    lastChange: '',
    lastChangeAt: '',
    loadedAt: '',
    statusDetail: '',
    toUpload: '',
    missingNowhere: '',
    buyerSource: '',
    ocDate: '',
    amountPen: null,
    warehouseEntry: '',
    comexStatus: '',
    plantArrival: '',
    sourceChanges: 0,
    company: 'INROPRIN',
    companySource: '',
    ...p,
});

const FOLDERS = [
    folder({ oc: 'OC-1', buyer: 'ANA', status: 'OK', sunatInvoices: 1 }),
    folder({ oc: 'OC-2', buyer: 'ANA', missing: 'Guía de remisión, Factura', missingNowhere: 'Factura', toUpload: 'Guía de remisión (Almacén: vale 9)' }),
    folder({ oc: 'OC-3', buyer: 'LUIS', isImport: true, status: 'VACÍA', supplier: 'Cámara SAC' }),
    folder({ oc: 'OC-4', company: 'CONSORCIO X', status: 'OK' }),
    folder({ oc: 'OC-5', status: 'INCOMPLETA' }),
];

describe('folderList', () => {
    it('starts on INROPRIN and incomplete folders', () => {
        const v = folderList(FOLDERS, DEFAULT_FOLDER_FILTERS);
        expect(v.list.map((x) => x.oc)).toEqual(['OC-2', 'OC-5']);
        expect(v.kpis.total).toBe(4);
        expect(v.kpis.complete).toBe(1);
        expect(v.kpis.toUpload).toMatchObject({ total: 1, guideInWarehouse: 1 });
        expect(v.kpis.missingNowhere).toMatchObject({ total: 1, invoice: 1, guide: 0 });
        expect(v.kpis.withoutSunatInvoice).toBe(3);
        expect(v.hidden).toBeNull();
    });

    it('filters by state SUBIR, area, unknown buyer and all companies', () => {
        expect(folderList(FOLDERS, { ...DEFAULT_FOLDER_FILTERS, state: 'SUBIR' }).list.map((x) => x.oc)).toEqual(['OC-2']);
        expect(folderList(FOLDERS, { ...DEFAULT_FOLDER_FILTERS, state: '', area: '1' }).list.map((x) => x.oc)).toEqual(['OC-3']);
        expect(folderList(FOLDERS, { ...DEFAULT_FOLDER_FILTERS, state: '', buyer: UNKNOWN_BUYER, company: ALL_COMPANIES }).list.map((x) => x.oc)).toEqual([
            'OC-4',
            'OC-5',
        ]);
    });

    it('tells what the search finds but the filter hides', () => {
        const v = folderList(FOLDERS, { ...DEFAULT_FOLDER_FILTERS, text: 'oc' });
        expect(v.list.map((x) => x.oc)).toEqual(['OC-2', 'OC-5']);
        expect(v.hidden).toEqual({
            count: 3,
            byKind: [
                ['completa', 1],
                ['vacía', 1],
                ['de otra empresa', 1],
            ],
            sample: ['OC-1', 'OC-3 COMEX', 'OC-4'],
            otherCompany: true,
        });
        expect(folderList(FOLDERS, { ...DEFAULT_FOLDER_FILTERS, text: 'camara' }).hidden?.sample).toEqual(['OC-3 COMEX']);
    });

    it('ranks buyers by share complete, «por identificar» last', () => {
        const r = folderList(FOLDERS, DEFAULT_FOLDER_FILTERS).ranking;
        expect(r.map((x) => [x.buyer, x.pct, x.complete, x.count])).toEqual([
            ['ANA', 50, 1, 2],
            ['LUIS', 0, 0, 1],
            [UNKNOWN_BUYER, 0, 0, 1],
        ]);
    });

    it('lists the companies INROPRIN first and falls back to all of them', () => {
        expect(companiesOf(FOLDERS)).toEqual([
            { company: 'INROPRIN', count: 4 },
            { company: 'CONSORCIO X', count: 1 },
        ]);
        expect(effectiveCompany([folder({ company: 'CONSORCIO X' })], 'INROPRIN')).toBe(ALL_COMPANIES);
    });

    it('names what is to upload', () => {
        expect(toUploadNames('Guía de remisión (Almacén: v 1) | DAM (COMEX: x)')).toBe('Guía de remisión, DAM');
    });
});

const detail = (p: Partial<FolderDetail> & { procedencia?: string; le_falta?: string }): FolderDetail => ({
    carpeta: {
        oc: 'OC-1',
        tipo: 'OC',
        procedencia: p.procedencia ?? 'Nacional',
        proveedor: null,
        proyecto: null,
        nombre: '',
        url: '',
        estado: 'INCOMPLETA',
        le_falta: p.le_falta ?? null,
        documentos: null,
        cc_codigo: null,
        cc_nombre: null,
        cc_segun: null,
        leida: null,
    },
    archivos: p.archivos ?? [],
    legajo: null,
    facturas: p.facturas ?? [],
    cambios: [],
    otras: [],
    fuentes: p.fuentes ?? null,
});

const file = (nombre: string, docs: string[], parece: string | null = null) => ({ nombre, url: `u/${nombre}`, parece, serie: null, docs });

describe('legajoDocs', () => {
    it('marks each of the 12 documents of a national folder', () => {
        const d = detail({
            le_falta: 'Guía de remisión, Acta de conformidad, Factura',
            archivos: [file('oc.pdf', ['OC']), file('pago.pdf', [], 'PAGO BCP'), file('foto.jpg', [])],
            facturas: [{ comprobante: 'F001-1', ruc: '20', tipo: 'F', fuente: null, archivo: null, archivo_url: null }],
            fuentes: {
                compras: null,
                comex: null,
                almacen: [],
                por_subir: [{ doc: 'GUIA', evidencia: 'Almacén: vale 9', enlace: null }],
                cambios: [],
                copia: null,
            },
        });
        const m = Object.fromEntries(legajoDocs(d).map((x) => [x.key, x.mark]));
        expect(m).toEqual({
            FACTURA: 'p',
            OC: 's',
            SWIFT: 's',
            GUIA: 'p',
            DAM: 'x',
            COSTEO: 'x',
            REQ: 'o',
            CONTRATO: 'o',
            COTIZACION: 'o',
            PROFORMA: 'o',
            CORREO: 'o',
            ACTA: 'n',
        });
        expect(legajoDocs(d).find((x) => x.key === 'SWIFT')?.label).toBe('Pago de OC (N.º de operación)');
        expect(legajoDocs(d).find((x) => x.key === 'FACTURA')?.evidence?.evidencia).toBe('SUNAT: F001-1');
        expect(otherFiles(d).map((a) => a.nombre)).toEqual(['foto.jpg']);
    });

    it('asks imports for SWIFT, DAM and costing', () => {
        const d = detail({ procedencia: 'Importación', le_falta: 'SWIFT, DAM' });
        const m = Object.fromEntries(legajoDocs(d).map((x) => [x.key, x.mark]));
        expect([m.SWIFT, m.DAM, m.COSTEO]).toEqual(['n', 'n', 'o']);
    });
});
