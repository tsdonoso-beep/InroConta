import { describe, expect, it } from 'vitest';
import { highNoOcCount, incompleteCount, lastReadChanges } from '../../../src/modules/legajo/domain/policies/badges.ts';
import type { Folder, FolderChange, NoOcInvoice } from '../../../src/modules/legajo/domain/entities/Folder.ts';

const folder = (status: string, company = 'INROPRIN') => ({ status, company }) as Folder;
const change = (at: string) => ({ at }) as FolderChange;

describe('menu counts', () => {
    it('counts the incomplete folders of INROPRIN only', () => {
        expect(incompleteCount([folder('OK'), folder('INCOMPLETA'), folder('VACÍA'), folder('INCOMPLETA', 'CONSORCIO X')]).count).toBe(2);
    });
    it('counts the ALTA invoices', () => {
        expect(highNoOcCount([{ signal: 'ALTA' }, { signal: 'MEDIA' }, { signal: 'ALTA' }] as NoOcInvoice[]).count).toBe(2);
    });
    it('counts the changes within six hours of the newest one', () => {
        const rows = [change('2026-10-13T14:22:00Z'), change('2026-10-13T09:00:00Z'), change('2026-10-13T08:00:00Z'), change('2026-10-12T20:00:00Z')];
        expect(lastReadChanges(rows).count).toBe(2);
        expect(lastReadChanges([]).count).toBe(0);
    });
});
