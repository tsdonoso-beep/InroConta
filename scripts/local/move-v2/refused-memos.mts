// A petty cash with an advance needs its box (memo's last check in v2 006_viaticos.sql). The old
// base has four without one (CCH-00001/2/3/6, 21/10/2026): sent, v2 refused them and their persons
// and expenses, and every refusal left a pooled connection aborted (25P02) until a write that does
// not retry fell on one (22/10/2026). They, and what hangs from them, go to dato_sin_ubicar
// instead of being sent.
import type { Notes, Row } from './helpers.mts';

/** The tables whose rows point to a memo (memo_id). */
const CHILDREN = ['memo_persona', 'memo_autorizacion', 'planilla_movilidad', 'gasto', 'liquidacion_memo', 'pago', 'devolucion'];

export function withoutRefusedMemos<T extends Record<string, Row[]>>(v: T, notes: Notes): T {
    const refused = new Set<string>();
    const memo = v.memo.filter((m) => {
        if (m.tipo !== 'CAJA_CHICA' || m.caja_chica_id || !(Number(m.monto_autorizado) > 0)) return true;
        refused.add(String(m.id));
        notes.keep('memo: caja chica con adelanto y sin caja (la v2 lo rechaza)', 'memos', m);
        return false;
    });
    if (!refused.size) return v;
    const out: Record<string, Row[]> = { ...v, memo };
    for (const table of CHILDREN)
        out[table] = (v[table] ?? []).filter((r) => {
            if (!refused.has(String(r.memo_id))) return true;
            notes.keep(`${table}: de un memo que la v2 rechaza`, table, r);
            return false;
        });
    return out as T;
}
