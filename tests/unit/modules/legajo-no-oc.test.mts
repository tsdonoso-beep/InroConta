// The rules of «Facturas sin OC» and «Cambios del robot» (src/modules/legajo/domain/policies) against
// what pintarSinOc() and pintarCambios() of the Apps Script view did.
import { describe, expect, it } from 'vitest';
import type { FolderChange, NoOcInvoice } from '../../../src/modules/legajo/domain/entities/Folder.ts';
import { filterNoOc, NO_OC_DEFAULT, noOcKpis, supplierOcsShort } from '../../../src/modules/legajo/domain/policies/no-oc.ts';
import { changesByDay, changeTone, filterChanges, limaDayAndTime } from '../../../src/modules/legajo/domain/policies/changes.ts';

const inv = (o: Partial<NoOcInvoice>): NoOcInvoice => ({
    signal: 'ALTA',
    reason: '',
    likelyArea: 'Compras nacionales',
    likelyBuyer: '',
    issuedOn: '2026-09-01',
    ruc: '20100000001',
    name: 'Proveedor',
    number: 'F001-1',
    currency: 'PEN',
    total: 100,
    supplierOcs: '',
    pdf: '',
    ...o,
});

const rows = [
    inv({ total: 100 }),
    inv({ currency: 'USD', total: 10, ruc: '20100000002', name: 'Cámara Perú', likelyArea: 'COMEX (importaciones)' }),
    inv({ signal: 'MEDIA', total: 3000, likelyArea: '', likelyBuyer: 'Juan Pérez' }),
];

describe('facturas sin OC', () => {
    it('shows ALTA by default and filters by area, unknown area with «-»', () => {
        expect(filterNoOc(rows, NO_OC_DEFAULT)).toHaveLength(2);
        expect(filterNoOc(rows, { signal: '', area: '-', text: '', period: '' })).toEqual([rows[2]]);
        expect(filterNoOc(rows, { signal: 'ALTA', area: 'COMEX (importaciones)', text: '', period: '' })).toEqual([rows[1]]);
    });

    it('searches every word, without accents or case', () => {
        expect(filterNoOc(rows, { signal: '', area: '', text: 'camara peru', period: '' })).toEqual([rows[1]]);
        expect(filterNoOc(rows, { signal: '', area: '', text: 'perez', period: '' })).toEqual([rows[2]]);
        expect(filterNoOc(rows, { signal: '', area: '', text: 'camara x', period: '' })).toEqual([rows[1]]); // one letter does not count
    });

    it('counts the KPIs of the area in soles, dollars at 3.75', () => {
        const k = noOcKpis(rows, '');
        expect(k.high).toEqual({ count: 2, pen: 137.5 });
        expect(k.medium).toEqual({ count: 1, pen: 3000 });
        expect(k.suppliers).toBe(2);
        expect(noOcKpis(rows, '-').high.count).toBe(0);
    });

    it('cuts the supplier OCs at four', () => {
        expect(supplierOcsShort('1, 2, 3, 4, 5')).toBe('1, 2, 3, 4…');
        expect(supplierOcsShort('1, 2')).toBe('1, 2');
    });
});

const ch = (o: Partial<FolderChange>): FolderChange => ({ at: '', isImport: false, oc: 'OC-1', type: '', detail: '', folderId: '', ...o });

describe('cambios del robot', () => {
    const list = [
        ch({ at: '2026-10-13T03:00:00Z', type: 'LEGAJO COMPLETO', oc: 'OC-7' }),
        ch({ at: '2026-10-12T20:00:00Z', type: 'AHORA LE FALTA', isImport: true }),
        ch({ at: '2026-10-12T13:00:00Z', type: 'ARCHIVO YA NO ESTÁ', detail: 'guia.pdf' }),
    ];

    it('filters by kind, area and text', () => {
        expect(filterChanges(list, { kind: 'COMPL', area: '', text: '', period: '' })).toEqual([list[0]]);
        expect(filterChanges(list, { kind: 'ELIM', area: '', text: '', period: '' })).toEqual([list[2]]);
        expect(filterChanges(list, { kind: '', area: 'imp', text: '', period: '' })).toEqual([list[1]]);
        expect(filterChanges(list, { kind: '', area: 'nat', text: 'GUIA', period: '' })).toEqual([list[2]]);
    });

    it('gives each kind its chip', () => {
        expect(list.map((x) => changeTone(x.type))).toEqual(['ok', 'danger', 'warn']);
        expect(changeTone('NUEVA CARPETA')).toBe('info');
        expect(changeTone('OTRO')).toBe('muted');
    });

    it('groups by Lima day, not UTC', () => {
        expect(limaDayAndTime('2026-10-13T03:00:00Z')).toEqual({ day: '12/10/2026', time: '22:00' });
        const days = changesByDay(list);
        expect(days.map((d) => [d.day, d.rows.length])).toEqual([['12/10/2026', 3]]);
    });
});
