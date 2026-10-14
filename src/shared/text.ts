// Texts that come from SUNAT, the sheets and the base in CAPITALS («INROPLAS S.A.C.», «ARCHIVO
// NUEVO»), written for people: names with each word capitalized and labels as a sentence. Only a
// text with NO lowercase letter is touched: one someone already wrote with care («ThinkBook
// 16-R5») is left as it is. Codes, acronyms and legal forms stay in capitals. Pure: the mappings
// of every context use it, in the browser or on the server.

/** Kept in capitals wherever they appear. */
const ACRONYMS = new Set(
    [
        'OC OS RUC IGV SUNAT SIRE COMEX DAM DUA PDF XML SPOT SSCO CG BN SOL PLE CPE TI RRHH SAC SA SAA',
        'SRL EIRL SCRL SCR LTDA EI SL LLC INC USA UE EE UU MYPE PEIP PRONIED JJC INROPRIN EPS AFP ONP',
        'SUNARP SBS BCP BBVA IBK DHL UPS TNT HP LG IBM ISO NIU UND KG EA',
    ]
        .join(' ')
        .split(' '),
);
/** Lowercase inside a name (never the first word). */
const CONNECTORS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'o', 'u', 'en', 'para', 'por', 'con', 'a', 'al', 'sin']);

const hasLower = (t: string) => /[a-záéíóúñü]/.test(t);
const bare = (w: string) => w.replace(/[^A-ZÁÉÍÓÚÑÜ0-9]/g, '');

function word(w: string, first: boolean, mode: 'title' | 'sentence'): string {
    const core = bare(w);
    if (!core) return w;
    // Codes (F001, 172-2026, PROY-2025-004) and dotted legal forms (S.A.C., E.I.R.L.) as they are.
    if (/\d/.test(core) || /^([A-ZÑ]\.){2,}[A-ZÑ]?\.?$/.test(w.replace(/[(),;:]/g, ''))) return w;
    const lower = w.toLowerCase();
    // Connectors first: «Y» has no vowel but is not an acronym.
    if (!first && CONNECTORS.has(core.toLowerCase())) return lower;
    if (ACRONYMS.has(core)) return w;
    // No vowel (DHL, SRL, CRV): an acronym nobody listed.
    if (core.length <= 4 && !/[AEIOUÁÉÍÓÚ]/.test(core)) return w;
    if (mode === 'sentence' && !first) return lower;
    // The first letter (after an opening sign like «(» or «"») in capitals, also after a hyphen or a slash.
    return lower.replace(/(^|[-/(«"'])([a-záéíóúñü])/g, (_, p: string, c: string) => p + c.toUpperCase());
}

function tidy(text: string | null | undefined, mode: 'title' | 'sentence'): string {
    const t = (text ?? '').trim().replace(/\s+/g, ' ');
    if (!t || hasLower(t)) return t;
    return t
        .split(' ')
        .map((w, i) => word(w, i === 0, mode))
        .join(' ');
}

/** «INROPLAS S.A.C.» → «Inroplas S.A.C.»; «CORPRISEG LOS HALCONES S.A.C» → «Corpriseg los Halcones S.A.C». */
export const nameCase = (text: string | null | undefined) => tidy(text, 'title');

/** «ARCHIVO NUEVO» → «Archivo nuevo»; «OC NUEVA» → «OC nueva». */
export const sentenceCase = (text: string | null | undefined) => tidy(text, 'sentence');
