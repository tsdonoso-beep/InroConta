// How the app writes money, counts and months: the same as the Apps Script view
// (dinero, miles, etqMes in VistaEjecutivaPagina.html), so both read alike.

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

export const symbol = (currency: string) => (currency === 'PEN' ? 'S/' : currency === 'USD' ? 'US$' : currency === 'EUR' ? '€' : currency);

/** «S/ 1,234.56»; `short` gives «S/ 12 mil» or «S/ 1.2 M» for charts. */
export function money(n: number, currency = 'PEN', short = false): string {
    const s = symbol(currency);
    const sign = n < 0 ? '-' : '';
    const a = Math.abs(n);
    if (short && a >= 1e6) return `${sign}${s} ${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)} M`;
    if (short && a >= 1e4) return `${sign}${s} ${Math.round(a / 1e3)} mil`;
    const [int, dec] = a.toFixed(2).split('.');
    return `${sign}${s} ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`;
}

export const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);

/** «202609» → «set 26». */
export const monthLabel = (p: string) => (/^\d{6}$/.test(p) ? `${MONTHS[Number(p.slice(4)) - 1]} ${p.slice(2, 4)}` : p || '—');

/** An ISO instant in Lima time: «13 de octubre, 10:26». */
export function limaDateTime(iso: string): string {
    return new Intl.DateTimeFormat('es-PE', {
        timeZone: 'America/Lima',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(new Date(iso));
}

export const driveFile = (id: string) => `https://drive.google.com/file/d/${id}/view`;

/** Text without accents, in capitals: what the finders compare («cámara» finds «CAMARA»). */
export const plain = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** The words of a search, at least `min` letters each, in plain(). */
export const words = (q: string, min = 2) =>
    plain(q)
        .split(/\s+/)
        .filter((w) => w.length >= min);

/** «2026-09-12…» → «12/09/2026»; anything else as it comes. */
export function dmy(iso: string | null | undefined): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? '');
}

/** An ISO instant as «12/09 08:20», in Lima time. */
export function dayTime(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const p = Object.fromEntries(
        new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
            .formatToParts(d)
            .map((x) => [x.type, x.value]),
    );
    return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}

export const driveFolder = (id: string) => `https://drive.google.com/drive/folders/${id}`;
