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

/** What fichaRucVista answers: the padron_ruc row of a RUC (migration 068), here a deregistered supplier. */
export function sunatFicha() {
    return {
        ruc: '20200000002',
        razon_social: 'TRANSPORTES ANDINOS EIRL',
        estado: 'BAJA DE OFICIO',
        condicion: 'NO HABIDO',
        tipo_contribuyente: 'EMPRESA INDIVIDUAL DE RESP. LTDA',
        documento: null,
        nombre_comercial: null,
        fecha_inscripcion: '2015-03-02',
        fecha_inicio_actividades: '2015-03-10',
        fecha_baja: '2026-07-13',
        domicilio_fiscal: 'JR. PUNO 466 LIMA - LIMA - LIMA',
        sistema_emision: 'MANUAL/COMPUTARIZADO',
        comercio_exterior: 'SIN ACTIVIDAD',
        sistema_contabilidad: 'COMPUTARIZADO',
        actividades: [{ kind: 'Principal', code: '4923', description: 'TRANSPORTE DE CARGA POR CARRETERA' }],
        comprobantes_impresion: ['FACTURA', 'GUIA DE REMISION - TRANSPORTISTA'],
        emision_electronica: ['FACTURA PORTAL DESDE 30/09/2019'],
        emisor_electronico_desde: '2019-09-30',
        comprobantes_electronicos: 'FACTURA (desde 30/09/2019)',
        ple_desde: null,
        padrones_detalle: 'Incorporado al Régimen de Agentes de Retención de IGV (R.S.217-2010) a partir del 01/09/2010',
        aviso: 'Los comprobantes de pago o notas de débito emitidos por este contribuyente no dan derecho a crédito fiscal del IGV, en tanto se encuentra con estado de BAJA DE OFICIO',
        ficha_consultada_en: '2026-10-13T14:50:00+00:00',
    };
}

/** The base response; `ssco: null` is what the page gets while the SSCO list is not loaded. */
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
