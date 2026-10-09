// The SSCO tab: what `pnpm ssco:load` writes (sscoTabRows) is what the view reads
// (sscoVista_ in VistaEjecutiva.gs). A header renamed on one side breaks here.
import { describe, expect, it } from 'vitest';
import { callFromPage, loadAppsScript } from '../../helpers/apps-script.mts';
import { SSCO_TAB, sscoTabRows, type SscoRow } from '../../../src/shared/lib/sunat/ssco.ts';

const VIEW = ['apps-script/inroconta/VistaEjecutiva.gs'];
const ROW: SscoRow = {
    ruc: '20200000002',
    businessName: 'TRANSPORTES ANDINOS EIRL',
    taxAddress: 'JR. PUNO 466 - LIMA',
    resolution: 'Resolución de Intendencia N.º 024-024-0090000/SUNAT',
    resolutionDate: '2026-08-01',
    finalDate: '2026-08-20',
    publishedOn: '2026-08-31',
    representativeDocument: '10460556584',
    representativeName: 'QUISPE ROJAS ANA',
};

const readTab = (grid: string[][] | null) => {
    const scope = loadAppsScript(VIEW, { sheets: grid ? { [SSCO_TAB]: grid } : {} });
    return callFromPage(scope, 'sscoVista_');
};

describe('the SSCO tab', () => {
    it('round-trips: the view reads back what the loader writes, in the order the page expects', () => {
        expect(readTab(sscoTabRows([ROW]))).toEqual([
            [
                '20200000002',
                'TRANSPORTES ANDINOS EIRL',
                'Resolución de Intendencia N.º 024-024-0090000/SUNAT',
                '2026-08-01',
                '2026-08-20',
                '2026-08-31',
                'QUISPE ROJAS ANA',
            ],
        ]);
    });

    it('is null (list not loaded) when the tab is missing, empty or lacks a column', () => {
        expect(readTab(null)).toBeNull();
        expect(readTab(sscoTabRows([]))).toBeNull();
        const [header, ...rows] = sscoTabRows([ROW]);
        expect(readTab([header.map((h) => (h === 'Fecha en que quedó firme' ? 'Firme' : h)), ...rows])).toBeNull();
    });
});
