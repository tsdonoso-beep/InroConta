// The shape of what datosCompactosVista_ (apps-script/inroconta/VistaEjecutiva.gs) sends to the
// page, as far as the tests read it. The rows are positional arrays to keep the
// payload small; the positions are documented above that function.

/** One document: period, origin, provider, type, currency, net amount… */
export type CompactDoc = (string | number | null | CompactDeposit)[];

/** [constancia, payment date, deposited, PDF id, HTML id, status] */
export type CompactDeposit = [string, string, number | null, string, string, string];

/** One product: [description, unit, currency, provider, times, spend, [[period, unit price]…], PDF id] */
export type CompactProduct = [string, string, number, number, number, number, [string, number][], string];

export interface ViewData {
    error: string | null;
    urlHoja: string;
    generadoEl: string;
    dic: { prov: [string, string][]; oc: unknown[]; cc: string[]; moneda: string[] };
    docs: CompactDoc[];
    productos: CompactProduct[];
    totalProductos: number;
    lineas: number;
}
