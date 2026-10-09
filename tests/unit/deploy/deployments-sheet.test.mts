// The DESPLIEGUES tab rows (scripts/deploy/deployments-sheet.mts).
import { describe, expect, it } from 'vitest';
import { historyRow, limaDateTime } from '../../../scripts/deploy/deployments-sheet.mts';

describe('limaDateTime', () => {
    it('writes the time in Lima (UTC-5) whatever the zone of the machine', () => {
        expect(limaDateTime(new Date('2026-10-09T19:05:00Z'))).toBe('09/10/2026 14:05');
    });

    it('moves to the previous day before 05:00 UTC', () => {
        expect(limaDateTime(new Date('2026-10-10T03:30:00Z'))).toBe('09/10/2026 22:30');
    });
});

describe('historyRow', () => {
    const deployment = {
        when: new Date('2026-10-09T19:05:00Z'),
        version: 12,
        commit: 'abc1234',
        changes: ['abc1234 feat(view): add the deployments tab', 'def5678 fix(view): totals in soles'],
        description: 'Deployments tab',
        deployedBy: 'Angel Gabriel Crispin Valdivia',
        url: 'https://script.google.com/a/macros/inroprin.com/s/ID/exec',
    };

    it('follows the order of the history header, one change per line', () => {
        expect(historyRow(deployment)).toEqual([
            '09/10/2026 14:05',
            '12',
            'abc1234',
            'abc1234 feat(view): add the deployments tab\ndef5678 fix(view): totals in soles',
            'Deployments tab',
            'Angel Gabriel Crispin Valdivia',
        ]);
    });

    it('says so when a deployment carries no change to the app', () => {
        expect(historyRow({ ...deployment, changes: [] })[3]).toBe('—');
    });
});
