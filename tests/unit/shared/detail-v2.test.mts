// The DETALLE lines built from the v2 rows (src/shared/lib/export/detail-v2.ts): one line per
// item, ONE line for a document without XML, and the columns the old SQL chain computed.
import { describe, expect, it } from 'vitest';
import { detailLinesFromV2 } from '../../../src/shared/lib/export/detail-v2.ts';
import type { DetailSource, Row } from '../../../src/shared/lib/export/detail-v2-read.ts';
import { detractionIssue } from '../../../src/shared/lib/export/detraction-codes.ts';

const doc = (id: string, extra: Row = {}): Row => ({
    id,
    origen: 'RECIBIDO',
    emisor_ruc: '20100000001',
    tipo: '01',
    serie: 'F001',
    numero: id,
    fecha_emision: '2026-08-14',
    periodo: 202608,
    moneda: 'PEN',
    subtotal: 1000,
    igv: 180,
    total: 1180,
    emisor: { razon_social: 'TONER PERU SAC' },
    xml_drive_id: `x${id}`,
    pdf_drive_id: `p${id}`,
    ...extra,
});
const source = (s: Partial<DetailSource>): DetailSource => ({
    docs: [],
    items: [],
    sire: [],
    links: [],
    orders: [],
    folders: [],
    proofs: [],
    withholdings: [],
    ...s,
});

describe('detailLinesFromV2', () => {
    it('gives one line per item, and one line without item to a document without XML', () => {
        const lines = detailLinesFromV2(
            source({
                docs: [doc('1'), doc('2', { total: null, subtotal: null, igv: null, xml_drive_id: null })],
                items: [
                    { comprobante_id: '1', linea: 1, descripcion: 'A' },
                    { comprobante_id: '1', linea: 2, descripcion: 'B' },
                ],
                sire: [{ comprobante_id: '2', total: 590, base_dg: 500, igv_dg: 90, ultima_vez: '2026-09-01' }],
            }),
        );
        expect(lines.map((l) => [l.numero, l.linea])).toEqual([
            ['1', 1],
            ['1', 2],
            ['2', null],
        ]);
        const sireOnly = lines[2];
        expect([sireOnly.totalComprobante, sireOnly.baseGravada, sireOnly.igvComprobante, sireOnly.noGravado, sireOnly.desgloseSegun]).toEqual([
            590,
            500,
            90,
            0,
            'SIRE',
        ]);
        expect(sireOnly.enlaceXml).toBeNull();
    });

    it('splits the tax by the SIRE if it declared it, by the XML at 18 % if not', () => {
        const [line] = detailLinesFromV2(source({ docs: [doc('3', { subtotal: 1200, igv: 180 })] }));
        expect([line.baseGravada, line.noGravado, line.desgloseSegun]).toEqual([1000, 200, 'XML (IGV al 18%)']);
    });

    it('takes the latest SIRE reading, and the dollar rate to soles', () => {
        const lines = detailLinesFromV2(
            source({
                docs: [doc('4', { moneda: 'USD', total: 100, tipo_cambio: 3.7 })],
                sire: [
                    { comprobante_id: '4', total: 100, tipo_cambio: 3.75, ultima_vez: '2026-08-20' },
                    { comprobante_id: '4', total: 100, tipo_cambio: 3.8, ultima_vez: '2026-09-20' },
                ],
            }),
        );
        expect([lines[0].tipoCambio, lines[0].totalSoles]).toEqual([3.8, 380]);
    });

    it('says whether the detraction has its proof and whether the amount matches', () => {
        const withDet = { detraccion_monto: 142, detraccion_porcentaje: 12, detraccion_codigo: '037' };
        const lines = detailLinesFromV2(
            source({
                docs: [doc('5', withDet), doc('6', withDet), doc('7', withDet)],
                proofs: [
                    { comprobante_id: '5', numero_constancia: 'A', fecha_pago: '2026-08-20', monto: 142 },
                    { comprobante_id: '6', numero_constancia: 'B', fecha_pago: '2026-08-20', monto: 100 },
                ],
            }),
        );
        expect(lines.map((l) => l.detraccionConstanciaEstado)).toEqual(['Con constancia', 'Revisar monto', 'Falta constancia']);
    });

    it('lists the withholdings of a purchase and warns when it also has a detraction', () => {
        const cre = (estado: string) => ({ serie: 'E001', numero: 3237, estado, sentido: 'COMPRA', pdf_drive_id: 'pdf' });
        const [line] = detailLinesFromV2(
            source({
                docs: [doc('8', { detraccion_monto: 50 })],
                withholdings: [{ comprobante_id: '8', fecha_pago: '2026-09-01', monto_retenido: 34.69, retencion: cre('EMITIDO') }],
            }),
        );
        expect([line.retencionComprobante, line.retencionMonto, line.retencionEstado]).toEqual([
            'E001-3237',
            34.69,
            'Emitido · revisar: también tiene detracción',
        ]);
    });

    it('joins the OC data of the document, with its folder', () => {
        const [line] = detailLinesFromV2(
            source({
                docs: [doc('9')],
                links: [{ comprobante_id: '9', orden_compra_id: 'o1', archivo: { drive_id: 'f1', nombre: 'F001-9.pdf', carpeta_id: 'k1' } }],
                orders: [
                    {
                        id: 'o1',
                        codigo: '0200-2026',
                        procedencia: 'NACIONAL',
                        centro_costo_segun: 'CG',
                        legajo_en: null,
                        centro_costo: { codigo: 'PROY-2024- 032', nombre: 'KITS', es_area: false },
                    },
                ],
                folders: [
                    {
                        drive_id: 'k1',
                        orden_compra_id: 'o1',
                        proyecto_carpeta: 'TALLERES',
                        documentos: { Factura: 1, OC: 1 },
                        estado: 'INCOMPLETA',
                        le_falta: ['Guía de remisión'],
                    },
                ],
            }),
        );
        expect([line.ocCarpeta, line.centroCostoCg, line.centroCostoSegun, line.legajoOc, line.proyectoOc, line.documentosOc]).toEqual([
            '0200-2026',
            'PROY-2024-032 KITS',
            'Control de Gestión',
            'Falta: Guía de remisión',
            'TALLERES',
            'Factura 1 · OC 1',
        ]);
        expect(line.carpetaOcUrl).toBe('https://drive.google.com/drive/folders/k1');
    });
});

describe('detractionIssue', () => {
    it('checks the rate against the code of the good or service', () => {
        expect(detractionIssue(0, '037')).toBe('');
        expect(detractionIssue(12, '')).toBe('Tiene detracción sin código de bien o servicio');
        expect(detractionIssue(12, '37')).toBe('');
        expect(detractionIssue(10, '037')).toBe('Se aplicó 10% y el código 037 (Demás servicios gravados con el IGV) lleva 12%');
        expect(detractionIssue(4, '035')).toBe('Se aplicó 4% y el código 035 (Bienes exonerados del IGV) lleva 1.5%');
    });
});
