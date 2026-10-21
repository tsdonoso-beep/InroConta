// «Is there an update?» against the v2 base: buscar_actualizacion() (008_aplicaciones.sql) notes
// that the PC asked (aplicacion_equipo) and returns the newest release of its platform and channel.
import 'server-only';
import { err, ok, type Result } from 'neverthrow';
import type { SourceError } from '../../../shared/errors.ts';
import { serviceClient } from '../../../shared/supabase/service.ts';
import type { ReleasePort } from '../application/ports/ReleasePort.ts';
import type { Release, UpdateQuery } from '../domain/entities/Release.ts';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));

export function releaseOf(r: Row): Release | null {
    if (r.hay !== true) return null;
    const size = Number(r.tamano_bytes);
    return {
        version: s(r.version),
        url: s(r.url),
        sha256: s(r.sha256),
        sizeBytes: Number.isFinite(size) && size > 0 ? size : null,
        signature: r.firma ? s(r.firma) : null,
        notes: r.notas ? s(r.notas) : null,
        publishedAt: s(r.publicada_en) || new Date().toISOString(),
        mandatory: r.obligatoria === true,
    };
}

export class SupabaseReleaseAdapter implements ReleasePort {
    async findUpdate(q: UpdateQuery): Promise<Result<Release | null, SourceError>> {
        try {
            const { data, error } = await serviceClient().rpc('buscar_actualizacion', {
                p_aplicacion: q.app,
                p_plataforma: q.platform,
                p_version: q.version,
                p_equipo: q.device,
                p_nombre_equipo: q.deviceName,
            });
            if (error) {
                // Logged disarmed: a PostgrestError printed whole shows {}.
                console.error('[db] buscar_actualizacion failed', { code: error.code, message: error.message, details: error.details });
                // The function raises «Aplicación desconocida» for a code that is not in aplicacion.
                if (/desconocida/i.test(error.message ?? '')) return err({ kind: 'not-found', message: `Aplicación desconocida: ${q.app}` });
                return err({ kind: 'source-failed', message: 'No se pudo consultar las actualizaciones.' });
            }
            return ok(data && typeof data === 'object' ? releaseOf(data as Row) : null);
        } catch (e) {
            console.error('[db] buscar_actualizacion threw', e);
            return err({ kind: 'source-failed', message: 'No se pudo consultar las actualizaciones.' });
        }
    }
}
