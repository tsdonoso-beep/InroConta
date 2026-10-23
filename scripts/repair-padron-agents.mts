// Re-derives the three flags of contribuyente (good taxpayer, withholding agent, perception agent) from the
// «Padrones» text each row already stores, with the fixed reader (leerPadrones). Needs no query to SUNAT.
//
// Why: until 09/10/2026 the reader looked for «agente de retención» and SUNAT writes «Agentes de
// Retención», so no row was ever marked (INROPRIN included, and it IS an agent since 2010). The rows
// also kept a stray «Razón Social: eeee -->» at the end of the text.
//
//   pnpm padron:repair             only counts and lists what would change (nothing is written)
//   pnpm padron:repair --apply     writes the rows that change (comun/padron.mts, v2 base)
//
// Saving stamps padron_en = now() on what it writes: the repaired rows are not
// re-queried by the robot for DIAS_VIGENCIA days, which is fine (their text is current).
import { leerPadrones } from '../src/shared/lib/sunat/consulta-ruc.ts';
import { base } from './local/comun/base.mts';
import { savePadron } from './local/comun/padron.mts';

const apply = process.argv.includes('--apply');

interface Row {
    ruc: string;
    razon_social: string | null;
    estado: string | null;
    condicion: string | null;
    buen_contribuyente: boolean;
    agente_retencion: boolean;
    agente_percepcion: boolean;
    padrones_detalle: string | null;
}

const sb = base();

const rows: Row[] = [];
for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
        .from('contribuyente')
        .select('ruc, razon_social, estado, condicion, buen_contribuyente, agente_retencion, agente_percepcion, padrones_detalle')
        // The RUC the Consulta RUC answered (what padron_ruc held).
        .not('padron_en', 'is', null)
        .order('ruc')
        .range(from, from + 999);
    if (error) {
        console.error('✗ Could not read contribuyente:', error.message);
        process.exit(1);
    }
    rows.push(...(data as Row[]));
    if (data.length < 1000) break;
}

// Like the reader: no text at all (null) when the row is in no padron.
const clean = (text: string | null) => {
    const trimmed = text?.replace(/\s*Razón Social:.*$/s, '').trim() ?? '';
    return !trimmed || /^ninguno$/i.test(trimmed) ? null : trimmed;
};

const changes = rows.flatMap((r) => {
    const text = clean(r.padrones_detalle);
    const flags = leerPadrones(text);
    const same =
        text === r.padrones_detalle &&
        flags.buenContribuyente === r.buen_contribuyente &&
        flags.agenteRetencion === r.agente_retencion &&
        flags.agentePercepcion === r.agente_percepcion;
    return same ? [] : [{ before: r, text, flags }];
});

const count = (pick: (c: (typeof changes)[number]) => boolean) => changes.filter(pick).length;
console.log(`${rows.length} RUC looked up in contribuyente; ${changes.length} change.`);
console.log(`  withholding agent  false → true: ${count((c) => c.flags.agenteRetencion && !c.before.agente_retencion)}`);
console.log(`  perception agent   false → true: ${count((c) => c.flags.agentePercepcion && !c.before.agente_percepcion)}`);
console.log(`  good taxpayer      changed:      ${count((c) => c.flags.buenContribuyente !== c.before.buen_contribuyente)}`);
console.log(`  only the text cleaned:           ${count((c) => c.text !== c.before.padrones_detalle)}`);
const inroprin = changes.find((c) => c.before.ruc === '20512201611');
console.log(`  INROPRIN (20512201611): ${inroprin ? `withholding agent → ${inroprin.flags.agenteRetencion}` : 'no change'}`);

if (!apply) {
    console.log('\nDry run: nothing was written. Run again with --apply to write the changes.');
    process.exit(0);
}

let saved = 0;
for (let i = 0; i < changes.length; i += 200) {
    const batch = changes.slice(i, i + 200).map(({ before, text, flags }) => ({
        ruc: before.ruc,
        razonSocial: before.razon_social,
        estado: before.estado,
        condicion: before.condicion,
        ...flags,
        padronesTexto: text,
    }));
    try {
        saved += await savePadron(sb, batch);
    } catch (e) {
        console.error(`✗ Batch from ${i} failed (${saved} already saved):`, e instanceof Error ? e.message : e);
        process.exit(1);
    }
}
console.log(`\n✓ ${saved} rows written.`);
