// The RUC cards and the SSCO list from the base (both *_json, one call each), and one full ficha.
import 'server-only';
import { err, ok, type Result } from 'neverthrow';
import type { SourceError } from '../../../shared/errors.ts';
import { rpc, select } from '../../../shared/supabase/rpc.ts';
import { nameCase } from '../../../shared/text.ts';
import type { RucPort } from '../application/ports/RucPort.ts';
import type { RucLists, SscoEntry, SunatFicha, TaxpayerCard } from '../domain/entities/Taxpayer.ts';

const FICHA_FIELDS = [
    'ruc',
    'razon_social',
    'estado',
    'condicion',
    'tipo_contribuyente',
    'documento',
    'nombre_comercial',
    'fecha_inscripcion',
    'fecha_inicio_actividades',
    'fecha_baja',
    'domicilio_fiscal',
    'sistema_emision',
    'comercio_exterior',
    'sistema_contabilidad',
    'actividades',
    'comprobantes_impresion',
    'emision_electronica',
    'emisor_electronico_desde',
    'comprobantes_electronicos',
    'ple_desde',
    'padrones_detalle',
    'aviso',
    'ficha_consultada_en',
].join(',');

type Tuple = unknown[];
const s = (v: unknown) => (v == null ? '' : String(v));

// [ruc, good taxpayer, withholding, perception, state, condition, address, district, province, department, consulted on]
const card = (r: Tuple): TaxpayerCard => ({
    ruc: s(r[0]),
    goodTaxpayer: r[1] === true,
    withholdingAgent: r[2] === true,
    perceptionAgent: r[3] === true,
    state: s(r[4]),
    condition: s(r[5]),
    address: s(r[6]),
    district: s(r[7]),
    province: s(r[8]),
    department: s(r[9]),
    checkedOn: s(r[10]),
});

// [ruc, business name, resolution, resolution date, final date, published on, representative]
const ssco = (r: Tuple): SscoEntry => ({
    ruc: s(r[0]),
    name: nameCase(s(r[1])),
    resolution: s(r[2]),
    resolutionDate: s(r[3]),
    finalDate: s(r[4]),
    publishedOn: s(r[5]),
    representative: s(r[6]),
});

export class SupabaseRucAdapter implements RucPort {
    async readLists(): Promise<Result<RucLists, SourceError>> {
        const [cards, list] = await Promise.all([rpc<Tuple[]>('fichas_ruc_json'), rpc<Tuple[]>('ssco_json')]);
        if (cards.isErr()) return err(cards.error);
        // The SSCO list is a refinement: without it the cards still show, and the screen says the list is not loaded.
        const sscoRows = list.unwrapOr(null);
        return ok({
            cards: (cards.value ?? []).map(card),
            ssco: sscoRows && sscoRows.length ? sscoRows.map(ssco) : null,
            readAt: new Date().toISOString(),
        });
    }

    async readFicha(ruc: string): Promise<Result<SunatFicha | null, SourceError>> {
        const rows = await select<SunatFicha>('padron_ruc', (c) => c.from('padron_ruc').select(FICHA_FIELDS).eq('ruc', ruc));
        if (rows.isErr()) return err(rows.error);
        const f = rows.value[0] ?? null;
        return ok(f && f.ficha_consultada_en ? f : null);
    }
}
