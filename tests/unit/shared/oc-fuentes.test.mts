// The private sheet's rows as guardar_fuente_oc's JSON (src/shared/lib/oc/fuentes.ts, base-cg.ts)
// and the changes logged against v2 (cambios-fuentes.ts).
import { describe, expect, it } from 'vitest';
import type { CompraOC } from '../../../src/shared/lib/drive/fuentes-compras.ts';
import { cgRows, guessProcedencia, type KnownOrder } from '../../../src/shared/lib/oc/base-cg.ts';
import { sourceChanges } from '../../../src/shared/lib/oc/cambios-fuentes.ts';
import { comprasRow, copyRuns, currency, isoDate, keepResolved } from '../../../src/shared/lib/oc/fuentes.ts';
import { orderKey } from '../../../src/shared/lib/oc/cambios-fuentes.ts';

const compra = (o: Partial<CompraOC>): CompraOC => ({
    oc: '0172-2026',
    procedencia: 'Nacional',
    ocOriginal: '172-2026',
    empresa: 'INDUSTRIAS ROLAND PRINT S.A.C.',
    tipoDocumento: 'ORDEN DE SERVICIO',
    fecha: '2026-03-02',
    requerimiento: '',
    proveedorRuc: '20100000001',
    proveedor: 'ACME',
    pais: '',
    proyecto: 'P1',
    concepto: '',
    moneda: 'Soles',
    total: 100,
    totalSoles: 100,
    formaPago: '',
    condicionPago: '',
    incoterm: '',
    lugarEntrega: '',
    tiempoEntrega: '',
    solicitado: '',
    elaborado: 'Ana',
    items: 2,
    ...o,
});

describe('comprasRow', () => {
    it('writes the columns of orden_compra, blanks as null and the currency as ISO', () => {
        expect(comprasRow(compra({}))).toMatchObject({
            procedencia: 'NACIONAL',
            oc: '0172-2026',
            tipo: 'OS',
            consorcio: null,
            requerimiento: null,
            moneda: 'PEN',
        });
        expect(comprasRow(compra({ empresa: 'CONSORCIO X' })).consorcio).toBe('CONSORCIO X');
    });
    it('normalizes dates and currencies', () => {
        expect(isoDate('2026-01-09 / 2026-02-03')).toBe('2026-01-09');
        expect(isoDate('POR CONFIRMAR')).toBeNull();
        expect([currency('Dolares'), currency('usd'), currency('USD / EUR')]).toEqual(['USD', 'USD', null]);
    });
    it('keeps what v2 has where Compras is blank', () => {
        const orders = new Map([['NACIONAL|172|2026', { proveedor_ruc: '20100000009', moneda: 'USD', fecha_oc: null }]]);
        const [r] = keepResolved([comprasRow(compra({ proveedorRuc: '' }))], orders, orderKey);
        expect(r).toMatchObject({ proveedor_ruc: '20100000009', moneda: 'PEN' });
    });
});

describe('copyRuns', () => {
    it('logs each tab copy as a corrida', () => {
        const [r] = copyRuns(
            [{ pestana: 'KARDEX', origen: 'x', filas: 10, inicio: '2026-10-22T05:40:00Z', fin: null, resultado: 'OK · 10 filas' }],
            '20512201611',
            'now',
        );
        expect(r).toMatchObject({ job: 'copia-fuentes', resultado: 'OK', filas: 10, terminada_en: null, resumen: { pestana: 'KARDEX' } });
    });
});

describe('cgRows', () => {
    const known = new Map<string, KnownOrder>([
        ['IMPORTACION|172|2026', { procedencia: 'IMPORTACION', numero: '172', anio: 2026, proveedor_ruc: '20100000005' }],
    ]);
    it('groups by OC and cost centre and tells imports apart', () => {
        const tab = [
            ['N° OC/OS', 'RUC / DNI / RUT', 'EMPRESA', 'FECHA OC', 'CODIGO CENTRO DE COSTO', 'CENTRO DE COSTO', 'MONEDA', 'MONTO TOTAL'],
            ['0172-2026', '20100000005', 'INROPRIN', 46000, 'PROY-1', 'P1', 'USD', 10],
            ['0172-2026', '20100000005', 'INROPRIN', 45990, 'PROY-1 ', 'P1', 'USD', 5.5],
            ['0300-2026', '20100000006', 'INROPRIN', '', '', 'ÁREA ADMINISTRATIVA', 'PEN', 1],
            ['0300-2026', '20100000006', 'INROPLAS', '', '', 'X', 'PEN', 1],
        ];
        const rows = cgRows(tab, known, (c) => c);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({ procedencia: 'IMPORTACION', cc_codigo: 'PROY-1', monto: 15.5, lineas: 2, fecha_oc: '2025-11-29' });
        expect(rows[1]).toMatchObject({ procedencia: 'NACIONAL', cc_codigo: '-', cc_nombre: 'ÁREA ADMINISTRATIVA' });
        expect(guessProcedencia('172-2026', null, known)).toBe('IMPORTACION');
    });
});

describe('sourceChanges', () => {
    const order = { id: 'o1', procedencia: 'NACIONAL', codigo: '0172-2026', compras_en: '2026-10-22T00:00:00Z', elaborado: 'Ana', items: 2, monto_pen: 100 };
    const v2 = { orders: new Map([['NACIONAL|172|2026', order]]), duas: new Map(), vouchers: new Map() };
    it('logs what Compras changed and what it no longer has', () => {
        const ch = sourceChanges('COMPRAS', [comprasRow(compra({ elaborado: 'Luis', totalSoles: 100.2 }))], v2, true);
        expect(ch).toEqual([expect.objectContaining({ clave: 'NACIONAL|0172-2026', tipo: 'CAMBIO', campo: 'elaborado', antes: 'Ana', despues: 'Luis' })]);
        expect(sourceChanges('COMPRAS', [], v2, true)[0]).toMatchObject({ tipo: 'ELIMINADO', campo: 'ELIMINADO' });
    });
    it('logs nothing on the first load', () => {
        expect(sourceChanges('COMPRAS', [comprasRow(compra({}))], { ...v2, orders: new Map() }, true)).toEqual([]);
    });
});
