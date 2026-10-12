// The Consulta RUC result: what «Padrones:» says about withholding agents and good taxpayers.
// The texts are the ones SUNAT returned (stored in padron_ruc.padrones_detalle).
import { describe, expect, it } from 'vitest';
import { leerPadrones, leerResultadoConsultaRuc } from '../../../src/shared/lib/sunat/consulta-ruc.ts';

const NONE = { buenContribuyente: false, agenteRetencion: false, agentePercepcion: false };

const page = (padrones: string) => `
  <table>
    <tr><td>Número de RUC:</td><td>20512201611 - INDUSTRIAS ROLAND PRINT S.A.C - INROPRIN S.A.C</td></tr>
    <tr><td>Estado del Contribuyente:</td><td>ACTIVO</td></tr>
    <tr><td>Condición del Contribuyente:</td><td>HABIDO</td></tr>
    <tr><td>Padrones:</td><td>${padrones}</td></tr>
    <tr><td>Razón Social:</td><td>eeee --></td></tr>
    <tr><td>Fecha consulta:</td><td>09/10/2026</td></tr>
  </table>`;

describe('leerPadrones', () => {
    it('marks the withholding agent: SUNAT writes «Agentes», in the plural (INROPRIN, since 2010)', () => {
        expect(leerPadrones('Incorporado al Régimen de Agentes de Retención de IGV (R.S.217-2010) a partir del 01/09/2010')).toEqual({
            ...NONE,
            agenteRetencion: true,
        });
    });

    it('marks the good taxpayer and the perception agent', () => {
        expect(leerPadrones('Incorporado al Régimen de Buenos Contribuyentes (Resolución N° 0230050017730) a partir del 01/05/2021')).toEqual({
            ...NONE,
            buenContribuyente: true,
        });
        expect(leerPadrones('Incorporado al Régimen de Agentes de Percepción de IGV - Venta Interna (D.S.091-2013) a partir del 01/01/2014')).toEqual({
            ...NONE,
            agentePercepcion: true,
        });
    });

    it('marks nothing for NINGUNO, empty or missing text', () => {
        expect(leerPadrones('NINGUNO')).toEqual(NONE);
        expect(leerPadrones('')).toEqual(NONE);
        expect(leerPadrones(null)).toEqual(NONE);
    });

    it('does not mark a regime the RUC was excluded from', () => {
        expect(leerPadrones('Excluido del Régimen de Agentes de Retención de IGV a partir del 01/03/2019')).toEqual(NONE);
        expect(leerPadrones('Excluido del Régimen de Agentes de Percepción de IGV - Venta Interna a partir del 01/03/2019')).toEqual(NONE);
    });

    it('counts the latest line of each regime, in either order', () => {
        const in2010 = 'Incorporado al Régimen de Agentes de Retención de IGV (R.S.217-2010) a partir del 01/09/2010';
        const out2019 = 'Excluido del Régimen de Agentes de Retención de IGV a partir del 01/03/2019';
        expect(leerPadrones(`${in2010} ${out2019}`).agenteRetencion).toBe(false);
        expect(leerPadrones(`${out2019} ${in2010}`).agenteRetencion).toBe(false);
        const back2022 = 'Incorporado al Régimen de Agentes de Retención de IGV (R.S.100-2022) a partir del 01/01/2022';
        expect(leerPadrones(`${in2010} ${out2019} ${back2022}`).agenteRetencion).toBe(true);
        expect(leerPadrones(`${back2022} ${out2019} ${in2010}`).agenteRetencion).toBe(true);
    });

    it('keeps each regime apart: good taxpayer and excluded from withholding', () => {
        const text =
            'Incorporado al Régimen de Buenos Contribuyentes (Resolución N° 1) a partir del 01/05/2021 ' +
            'Excluido del Régimen de Agentes de Retención de IGV a partir del 01/03/2019';
        expect(leerPadrones(text)).toEqual({ ...NONE, buenContribuyente: true });
    });

    it('is not fooled by an exclusion of another regime of the same kind', () => {
        const text =
            'Incorporado al Régimen de Agentes de Percepción de IGV - Venta Interna (D.S.091-2013) a partir del 01/01/2014 ' +
            'Excluido del Régimen de Agentes de Percepción de IGV - Combustibles a partir del 01/01/2020';
        expect(leerPadrones(text).agentePercepcion).toBe(true);
    });
});

describe('leerResultadoConsultaRuc', () => {
    it('reads INROPRIN: withholding agent, not a good taxpayer, and the text without the stray «Razón Social»', () => {
        const r = leerResultadoConsultaRuc(page('Incorporado al Régimen de Agentes de Retención de IGV (R.S.217-2010) a partir del 01/09/2010'), '20512201611');
        expect(r).toMatchObject({
            encontrado: true,
            estado: 'ACTIVO',
            condicion: 'HABIDO',
            buenContribuyente: false,
            agenteRetencion: true,
            agentePercepcion: false,
            padronesTexto: 'Incorporado al Régimen de Agentes de Retención de IGV (R.S.217-2010) a partir del 01/09/2010',
        });
    });

    it('leaves padronesTexto empty for NINGUNO', () => {
        expect(leerResultadoConsultaRuc(page('NINGUNO'), '20512201611')).toMatchObject({ ...NONE, padronesTexto: null });
    });

    it('says not found when the page has neither the RUC nor the status', () => {
        expect(leerResultadoConsultaRuc('<html>Error</html>', '20512201611').encontrado).toBe(false);
    });
});
