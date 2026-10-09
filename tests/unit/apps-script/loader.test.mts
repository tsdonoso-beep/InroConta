// The .gs loader (tests/helpers/apps-script.mts), checked with small helpers of
// the INROCONTA view that need no spreadsheet.
import { describe, expect, it } from 'vitest';
import { callFromPage, loadAppsScript } from '../../helpers/apps-script.mts';

const view = () => loadAppsScript(['apps-script/inroconta/VistaEjecutiva.gs']);

describe('loadAppsScript', () => {
    it('exposes the top-level functions of a .gs file', () => {
        expect(typeof view().doGet).toBe('function');
        expect(typeof view().datosCompactosVista_).toBe('function');
    });

    it('formats dates in Lima time like Utilities.formatDate', () => {
        expect(view().fechaTexto_(new Date('2026-10-01T03:00:00Z'))).toBe('30/09/2026');
        expect(view().fechaTexto_(' 05/10/2026 ')).toBe('05/10/2026');
    });

    it('fails loudly when the code touches a Google service that is not faked', () => {
        expect(() => view().doGet()).toThrow(/HtmlService is not defined/);
    });

    it('returns results as plain JSON, the way google.script.run delivers them', () => {
        const scope = loadAppsScript(['apps-script/inroconta/VistaEjecutiva.gs'], { sheets: {} });
        expect(callFromPage(scope, 'conSigno_', true, 118)).toBe(-118);
        expect(callFromPage(scope, 'conSigno_', false, null)).toBeNull();
    });
});

describe('helpers of the view', () => {
    it('takes the Drive id out of the two link shapes', () => {
        const id = 'abcdefghijklmnopqrstuvwxyz';
        expect(view().idDrive_(`https://drive.google.com/file/d/${id}/view`)).toBe(id);
        expect(view().idDrive_(`https://drive.google.com/open?id=${id}`)).toBe(id);
        expect(view().idDrive_('https://example.com/no-id')).toBe('');
    });
});
