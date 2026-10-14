// What SUNAT says of a RUC: the short card of every RUC we deal with (fichas_ruc_json: good
// taxpayer, agents, state, fiscal address, migration 062), SUNAT's list of subjects without
// operating capacity (SSCO, ssco_json, migration 069) and the full Consulta RUC ficha of one RUC
// (padron_ruc, migration 068), which the padrón robot reads with a real browser.

export interface TaxpayerCard {
    ruc: string;
    goodTaxpayer: boolean;
    withholdingAgent: boolean;
    perceptionAgent: boolean;
    /** ACTIVO, BAJA… */
    state: string;
    /** HABIDO, NO HALLADO… */
    condition: string;
    address: string;
    district: string;
    province: string;
    department: string;
    /** yyyy-mm-dd the padrón was consulted; '' = never (the «good taxpayer» flag says nothing then). */
    checkedOn: string;
}

/** A subject without operating capacity (SSCO): its invoices do not support tax credit nor expense. */
export interface SscoEntry {
    ruc: string;
    name: string;
    resolution: string;
    /** yyyy-mm-dd. */
    resolutionDate: string;
    finalDate: string;
    publishedOn: string;
    representative: string;
}

export interface RucLists {
    cards: TaxpayerCard[];
    /** null when the list could not be read or was never loaded: the screen must not claim «not in the list». */
    ssco: SscoEntry[] | null;
    readAt: string;
}

export interface Activity {
    kind: string;
    code: string;
    description: string;
}

/** The full Consulta RUC ficha, as padron_ruc keeps it. */
export interface SunatFicha {
    ruc: string;
    razon_social: string | null;
    estado: string | null;
    condicion: string | null;
    tipo_contribuyente: string | null;
    documento: string | null;
    nombre_comercial: string | null;
    fecha_inscripcion: string | null;
    fecha_inicio_actividades: string | null;
    fecha_baja: string | null;
    domicilio_fiscal: string | null;
    sistema_emision: string | null;
    comercio_exterior: string | null;
    sistema_contabilidad: string | null;
    actividades: Activity[] | null;
    comprobantes_impresion: string[] | null;
    emision_electronica: string[] | null;
    emisor_electronico_desde: string | null;
    comprobantes_electronicos: string | null;
    ple_desde: string | null;
    padrones_detalle: string | null;
    aviso: string | null;
    ficha_consultada_en: string | null;
}

export const isRuc = (v: string) => /^\d{11}$/.test(v);
