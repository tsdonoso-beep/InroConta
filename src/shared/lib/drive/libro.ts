// The ID of the INROCONTA book, alone in a module without googleapis: the web app needs it on
// every request and loading googleapis costs ~2.7 s on a cold server (measured 13/10/2026).
// servidor.ts re-exports it, so there is still one definition. HOJA_LIBRO_ID changes the book;
// «no» turns it off.
export const LIBRO_ID = (process.env.HOJA_LIBRO_ID?.trim() || '1n_MZD30CQ1b3HZlVCstQZ3giGaE-sKsB5_U3dobtdpE').replace(/^no$/i, '');
