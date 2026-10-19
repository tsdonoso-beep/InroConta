// The RUC cards, the SSCO list and one full ficha, read from the v2 tables: contribuyente (padrón,
// reduced roll and ficha in one row per RUC) and lista_ssco. Before, fichas_ruc_json and
// ssco_json joined padron_ruc with ruc_domicilio on every read.
import 'server-only';
import { err, ok, type Result } from 'neverthrow';
import type { SourceError } from '../../../shared/errors.ts';
import { all, limaDate, one } from '../../../shared/supabase/tables.ts';
import { nameCase } from '../../../shared/text.ts';
import type { RucPort } from '../application/ports/RucPort.ts';
import type { RucLists, SscoEntry, SunatFicha, TaxpayerCard } from '../domain/entities/Taxpayer.ts';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));

const CARD = 'ruc,buen_contribuyente,agente_retencion,agente_percepcion,estado,condicion,direccion,distrito,provincia,departamento,padron_en';

const card = (r: Row): TaxpayerCard => ({
    ruc: s(r.ruc),
    goodTaxpayer: r.buen_contribuyente === true,
    withholdingAgent: r.agente_retencion === true,
    perceptionAgent: r.agente_percepcion === true,
    state: s(r.estado),
    condition: s(r.condicion),
    address: s(r.direccion),
    district: s(r.distrito),
    province: s(r.provincia),
    department: s(r.departamento),
    // '' = the padrón was never consulted: the «good taxpayer» flag says nothing then.
    checkedOn: limaDate(r.padron_en),
});

const ssco = (r: Row): SscoEntry => ({
    ruc: s(r.ruc),
    name: nameCase(s(r.razon_social)),
    resolution: s(r.resolucion),
    resolutionDate: s(r.resolucion_fecha),
    finalDate: s(r.firme_desde),
    publishedOn: s(r.publicado_el),
    representative: s(r.representante_nombre),
});

const FICHA =
    'ruc,razon_social,estado,condicion,tipo_contribuyente,documento,nombre_comercial,fecha_inscripcion,' +
    'fecha_inicio_actividades,fecha_baja,direccion,sistema_emision,comercio_exterior,sistema_contabilidad,actividades,' +
    'comprobantes_impresion,emision_electronica,emisor_electronico_desde,comprobantes_electronicos,ple_desde,' +
    'padrones_detalle,aviso,ficha_en';

export class SupabaseRucAdapter implements RucPort {
    async readLists(): Promise<Result<RucLists, SourceError>> {
        const [cards, list] = await Promise.all([
            // The RUCs some lookup consulted (padrón or reduced roll), as fichas_ruc_json listed them.
            all<Row>('contribuyente', (c) => c.from('contribuyente').select(CARD).or('padron_en.not.is.null,domicilio_en.not.is.null').order('ruc')),
            all<Row>('lista_ssco', (c) =>
                c.from('lista_ssco').select('ruc,razon_social,resolucion,resolucion_fecha,firme_desde,publicado_el,representante_nombre').order('ruc'),
            ),
        ]);
        if (cards.isErr()) return err(cards.error);
        // The SSCO list is a refinement: without it the cards still show, and the screen says the list is not loaded.
        const sscoRows = list.unwrapOr(null);
        return ok({
            cards: cards.value.map(card),
            ssco: sscoRows && sscoRows.length ? sscoRows.map(ssco) : null,
            readAt: new Date().toISOString(),
        });
    }

    async readFicha(ruc: string): Promise<Result<SunatFicha | null, SourceError>> {
        const rows = await one<Row>('contribuyente', (c) => c.from('contribuyente').select(FICHA).eq('ruc', ruc));
        if (rows.isErr()) return err(rows.error);
        const f = rows.value[0];
        if (!f || !f.ficha_en) return ok(null);
        const { direccion, ficha_en, ...rest } = f;
        return ok({ ...(rest as unknown as SunatFicha), domicilio_fiscal: (direccion as string) ?? null, ficha_consultada_en: (ficha_en as string) ?? null });
    }
}
