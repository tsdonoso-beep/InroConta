// urlState (src/app/(app)/_lib/url-state.ts): what a screen writes in the URL and how it reads a
// shared link back. Without a browser: a minimal window with location and history.
import { beforeEach, describe, expect, it } from 'vitest';
import { urlState } from '../../../src/app/(app)/_lib/url-state.ts';

let url = new URL('https://app.test/legajo');
const fakeWindow = {
    location: {
        get pathname() {
            return url.pathname;
        },
        get search() {
            return url.search;
        },
    },
    history: {
        state: { __NA: true },
        replaceState: (_s: unknown, _t: string, next: string) => {
            url = new URL(next, url);
        },
    },
    addEventListener: () => {},
    removeEventListener: () => {},
};
(globalThis as { window?: unknown }).window = fakeWindow;

const open = (path: string) => {
    url = new URL(path, 'https://app.test');
};
const make = () =>
    urlState(
        { state: 'INC', sort: 'base', text: '', page: '1', pageOther: '1' },
        { state: 'estado', sort: 'orden', text: 'texto', page: 'pag', pageOther: 'pag_otra' },
        { state: ['INC', 'OK', ''], sort: ['base', 'oc'] },
    );

describe('urlState', () => {
    beforeEach(() => open('/legajo'));

    it('writes only what differs from the default, keeping the other parameters', () => {
        open('/legajo?per=m202609');
        make().set({ state: 'OK', text: 'dhl' });
        expect(url.search).toBe('?per=m202609&estado=OK&texto=dhl');
    });
    it('keeps an empty value when the default is not empty («Todas»)', () => {
        make().set({ state: '' });
        expect(url.searchParams.get('estado')).toBe('');
    });
    it('reads a shared link and drops the values it does not know', () => {
        open('/legajo?estado=OK&orden=nada&pag=3');
        const s = make();
        s.set({ text: 'x' });
        // The page goes back to 1 (a filter changed) and the unknown order to its default.
        expect(url.search).toBe('?estado=OK&texto=x');
    });
    it('goes back to page 1 when a filter changes, not when a page does', () => {
        const s = make();
        s.set({ page: '4', pageOther: '2' });
        expect(url.search).toBe('?pag=4&pag_otra=2');
        s.set({ pageOther: '3' });
        expect(url.search).toBe('?pag=4&pag_otra=3');
        s.set({ sort: 'oc' });
        expect(url.search).toBe('?orden=oc');
    });
    it('resets everything to the defaults', () => {
        const s = make();
        s.set({ state: 'OK', text: 'a' });
        s.reset();
        expect(url.search).toBe('');
    });
});
