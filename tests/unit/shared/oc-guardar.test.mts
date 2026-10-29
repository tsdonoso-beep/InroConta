// guardar_calculos_oc again when the base cut it by time (scripts/local/oc/guardar.mts): the nacional
// save failed on 27 and 28/10/2026 with «canceling statement due to statement timeout».
import { describe, expect, it, vi } from 'vitest';
import type { Base } from '../../../scripts/local/oc/base.mts';
import { RETRY_WAITS_MS, saveCalculations } from '../../../scripts/local/oc/guardar.mts';

const TIMEOUT = { message: 'canceling statement due to statement timeout', code: '57014' };
const nothing = { vinculos: [], sinOc: [], ordenes: [], carpetas: [], reglas: [] };

/** A base whose rpc answers each call with the next reply. */
function base(...replies: Array<{ data?: unknown; error?: unknown }>) {
    const rpc = vi.fn(async () => replies.shift() ?? { data: null, error: { message: 'no more replies' } });
    return { sb: { rpc } as unknown as Base, rpc };
}

describe('saveCalculations', () => {
    it('sends it again after a timeout and returns what the base answered', async () => {
        const { sb, rpc } = base({ error: TIMEOUT }, { data: { vinculos: 3 }, error: null });
        const wait = vi.fn(async () => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        await expect(saveCalculations(sb, '20512201611', nothing, true, wait)).resolves.toEqual({ vinculos: 3 });
        expect(rpc).toHaveBeenCalledTimes(2);
        expect(wait).toHaveBeenCalledWith(RETRY_WAITS_MS[0]);
    });

    it('gives up after the last wait', async () => {
        const { sb, rpc } = base(...RETRY_WAITS_MS.map(() => ({ error: TIMEOUT })), { error: TIMEOUT });
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        await expect(saveCalculations(sb, '20512201611', nothing, true, async () => {})).rejects.toThrow(/statement timeout/);
        expect(rpc).toHaveBeenCalledTimes(RETRY_WAITS_MS.length + 1);
    });

    it('does not retry any other error', async () => {
        const { sb, rpc } = base({ error: { message: 'violates foreign key constraint' } });
        const wait = vi.fn(async () => {});

        await expect(saveCalculations(sb, '20512201611', nothing, true, wait)).rejects.toThrow(/foreign key/);
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(wait).not.toHaveBeenCalled();
    });
});
