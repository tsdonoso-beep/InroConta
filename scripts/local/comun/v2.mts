// Dual write (22/10/2026): every robot that saves to the old base calls the same write function,
// with the same JSON, on the v2 base too (docs/database/v2/004_escrituras_comprobantes.sql). The
// old base stays the one the robots read and the one that must not fail; a v2 write that fails
// only warns, and the nightly move (db:mudanza, which adopts these rows' ids) fills the gap.
// Without SUPABASE_URL_V2 and its key nothing is sent: a laptop or workflow not set up yet runs
// as before. The DETALLE tab is published from v2 when it can (detailFromV2).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { detailLinesFromV2 } from '../../../src/shared/lib/export/detail-v2.ts';
import { readDetailSource } from '../../../src/shared/lib/export/detail-v2-read.ts';
import type { FilaDetalleCpe } from '../../../src/shared/lib/export/items-sunat.ts';
import { RUC } from './config.mts';

let client: SupabaseClient | null | undefined;

function v2(): SupabaseClient | null {
    if (client !== undefined) return client;
    const url = process.env.SUPABASE_URL_V2?.trim();
    const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
    client = url && key ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
    if (!client) console.log('· v2: sin SUPABASE_URL_V2 / SUPABASE_SECRET_KEY, solo se guarda en la base vieja');
    return client;
}

const transient = (e: { code?: string; message?: string }) =>
    e.code === '57014' || e.code === '25P02' || /fetch failed|network|timeout|ECONNRESET|ETIMEDOUT|502|503|504|520|522/i.test(e.message ?? '');

/**
 * The DETALLE tab's lines built from v2, as the web app builds them (detail-v2.ts): a document
 * without XML now has its line too. null without v2 or when the read fails: the robot then
 * publishes from the old base as before.
 */
export async function detailFromV2(): Promise<FilaDetalleCpe[] | null> {
    const c = v2();
    if (!c) return null;
    try {
        return detailLinesFromV2(await readDetailSource(c, RUC));
    } catch (e) {
        const p = e as { code?: string; message?: string };
        console.log(`⚠ v2: no se pudo leer el detalle (${p.code ?? ''} ${p.message ?? e}); se publica desde la base vieja`);
        return null;
    }
}

/** Calls `fn` on v2 with `args`; never throws. Returns false when it could not be saved there. */
export async function alsoInV2(fn: string, args: Record<string, unknown>): Promise<boolean> {
    const c = v2();
    if (!c) return true;
    for (let attempt = 1; ; attempt++) {
        const { error } = await c.rpc(fn, args);
        if (!error) return true;
        if (attempt < 4 && transient(error)) {
            await new Promise((r) => setTimeout(r, 2000 * attempt));
            continue;
        }
        // No `details`: Postgres puts the refused row there, and the Actions log is public.
        const msg = `v2: ${fn} no se guardó (${error.code ?? ''} ${error.message}); la mudanza lo copiará`;
        console.log(process.env.CI ? `::warning::${msg}` : `⚠ ${msg}`);
        return false;
    }
}
