// «Facturas sin OC» (src/shared/lib/oc/sin-oc.ts) against the old base's facturas_sin_oc() and
// gasto_tipico_sin_oc().
import { describe, expect, it } from 'vitest';
import { invoicesWithoutOc, typicalExpense, type ReceivedInvoice } from '../../../src/shared/lib/oc/sin-oc.ts';

const inv = (o: Partial<ReceivedInvoice>): ReceivedInvoice => ({ id: 'i1', ruc: '20100000001', name: 'ACME S.A.C.', total: 100, currency: 'PEN', ...o });

describe('typicalExpense', () => {
    it('knows the expenses that never carry an OC by the supplier’s name', () => {
        expect(typicalExpense('Grifo Repsol S.A.', '20100000001', 50)).toBe('Combustible');
        expect(typicalExpense('TRANSPORTES DE CARGA SAC', '20100000001', 50)).toBeNull();
        expect(typicalExpense('EMPRESA DE TRANSPORTES CIVA', '20100000001', 50)).toBe('Pasajes / movilidad');
        expect(typicalExpense('JUAN PÉREZ', '10400000001', 300)).toBe('Persona natural, monto menor (movilidad / viáticos)');
    });
});

describe('invoicesWithoutOc', () => {
    it('flags ALTA when the supplier works with OCs, MEDIA when the amount is high', () => {
        const rows = [inv({}), inv({ id: 'i2' }), inv({ id: 'i3', ruc: '20100000002', total: 1000, currency: 'USD' })];
        const out = invoicesWithoutOc(rows, new Set(['i2']), new Map(), new Map());
        expect(out.map((x) => [x.invoiceId, x.signal])).toEqual([
            ['i1', 'ALTA'],
            ['i3', 'MEDIA'],
        ]);
        expect(out[0].reason).toBe('El proveedor trabaja con OC: 1 de sus 2 facturas están unidas a una OC. Falta la OC o subir esta factura a su carpeta.');
    });

    it('takes the area from the approvals table first, then from its OC folders', () => {
        const bySupplier = new Map([
            ['20100000001', { who: [{ buyer: 'Ana', area: null }], folders: [true, false, true] }],
            ['20100000002', { who: [{ buyer: 'Luis', area: 'Compras nacionales' }], folders: [true] }],
        ]);
        const out = invoicesWithoutOc([inv({}), inv({ id: 'i2', ruc: '20100000002' })], new Set(), bySupplier, new Map());
        expect(out.map((x) => x.likelyArea)).toEqual(['COMEX (importaciones)', 'Compras nacionales']);
    });

    it('leaves out the suppliers Contabilidad marked', () => {
        const [x] = invoicesWithoutOc([inv({ total: 9000 })], new Set(), new Map(), new Map([['20100000001', 'banco']]));
        expect(x).toMatchObject({ signal: null, reason: 'Contabilidad: banco' });
    });
});
