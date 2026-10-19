// The v2 base (docs/database/v2/) from the web app's server, with the secret key: the base has RLS
// on and no policies, so only the service role reads it (009_acceso.sql). The key never reaches
// the browser: this module is server-only.
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

function env(...names: string[]): string {
    for (const name of names) {
        const v = process.env[name]?.trim();
        if (v) return v;
    }
    throw new Error(`Falta la variable de entorno ${names.join(' o ')} (Vercel → Settings → Environment Variables, o .env.local).`);
}

/** The service client, shared by every request of this server instance (it has no session to renew). */
export function serviceClient(): SupabaseClient {
    client ??= createClient(env('SUPABASE_URL_V2'), env('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'), {
        auth: { autoRefreshToken: false, persistSession: false },
    });
    return client;
}
