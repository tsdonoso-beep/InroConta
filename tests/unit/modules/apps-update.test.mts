// «Is there an update?» for the desktop apps (src/modules/apps): the Tauri target/arch → platform
// mapping, the validation, and checkUpdate() against fake ports (no network, no base).
import { err, ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { checkUpdate, type UpdateRequest } from '../../../src/modules/apps/application/checkUpdate.ts';
import type { DownloadLinker, ReleasePort } from '../../../src/modules/apps/application/ports/ReleasePort.ts';
import type { Release, UpdateQuery } from '../../../src/modules/apps/domain/entities/Release.ts';
import { deviceNameOf, deviceOf, isVersion, platformOf } from '../../../src/modules/apps/domain/policies.ts';

const RELEASE: Release = {
    version: '0.3.0',
    url: 'gdrive://1AbCdEfGhIjKlMnOp',
    sha256: 'a'.repeat(64),
    sizeBytes: 155_000_000,
    signature: 'dW50cnVzdGVk',
    notes: 'Corrige el OCR',
    publishedAt: '2026-10-21T17:00:00+00:00',
    mandatory: false,
};

const REQ: UpdateRequest = {
    app: 'carga-concar',
    version: '0.2.0',
    target: 'windows',
    arch: 'x86_64',
    device: 'b7f1c0de-1234-4abc-9def-0123456789ab',
    deviceName: null,
};

function fakes(answer: Release | null | 'fail' | 'unknown') {
    const asked: UpdateQuery[] = [];
    const port: ReleasePort = {
        async findUpdate(q) {
            asked.push(q);
            if (answer === 'fail') return err({ kind: 'source-failed', message: 'caída' });
            if (answer === 'unknown') return err({ kind: 'not-found', message: 'Aplicación desconocida' });
            return ok(answer);
        },
    };
    const signer: DownloadLinker = {
        link: async (url) => ok({ url: url.replace('gdrive://', 'https://drive.example/'), headers: { Authorization: 'Bearer t' } }),
    };
    return { port, signer, asked };
}

describe('platformOf', () => {
    it('maps Tauri target + arch to aplicacion_version.plataforma', () => {
        expect(platformOf('windows', 'x86_64')).toBe('windows-x64');
        expect(platformOf('windows', 'aarch64')).toBe('windows-arm64');
        expect(platformOf('darwin', 'aarch64')).toBe('macos-arm64');
        expect(platformOf('darwin', 'x86_64')).toBe('macos-x64');
        expect(platformOf('linux', 'x86_64')).toBe('linux-x64');
    });
    it('is null for what the table does not have', () => {
        expect(platformOf('linux', 'aarch64')).toBeNull();
        expect(platformOf('windows', 'i686')).toBeNull();
        expect(platformOf(null, 'x86_64')).toBeNull();
    });
});

describe('inputs', () => {
    it('accepts only x.y.z versions', () => {
        expect(isVersion('1.10.0')).toBe(true);
        expect(isVersion('1.2.3-beta.1')).toBe(false);
        expect(isVersion('{{current_version}}')).toBe(false);
    });
    it('ignores a device id out of 8–100 characters and cleans the PC name', () => {
        expect(deviceOf('corto')).toBeNull();
        expect(deviceOf(' b7f1c0de-1234 ')).toBe('b7f1c0de-1234');
        expect(deviceNameOf('PC-ROSA\n')).toBe('PC-ROSA');
        expect(deviceNameOf('   ')).toBeNull();
    });
});

describe('checkUpdate', () => {
    it('answers the Tauri manifest with the download link and its headers', async () => {
        const f = fakes(RELEASE);
        const out = await checkUpdate(f.port, f.signer, REQ);
        expect(out).toEqual({
            kind: 'update',
            manifest: {
                version: '0.3.0',
                notes: 'Corrige el OCR',
                pub_date: '2026-10-21T17:00:00.000Z',
                url: 'https://drive.example/1AbCdEfGhIjKlMnOp',
                signature: 'dW50cnVzdGVk',
                sha256: 'a'.repeat(64),
                tamano_bytes: 155_000_000,
                obligatoria: false,
                descarga_headers: { Authorization: 'Bearer t' },
            },
        });
        expect(f.asked).toEqual([{ app: 'carga-concar', platform: 'windows-x64', version: '0.2.0', device: REQ.device, deviceName: null }]);
    });

    it('is none when there is nothing newer, or the release has no signature', async () => {
        expect(await checkUpdate(fakes(null).port, fakes(null).signer, REQ)).toEqual({ kind: 'none' });
        const unsigned = fakes({ ...RELEASE, signature: null });
        expect(await checkUpdate(unsigned.port, unsigned.signer, REQ)).toEqual({ kind: 'none' });
    });

    it('rejects bad input without asking the base', async () => {
        const f = fakes(RELEASE);
        expect((await checkUpdate(f.port, f.signer, { ...REQ, version: 'x' })).kind).toBe('bad-request');
        expect((await checkUpdate(f.port, f.signer, { ...REQ, app: 'Carga CONCAR' })).kind).toBe('bad-request');
        expect((await checkUpdate(f.port, f.signer, { ...REQ, arch: 'mips' })).kind).toBe('bad-request');
        expect(f.asked).toHaveLength(0);
    });

    it('passes the base errors on: unknown app is not-found, the rest failed', async () => {
        const u = fakes('unknown');
        expect((await checkUpdate(u.port, u.signer, REQ)).kind).toBe('not-found');
        const d = fakes('fail');
        expect((await checkUpdate(d.port, d.signer, REQ)).kind).toBe('failed');
    });

    it('fails when the download cannot be prepared', async () => {
        const f = fakes(RELEASE);
        const signer: DownloadLinker = { link: async () => err({ kind: 'source-missing', message: 'Falta la cuenta' }) };
        expect(await checkUpdate(f.port, signer, REQ)).toEqual({ kind: 'failed', message: 'Falta la cuenta' });
    });
});
