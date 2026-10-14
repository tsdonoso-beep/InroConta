// The withholding certificates (scripts/local/retenciones): reading the JSON the detail page carries in
// its script, and the row for guardar_retenciones (migration 070). The HTML is a cut of the real one
// (14/10/2026, CRE E001-2764), without e-mails.
import { describe, expect, it } from 'vitest';
import { jsonDeScript, type CreDetalle, type CreLista } from '../../../scripts/local/retenciones/sol.mts';
import { claveCre, estadoDe, fechaLima, nombreBase, registro, rutaDrive } from '../../../scripts/local/retenciones/registro.mts';

const HTML = `
\t\t\tvar objRetencion = null;
\t\t\tobjRetencion = {"numRuc":"20512201611","codCpe":"20","numSerieCpe":"E001","numCpe":2764,"codTipoDocRecep":"6 ","numDocRecep":"20612437492","descNombreRecep":"GRUPO GOLDENPLAST E.I.R.L.","fechaEmision":1767675600000,"codRegimenRet":"01","descObservacion":" ","montoTotalRetenido":82.50,"montoTotalPagado":2667.50,"codEstadoCpe":"01","numTicket":2026008073504000001,"descTipoRegimenRet":"TASA 3%","descEstadoCpe":"EMITIDO","numPeriodo":"202601","montoBaseCalculo":2750.00};
\t\t\tlstTipoComp = [{"codigo":"00","descripcionCorta":"OTROS"}];
\t\t\tlstDocumentosRelacionados = [{"numRuc":"20512201611","numSerieCpe":"E001","numCpe":2764,"codTipoCpeRel":"01","numSerieCpeRel":"E001","numCpeRel":"1227","fechaEmisionCpeRel":1767070800000,"montoTotalCpeRel":2750.00,"codMonedaCpeRel":"PEN","fechaPago":1767675600000,"numPago":"1","montoPago":2750.00,"codMonedaPago":"PEN","montoRetenido":82.50,"fechaRetencion":1767675600000,"montoPagado":2667.50,"montoTipoCambio":1.000000}];
`;

const LISTA: CreLista = {
    numRuc: '20512201611',
    codCpe: '20',
    numSerieCpe: 'E001',
    numCpe: 2764,
    numDocRecep: '20612437492',
    fechaEmision: 1767675600000,
    codRegimenRet: '01',
    montoTotalRetenido: 82.5,
    codEstadoCpe: '01',
};

describe('the detail page', () => {
    it('gives the CRE and the invoices it covers from its script', () => {
        const cre = jsonDeScript(HTML, 'objRetencion') as Record<string, unknown>;
        const docs = jsonDeScript(HTML, 'lstDocumentosRelacionados') as Record<string, unknown>[];
        expect(cre.numCpe).toBe(2764);
        expect(docs).toHaveLength(1);
        expect(docs[0].numCpeRel).toBe('1227');
        expect(jsonDeScript('var objRetencion = null;\n', 'objRetencion')).toBeNull();
    });
});

describe('the row for the base', () => {
    it('turns SUNAT dates (Lima midnight) into Lima days and keeps every invoice', () => {
        const d: CreDetalle = {
            cre: jsonDeScript(HTML, 'objRetencion') as Record<string, unknown>,
            documentos: jsonDeScript(HTML, 'lstDocumentosRelacionados') as Record<string, unknown>[],
        };
        const r = registro(LISTA, d, '20512201611', { pdf: 'p', xml: 'x' });
        expect(r).toMatchObject({
            sentido: 'COMPRA',
            serie: 'E001',
            numero: 2764,
            fechaEmision: '2026-01-06',
            receptorRuc: '20612437492',
            montoRetenido: 82.5,
            montoPagado: 2667.5,
            estado: 'EMITIDO',
            periodo: '202601',
        });
        expect(r.documentos[0]).toMatchObject({
            tipoComprobante: '01',
            serie: 'E001',
            numero: '1227',
            fechaEmision: '2025-12-30',
            fechaPago: '2026-01-06',
            montoRetenido: 82.5,
        });
    });

    it('names and files a CRE, and tells a reverted one', () => {
        expect(nombreBase(LISTA)).toBe('20512201611-20-E001-00002764');
        expect(rutaDrive('COMPRA', '2026-01-06')).toEqual(['Retenciones', 'Compras', '2026-01']);
        expect(estadoDe('02')).toBe('REVERTIDO');
        expect(estadoDe('01')).toBe('EMITIDO');
        expect(fechaLima(undefined)).toBeNull();
        expect(claveCre('20512201611', 'e001', '2764')).toBe('20512201611|E001|2764');
    });
});
