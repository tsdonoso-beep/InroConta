// The full kardex and what changed from one reading to the next (src/shared/lib/kardex/movimientos.ts).
import { describe, expect, it } from 'vitest';
import { diferenciasKardex, movimientoDeFila, movimientosKardex, resumenPorMes, type MovimientoKardex } from '../../../src/shared/lib/kardex/movimientos.ts';

const CAB = [
    'ID',
    'VALE DE ALMACEN',
    'FECHA REGISTRO',
    'FECHA OPERACION',
    'TIPO DE MOVIMIENTO',
    'TIPO DE OPERACION',
    'TIPO ANEXO',
    'DESCRIPCION',
    'NUMERO DOCUMENTO',
    'NUMERO ORDEN',
    'PROYECTO',
    'SEDE',
    'RESPONSABLE DE REGISTRO',
    'CODIGO SIDIGE',
    'DESCRIPCION DE SKU',
    'UNDIDAD DE MEDIDA',
    'CATEGORIA',
    'INGRESO',
    'SALIDA',
];

const mov = (p: Partial<MovimientoKardex>): MovimientoKardex => ({
    id: 'K1',
    vale: 'VA-001',
    fechaRegistro: '2026-09-10',
    fechaOperacion: '2026-09-10',
    movimiento: 'SALIDA',
    operacion: 'DESPACHO A PROYECTO',
    anexo: 'PROYECTO: PRONIED',
    numeroDocumento: '',
    numeroOrden: '',
    proyecto: 'PRONIED',
    sede: 'LIMA',
    responsable: 'JOSE',
    sku: 'SKU-1',
    producto: 'PINTURA',
    unidad: 'GLN',
    categoria: 'INSUMOS',
    ingreso: null,
    salida: 4,
    ...p,
});

describe('movimientosKardex', () => {
    it('reads one row per product, dates as serials, and skips the rows without an ID', () => {
        // 46275 = 10/09/2026 in Sheets' serial days.
        const r = movimientosKardex([
            CAB,
            [
                'K1',
                'VA-001',
                46275,
                '10/09/2026',
                'salida',
                'Despacho a proyecto',
                'Proyecto',
                'PRONIED',
                '',
                '',
                'PRONIED',
                'LIMA',
                'JOSE',
                'SKU-1',
                'PINTURA',
                'GLN',
                'INSUMOS',
                '',
                4,
            ],
            ['', 'VA-002', 46275, 46275, 'INGRESO', 'COMPRA', 'PROVEEDOR', 'ACME', 'F001-1', '0200-2026', '', '', '', 'SKU-2', 'CLAVO', 'KG', '', 10, ''],
        ]);
        expect(r.sinId).toBe(1);
        expect(r.movimientos).toEqual([mov({})]);
    });
});

describe('diferenciasKardex', () => {
    const antes = new Map([
        ['K1', mov({})],
        ['K2', mov({ id: 'K2', fechaOperacion: '2026-10-02', salida: 1 })],
        ['K3', mov({ id: 'K3', fechaOperacion: '2026-08-31' })],
    ]);

    it('notes what is new, changed and deleted, and whether its month had already closed', () => {
        const hoy = [
            mov({ salida: 5 }), // K1, September, changed after September closed
            mov({ id: 'K2', fechaOperacion: '2026-10-02', salida: 1 }), // K2, the same
            mov({ id: 'K4', fechaOperacion: '2026-10-27' }), // new, this month
        ];
        const d = diferenciasKardex(antes, hoy, { hoyEs: '2026-10-28' });
        expect(d.guardar.map((m) => m.id)).toEqual(['K1', 'K4']);
        expect(d.borrar).toEqual(['K3']);
        expect(d.cambios.map((c) => [c.clave, c.tipo, c.campo, c.antes, c.despues, c.detalle.mes, c.detalle.mesCerrado])).toEqual([
            ['K1', 'CAMBIO', 'salida', '4', '5', '2026-09', true],
            ['K4', 'NUEVO', null, null, null, '2026-10', false],
            ['K3', 'ELIMINADO', null, null, null, '2026-08', true],
        ]);
    });

    it('takes the older month when a movement moves from one month to another', () => {
        const d = diferenciasKardex(antes, [mov({ fechaOperacion: '2026-10-01' }), antes.get('K2')!, antes.get('K3')!], { hoyEs: '2026-10-28' });
        expect(d.cambios.map((c) => [c.campo, c.detalle.mes, c.detalle.mesCerrado])).toEqual([['fechaOperacion', '2026-09', true]]);
    });

    it('does not delete when the tab came cut, and does not flood the first load with «NUEVO»', () => {
        expect(diferenciasKardex(antes, [mov({})], { hoyEs: '2026-10-28', completa: false }).borrar).toEqual([]);
        const first = diferenciasKardex(new Map(), [mov({}), mov({ id: 'K9' })], { hoyEs: '2026-10-28' });
        expect([first.guardar.length, first.cambios.length]).toEqual([2, 0]);
    });

    it('reads back what the base keeps as the same movement (no change)', () => {
        const fila = {
            id: 'K1',
            vale: 'VA-001',
            fecha_registro: '2026-09-10',
            fecha_operacion: '2026-09-10',
            movimiento: 'SALIDA',
            operacion: 'DESPACHO A PROYECTO',
            anexo: 'PROYECTO: PRONIED',
            numero_documento: null,
            numero_orden: null,
            proyecto: 'PRONIED',
            sede: 'LIMA',
            responsable: 'JOSE',
            sku: 'SKU-1',
            producto: 'PINTURA',
            unidad: 'GLN',
            categoria: 'INSUMOS',
            ingreso: null,
            salida: '4.0000',
        };
        const back = new Map([['K1', movimientoDeFila(fila)]]);
        expect(diferenciasKardex(back, [mov({})], { hoyEs: '2026-10-28' }).cambios).toEqual([]);
    });
});

describe('resumenPorMes', () => {
    it('counts movements and vouchers and adds what came in and went out, newest month first', () => {
        expect(
            resumenPorMes([
                mov({}),
                mov({ id: 'K2', vale: 'VA-002', movimiento: 'INGRESO', salida: null, ingreso: 10.5 }),
                mov({ id: 'K3', vale: 'VA-002', movimiento: 'ANULADO', salida: null }),
                mov({ id: 'K4', fechaOperacion: '2026-10-01', salida: 2 }),
                mov({ id: 'K5', fechaOperacion: null }),
            ]),
        ).toEqual([
            { mes: '2026-10', movimientos: 1, vales: 1, ingresos: 0, salidas: 2, anulados: 0 },
            { mes: '2026-09', movimientos: 3, vales: 2, ingresos: 10.5, salidas: 4, anulados: 1 },
        ]);
    });
});
