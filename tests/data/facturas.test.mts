// Do all the invoices reach the app? Against the REAL data: the v2 base (what Buscar factura and
// Resumen read since 19/10/2026) and the DETALLE tab of the INROCONTA book (the copy Contabilidad
// sees). `pnpm test:datos`.
//
// Contabilidad saw invoices missing in the old Apps Script view (19/10/2026). Measured that day:
// the tab had all 14 906 documents with XML and their 28 153 lines (nothing cut by pages), and
// lacked the 4 768 of the Registro de Compras whose XML is not downloaded yet (4 128 invoices,
// mostly 2025) or that never have one (DUA/DAM). The tab is built from the XML lines: a document
// without XML has no line, so it never shows. Since then the app builds its lines from the base
// (detail-v2.ts), where a document without XML is one line without item.
//
// The v2 base is a copy (pnpm db:mudanza) until the switch: run this right after copying, or a
// document the robots added to the tab in between shows as «not in the base».
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { documentsFromLines } from '../../src/modules/comprobantes/domain/policies/documents-from-lines.ts';
import { detailFromSheet } from '../../src/modules/comprobantes/infrastructure/detail-sheet.ts';
import { readTabRaw } from '../../src/shared/google/sheets.ts';
import { detailLinesFromV2 } from '../../src/shared/lib/export/detail-v2.ts';
import { readDetailSource } from '../../src/shared/lib/export/detail-v2-read.ts';
import { LIBRO_ID } from '../../src/shared/lib/drive/libro.ts';
import { allPages } from '../../src/shared/supabase/paging.ts';

type Base = {
    origen: string;
    emisor_ruc: string;
    receptor_ruc: string | null;
    tipo: string;
    serie: string;
    numero: string;
    periodo: number | null;
    xml_estado: string;
};

const ready =
    !!process.env.SUPABASE_URL_V2 &&
    !!(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) &&
    !!(process.env.GOOGLE_SA_PRIVATE_KEY || process.env.GOOGLE_SA_KEY_FILE);
const key = (ruc: string, serie: string, numero: string, origin: string) => `${origin}|${ruc}|${serie.toUpperCase()}-${numero.replace(/^0+(?=\d)/, '')}`;
const VISIBLE = ['01', '03', '07', '08']; // invoices, receipts and notes: what Buscar factura lists

let tabLines = 0;
let tabDocs: { key: string; kind: string; period: string }[] = [];
let appDocs: { key: string; kind: string; period: string }[] = [];
let base: (Base & { key: string })[] = [];
let baseItems = 0;

describe.skipIf(!ready)('facturas: la pestaña DETALLE y la base v2', () => {
    beforeAll(async () => {
        const db = createClient(process.env.SUPABASE_URL_V2!, (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!, {
            auth: { persistSession: false },
        });
        const [values, rows, items, source] = await Promise.all([
            readTabRaw(LIBRO_ID, 'COMPROBANTES SUNAT - DETALLE'),
            allPages<Base>(async (from, size) => {
                const { data, error } = await db
                    .from('comprobante')
                    .select('origen,emisor_ruc,receptor_ruc,tipo,serie,numero,periodo,xml_estado')
                    .order('id')
                    .range(from, from + size - 1);
                if (error) throw error;
                return data as Base[];
            }),
            db.from('comprobante_item').select('*', { count: 'exact', head: true }),
            readDetailSource(db, '20512201611'),
        ]);
        if (!values) throw new Error('El libro INROCONTA no tiene la pestaña COMPROBANTES SUNAT - DETALLE.');
        const lines = detailFromSheet(values);
        tabLines = lines.length;
        const asKeys = (docs: ReturnType<typeof documentsFromLines>) =>
            docs.map((d) => ({ key: `${d.origin === 'venta' ? 'EMITIDO' : 'RECIBIDO'}|${d.ruc}|${d.number}`, kind: d.kind, period: d.period }));
        tabDocs = asKeys(documentsFromLines(lines));
        appDocs = asKeys(documentsFromLines(detailLinesFromV2(source)));
        base = rows.map((r) => ({ ...r, key: key(r.emisor_ruc, r.serie, r.numero, r.origen) }));
        baseItems = items.count ?? -1;
    });

    it('la pestaña trae todas sus líneas (ninguna página cortada)', () => {
        expect(tabLines).toBe(baseItems);
    });

    it('ni la app ni la pestaña repiten comprobantes', () => {
        // With its kind: an invoice and its note can share series and number (2 on 19/10/2026).
        for (const docs of [appDocs, tabDocs]) expect(new Set(docs.map((d) => `${d.key}|${d.kind}`)).size).toBe(docs.length);
    });

    it('cada comprobante con XML de la base está en la pestaña', () => {
        const inTab = new Set(tabDocs.map((d) => d.key));
        const missing = base.filter((r) => r.xml_estado === 'OK' && !inTab.has(r.key)).map((r) => r.key);
        expect(missing.slice(0, 20), `${missing.length} con XML no están en la pestaña`).toEqual([]);
    });

    it('cada comprobante de la pestaña está en la base', () => {
        const inBase = new Set(base.map((r) => r.key));
        const extra = tabDocs.filter((d) => !inBase.has(d.key)).map((d) => d.key);
        expect(extra.slice(0, 20), `${extra.length} de la pestaña no están en la base (¿la copia es vieja? pnpm db:mudanza)`).toEqual([]);
    });

    it('por período, la pestaña y la base cuentan los mismos comprobantes con XML', () => {
        const count = (periods: string[]) => periods.reduce<Record<string, number>>((m, p) => ((m[p] = (m[p] ?? 0) + 1), m), {});
        const tab = count(tabDocs.map((d) => d.period));
        const db = count(base.filter((r) => r.xml_estado === 'OK').map((r) => String(r.periodo)));
        expect(tab).toEqual(db);
    });

    // The bug Contabilidad saw: it failed while the app read the tab (4 330 missing, 19/10/2026).
    it('cada factura, boleta y nota del Registro de Compras se ve en la app', () => {
        const inApp = new Set(appDocs.map((d) => d.key));
        const missing = base.filter((r) => VISIBLE.includes(r.tipo) && !inApp.has(r.key));
        const byYear = missing.reduce<Record<string, number>>((m, r) => {
            const y = `${String(r.periodo ?? '?').slice(0, 4)} (${r.xml_estado})`;
            m[y] = (m[y] ?? 0) + 1;
            return m;
        }, {});
        expect(byYear, `${missing.length} no se ven en la app`).toEqual({});
    });

    it('la app tiene cada comprobante de la base, también DUA y DAM', () => {
        expect(appDocs.length).toBe(base.length);
    });
});
