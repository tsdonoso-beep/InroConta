// The SPOT detraction rate of each good or service (annex of R.S. 183-2004/SUNAT, catalog 54),
// and the «Detracción: revisar» column of the DETALLE tab. Before, porcentaje_detraccion() and
// detalle_cpe_hoja did this in the base; v2 has no read functions, so it lives here once.

const CODES: Record<string, [rate: number, name: string]> = {
    '001': [10, 'Azúcar y melaza de caña'],
    '003': [10, 'Alcohol etílico'],
    '004': [4, 'Recursos hidrobiológicos'],
    '005': [4, 'Maíz amarillo duro'],
    '007': [10, 'Caña de azúcar'],
    '008': [4, 'Madera'],
    '009': [10, 'Arena y piedra'],
    '010': [15, 'Residuos, subproductos, desechos, recortes'],
    '011': [10, 'Bienes gravados con el IGV por renuncia a la exoneración'],
    '012': [12, 'Intermediación laboral y tercerización'],
    '014': [4, 'Carnes y despojos comestibles'],
    '016': [10, 'Aceite de pescado'],
    '017': [4, 'Harina, polvo y pellets de pescado'],
    '019': [10, 'Arrendamiento de bienes muebles'],
    '020': [12, 'Mantenimiento y reparación de bienes muebles'],
    '021': [10, 'Movimiento de carga'],
    '022': [12, 'Otros servicios empresariales'],
    '024': [10, 'Comisión mercantil'],
    '025': [10, 'Fabricación de bienes por encargo'],
    '026': [10, 'Servicio de transporte de personas'],
    '027': [4, 'Servicio de transporte de carga'],
    '030': [4, 'Contratos de construcción'],
    '031': [10, 'Oro gravado con el IGV'],
    '032': [10, 'Páprika y otros frutos de los géneros capsicum o pimienta'],
    '034': [10, 'Minerales metálicos no auríferos'],
    '035': [1.5, 'Bienes exonerados del IGV'],
    '036': [1.5, 'Oro y demás minerales metálicos exonerados del IGV'],
    '037': [12, 'Demás servicios gravados con el IGV'],
    '039': [10, 'Minerales no metálicos'],
    '040': [4, 'Bien inmueble gravado con el IGV'],
    '041': [15, 'Plomo'],
};

const code = (c: string | null) => (c ?? '').trim().padStart(3, '0');
/** 12 → «12», 1.5 → «1.5» (to_char(x, 'FM990.99') without the dot). */
const pct = (n: number) => String(Number(n.toFixed(2)));

export function detractionRate(c: string | null): { rate: number; name: string } | null {
    const hit = CODES[code(c)];
    return hit ? { rate: hit[0], name: hit[1] } : null;
}

/** What the invoice's declared detraction gets wrong, or '' (the «Detracción: revisar» column). */
export function detractionIssue(rate: number | null, goodsCode: string | null): string {
    if ((rate ?? 0) <= 0) return '';
    if (!(goodsCode ?? '').trim()) return 'Tiene detracción sin código de bien o servicio';
    const t = detractionRate(goodsCode);
    if (!t || Math.abs(rate! - t.rate) <= 0.001) return '';
    return `Se aplicó ${pct(rate!)}% y el código ${code(goodsCode)} (${t.name}) lleva ${pct(t.rate)}%`;
}
