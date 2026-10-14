// The database from the web app's server: the same robot user the scripts use
// (scripts/local/comun/base.mts), so the app reads through the same row rules (RLS).
// The robot's password never reaches the browser: this module is server-only.
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: Promise<SupabaseClient> | null = null;

function env(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) throw new Error(`Falta la variable de entorno ${name} (Vercel → Settings → Environment Variables, o .env.local).`);
    return v;
}

async function signIn(): Promise<SupabaseClient> {
    const c = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
        auth: { autoRefreshToken: true, persistSession: false },
    });
    const { error } = await c.auth.signInWithPassword({ email: env('ROBOT_CORREO'), password: env('ROBOT_CLAVE') });
    if (error) {
        console.error('[db] robot sign-in failed', { code: error.code, status: error.status, message: error.message });
        throw new Error(`No se pudo entrar a la base: ${error.message}`);
    }
    return c;
}

/** The signed-in robot client, shared by every request of this server instance. */
export function robotClient(): Promise<SupabaseClient> {
    if (!client) {
        client = signIn().catch((e) => {
            client = null; // the next request tries again
            throw e;
        });
    }
    return client;
}
