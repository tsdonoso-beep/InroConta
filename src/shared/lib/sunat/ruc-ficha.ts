// The full ficha of the Consulta RUC result: every field SUNAT shows, not only the padrones.
//
// `consulta-ruc.ts` flattens the page to lines and finds each label; this file turns the
// lines under each label into typed fields. Labels and their order were read from real
// pages on 13/10/2026: a company (INROPRIN), natural persons (they add «Tipo de Documento»),
// a temporary suspension and two deregistered RUC (they add «Fecha de Baja» and an
// «IMPORTANTE» notice about IGV credit).
//
// SUNAT writes «-» for an empty value and «NINGUNO» for an empty list: both become null / [].

export interface RucActivity {
    /** «Principal», «Secundaria 1»… as SUNAT writes it. */
    kind: string;
    /** CIIU code, e.g. «4652». */
    code: string;
    description: string;
}

export interface RucFicha {
    taxpayerType: string | null;
    /** Natural persons only: «DNI 00872109». */
    document: string | null;
    tradeName: string | null;
    /** Dates as ISO yyyy-mm-dd. */
    registeredOn: string | null;
    activitiesStartOn: string | null;
    deregisteredOn: string | null;
    fiscalAddress: string | null;
    issuingSystem: string | null;
    foreignTrade: string | null;
    accountingSystem: string | null;
    activities: RucActivity[];
    /** «Comprobantes de Pago c/aut. de impresión (F. 806 u 816)». */
    printedReceipts: string[];
    /** «Sistema de Emisión Electrónica», one entry per line. */
    electronicIssuing: string[];
    electronicIssuerSince: string | null;
    electronicReceipts: string | null;
    pleSince: string | null;
    /** The red «IMPORTANTE:» notice (deregistered RUC: their receipts give no IGV credit). */
    notice: string | null;
}

/** The lines under a label, up to the next known label (empty if the label is missing). */
export type LinesOf = (label: string) => string[];

const empty = (v: string) => !v || v === '-' || /^ninguno$/i.test(v);

const text = (lines: string[]): string | null => {
    const v = lines.join(' ').trim();
    return empty(v) ? null : v;
};

const list = (lines: string[]): string[] => lines.map((l) => l.trim()).filter((l) => !empty(l));

/** «21/12/2005» → «2005-12-21»; anything else → null. */
export function isoDate(lines: string[]): string | null {
    const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(lines.join(' '));
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** «Principal - 4652 - VENTA AL POR MAYOR…» → { kind, code, description }. */
export function readActivities(lines: string[]): RucActivity[] {
    return list(lines).flatMap((l) => {
        const m = /^(.+?)\s+-\s+(\d{3,5})\s+-\s+(.+)$/.exec(l);
        return m ? [{ kind: m[1].trim(), code: m[2], description: m[3].trim() }] : [];
    });
}

export function readFicha(linesOf: LinesOf): RucFicha {
    // «DNI 00872109» then «- CARDENAS DE TEJADA, GLADIS»: the name is already in «Número de RUC».
    const document = text(linesOf('Tipo de Documento:').slice(0, 1));
    return {
        taxpayerType: text(linesOf('Tipo Contribuyente:')),
        document,
        tradeName: text(linesOf('Nombre Comercial:')),
        registeredOn: isoDate(linesOf('Fecha de Inscripción:')),
        activitiesStartOn: isoDate(linesOf('Fecha de Inicio de Actividades:')),
        deregisteredOn: isoDate(linesOf('Fecha de Baja:')),
        fiscalAddress: text(linesOf('Domicilio Fiscal:')),
        issuingSystem: text(linesOf('Sistema Emisión de Comprobante:')),
        foreignTrade: text(linesOf('Actividad Comercio Exterior:')),
        accountingSystem: text(linesOf('Sistema Contabilidad:')),
        activities: readActivities(linesOf('Actividad(es) Económica(s):')),
        printedReceipts: list(linesOf('Comprobantes de Pago c/aut. de impresión')).filter((l) => !l.startsWith('(F.')),
        electronicIssuing: list(linesOf('Sistema de Emisión Electrónica:')),
        electronicIssuerSince: isoDate(linesOf('Emisor electrónico desde:')),
        electronicReceipts: text(linesOf('Comprobantes Electrónicos:')),
        pleSince: isoDate(linesOf('Afiliado al PLE desde:')),
        notice: text(linesOf('IMPORTANTE:')),
    };
}
