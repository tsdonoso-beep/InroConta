// Re-derives the three flags of padron_ruc (good taxpayer, withholding agent, perception agent) from the
// «Padrones» text each row already stores, with the fixed reader (leerPadrones). Needs no query to SUNAT.
//
// Why: until 09/10/2026 the reader looked for «agente de retención» and SUNAT writes «Agentes de
// Retención», so no row was ever marked (INROPRIN included, and it IS an agent since 2010). The rows
// also kept a stray «Razón Social: eeee -->» at the end of the text.
//
//   pnpm padron:repair             only counts and lists what would change (nothing is written)
//   pnpm padron:repair --apply     writes the rows that change, through guardar_padron_ruc
//
// guardar_padron_ruc stamps consultado_en = now() on what it writes: the repaired rows are not
// re-queried by the robot for DIAS_VIGENCIA days, which is fine (their text is current).
import { createClient } from '@supabase/supabase-js';
import { leerPadrones } from '../src/shared/lib/sunat/consulta-ruc.ts';

const apply = process.argv.includes('--apply');

const need = (...names: string[]): string => {
    for (const n of names) if (process.env[n]?.trim()) return process.env[n]!.trim();
    console.error(`✗ Missing ${names.join(' or ')} in the environment (.env.local).`);
    process.exit(1);
};

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

const sb = createClient(need('SUPABASE_URL', 'PROJECT_URL'), need('SUPABASE_ANON_KEY', 'ANON_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
});
const { error: loginError } = await sb.auth.signInWithPassword({ email: need('ROBOT_CORREO'), password: need('ROBOT_CLAVE') });
if (loginError) {
    console.error('✗ Could not sign in as the robot:', loginError.message);
    process.exit(1);
}

const rows: Row[] = [];
for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
        .from('padron_ruc')
        .select('ruc, razon_social, estado, condicion, buen_contribuyente, agente_retencion, agente_percepcion, padrones_detalle')
        .order('ruc')
        .range(from, from + 999);
    if (error) {
        console.error('✗ Could not read padron_ruc:', error.message);
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
console.log(`${rows.length} RUC in padron_ruc; ${changes.length} change.`);
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
    const { error } = await sb.rpc('guardar_padron_ruc', { p_filas: batch });
    if (error) {
        console.error(`✗ Batch from ${i} failed (${saved} already saved):`, error.message);
        process.exit(1);
    }
    saved += batch.length;
}
console.log(`\n✓ ${saved} rows written.`);
