// The full Consulta RUC ficha. INROPRIN's page is the real one SUNAT returned on 13/10/2026;
// the natural person and the deregistered RUC are built with the same markup (h4 label +
// value), with the label sequences seen on real pages that day.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { leerResultadoConsultaRuc } from '../../../src/shared/lib/sunat/consulta-ruc.ts';
import { isoDate, readActivities } from '../../../src/shared/lib/sunat/ruc-ficha.ts';

const INROPRIN = readFileSync(join(import.meta.dirname, '../../fixtures/sunat/consulta-ruc-20512201611.html'), 'utf8');

const item = (label: string, ...values: string[]) =>
    `<div class="list-group-item"><h4 class="list-group-item-heading">${label}</h4>${values.map((v) => `<p class="list-group-item-text">${v}</p>`).join('')}</div>`;

const NOTICE =
    '<p><strong>IMPORTANTE:</strong> Los comprobantes de pago no dan derecho a crédito fiscal del IGV, en tanto se encuentra con estado de <strong>BAJA DE OFICIO</strong></p>';

const synthetic = (deregistered: boolean) =>
    [
        deregistered ? NOTICE : '',
        item('Número de RUC:', '10123456789 - PEREZ QUISPE JUAN'),
        item('Tipo Contribuyente:', 'PERSONA NATURAL CON NEGOCIO'),
        item('Tipo de Documento:', 'DNI 12345678', '- PEREZ QUISPE, JUAN'),
        item('Nombre Comercial:', '-'),
        item('Fecha de Inscripción:', '20/07/2022'),
        item('Fecha de Inicio de Actividades:', '01/07/2022'),
        item('Estado del Contribuyente:', deregistered ? 'BAJA DE OFICIO' : 'ACTIVO'),
        deregistered ? item('Fecha de Baja:', '13/07/2026') : '',
        item('Condición del Contribuyente:', 'HABIDO'),
        item('Domicilio Fiscal:', '-'),
        item('Actividad(es) Económica(s):', 'Principal - 9609 - OTRAS ACTIVIDADES DE SERVICIOS PERSONALES N.C.P.'),
        item('Comprobantes de Pago c/aut. de impresión (F. 806 u 816):', 'NINGUNO'),
        item('Sistema de Emisión Electrónica:', 'FACTURA PORTAL DESDE 23/01/2026', 'RECIBOS POR HONORARIOS AFILIADO DESDE 21/07/2022'),
        item('Afiliado al PLE desde:', '-'),
        item('Padrones:', '<table><tr><td>NINGUNO</td></tr></table>'),
        deregistered ? NOTICE : '',
        '<!-- <div>' + item('Razón Social:', 'eeee') + '</div> -->',
        item('Fecha consulta:', '13/10/2026 8:52'),
    ].join('\n');

describe('the full ficha', () => {
    it('reads every field of INROPRIN from the real page', () => {
        const r = leerResultadoConsultaRuc(INROPRIN, '20512201611');
        expect(r).toMatchObject({ estado: 'ACTIVO', condicion: 'HABIDO', agenteRetencion: true });
        expect(r.padronesTexto).toBe('Incorporado al Régimen de Agentes de Retención de IGV (R.S.217-2010) a partir del 01/09/2010');
        expect(r.ficha).toEqual({
            taxpayerType: 'SOCIEDAD ANONIMA CERRADA',
            document: null,
            tradeName: 'INROPRIN S.A.C..',
            registeredOn: '2005-12-21',
            activitiesStartOn: '2005-12-14',
            deregisteredOn: null,
            fiscalAddress: 'JR. CUZCO NRO. 343 LIMA - LIMA - MAGDALENA DEL MAR',
            issuingSystem: 'MANUAL',
            foreignTrade: 'SIN ACTIVIDAD',
            accountingSystem: 'COMPUTARIZADO',
            activities: [
                { kind: 'Principal', code: '4652', description: 'VENTA AL POR MAYOR DE EQUIPO, PARTES Y PIEZAS ELECTRÓNICOS Y DE TELECOMUNICACIONES' },
                { kind: 'Secundaria 1', code: '3240', description: 'FABRICACIÓN DE JUEGOS Y JUGUETES' },
                { kind: 'Secundaria 2', code: '7020', description: 'ACTIVIDADES DE CONSULTORÍA DE GESTIÓN' },
            ],
            printedReceipts: ['FACTURA', 'BOLETA DE VENTA', 'NOTA DE CREDITO', 'NOTA DE DEBITO', 'GUIA DE REMISION - REMITENTE', 'COMPROBANTE DE RETENCION'],
            electronicIssuing: ['FACTURA PORTAL DESDE 05/08/2016', 'BOLETA PORTAL DESDE 31/10/2017'],
            electronicIssuerSince: '2016-08-05',
            electronicReceipts: 'FACTURA (desde 05/08/2016),BOLETA (desde 31/10/2017)',
            pleSince: '2014-01-01',
            notice: null,
        });
    });

    it('keeps the document of a natural person without the name, and turns «-» and NINGUNO into nothing', () => {
        const f = leerResultadoConsultaRuc(synthetic(false), '10123456789').ficha!;
        expect(f.document).toBe('DNI 12345678');
        expect(f.tradeName).toBeNull();
        expect(f.fiscalAddress).toBeNull();
        expect(f.pleSince).toBeNull();
        expect(f.printedReceipts).toEqual([]);
        expect(f.electronicIssuing).toEqual(['FACTURA PORTAL DESDE 23/01/2026', 'RECIBOS POR HONORARIOS AFILIADO DESDE 21/07/2022']);
    });

    it('keeps the deregistration date out of the state and the notice out of the padrones', () => {
        const r = leerResultadoConsultaRuc(synthetic(true), '10123456789');
        expect(r.estado).toBe('BAJA DE OFICIO');
        expect(r.padronesTexto).toBeNull();
        expect(r.ficha!.deregisteredOn).toBe('2026-07-13');
        expect(r.ficha!.notice).toMatch(/^Los comprobantes de pago no dan derecho a crédito fiscal del IGV/);
    });

    it('has no ficha when the page could not be read', () => {
        expect(leerResultadoConsultaRuc('<html>Error</html>', '20512201611').ficha).toBeNull();
    });
});

describe('ficha pieces', () => {
    it('reads dd/mm/yyyy as ISO and anything else as null', () => {
        expect(isoDate(['05/08/2016'])).toBe('2016-08-05');
        expect(isoDate(['-'])).toBeNull();
        expect(isoDate([])).toBeNull();
    });

    it('skips an activity line it does not understand instead of guessing', () => {
        expect(readActivities(['Principal - 4652 - VENTA', 'texto suelto', 'NINGUNO'])).toEqual([{ kind: 'Principal', code: '4652', description: 'VENTA' }]);
    });
});
