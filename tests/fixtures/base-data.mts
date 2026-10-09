// What datosDeLaBaseVista (apps-script/inroconta/VistaEjecutiva.gs) sends to the
// page, for the RUCs of the fixture DETALLE tab (detail-sheet.mts). Empty lists
// where the tests do not look; the SSCO list puts one of our suppliers in it.

/** [ruc, good taxpayer, withholding agent, perception agent, state, condition, address, district, province, department, checked on] */
export const FICHAS = [
    ['20100000001', true, false, false, 'ACTIVO', 'HABIDO', 'AV. LOS TONERS 123', 'LIMA', 'LIMA', 'LIMA', '2026-10-01'],
    ['20200000002', false, true, false, 'ACTIVO', 'NO HABIDO', '', '', '', '', '2026-10-01'],
];

/** [ruc, business name, resolution, resolution date, final date, published on, representative] */
export const SSCO = [
    [
        '10002179496',
        'RUIZ CRUZ FIDEL ENRIQUE',
        'Resolución de Intendencia N.º 254-024-0001296/SUNAT',
        '2026-08-26',
        '2026-09-10',
        '2026-09-30',
        'RUIZ CRUZ FIDEL ENRIQUE',
    ],
    [
        '20200000002',
        'TRANSPORTES ANDINOS EIRL',
        'Resolución de Intendencia N.º 024-024-0090000/SUNAT',
        '2026-08-01',
        '2026-08-20',
        '2026-08-31',
        'QUISPE ROJAS ANA',
    ],
];

/** The base response; `ssco: null` is what the page gets while the SSCO tab is missing. */
export function baseData(overrides: Record<string, unknown> = {}) {
    return {
        error: null,
        carpetas: [],
        sinOc: [],
        cambios: [],
        copia: [],
        rucs: FICHAS,
        cuadreVentas: [],
        ssco: SSCO,
        detracciones: [],
        detSinConstancia: [],
        detError: null,
        armadoEl: '2026-10-09T15:00:00.000Z',
        ...overrides,
    };
}
