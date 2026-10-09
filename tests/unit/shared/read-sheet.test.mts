// The .xlsx reader (src/shared/lib/xlsx/read-sheet.ts), on the XML it parses.
import { describe, expect, it } from 'vitest';
import { columnIndex, decodeXml, excelSerialToIso, parseSharedStrings, parseSheet } from '../../../src/shared/lib/xlsx/read-sheet.ts';

describe('parseSharedStrings', () => {
    it('reads plain and rich-text strings, decoding entities', () => {
        const xml =
            '<sst><si><t>RUC</t></si><si><r><t>Raz</t></r><r><t xml:space="preserve">ón social</t></r></si><si><t>A &amp; B &lt;S.A.C.&gt;</t></si></sst>';
        expect(parseSharedStrings(xml)).toEqual(['RUC', 'Razón social', 'A & B <S.A.C.>']);
    });
});

describe('columnIndex', () => {
    it('turns column letters into a 0-based index', () => {
        expect([columnIndex('A1'), columnIndex('I767'), columnIndex('Z2'), columnIndex('AA3'), columnIndex('AB12')]).toEqual([0, 8, 25, 26, 27]);
    });
});

describe('parseSheet', () => {
    const shared = ['RUC', 'Nombre'];

    it('reads shared strings, numbers and inline strings', () => {
        const xml =
            '<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
            '<row r="2"><c r="A2"><v>20512201611</v></c><c r="B2" t="inlineStr"><is><t>ROLAND</t></is></c></row></sheetData>';
        expect(parseSheet(xml, shared)).toEqual([
            ['RUC', 'Nombre'],
            ['20512201611', 'ROLAND'],
        ]);
    });

    it('keeps each value in its column when cells are skipped', () => {
        const xml = '<row r="1"><c r="A1"><v>1</v></c><c r="D1"><v>4</v></c></row><row r="2"><c r="B2"/><c r="C2"><v>3</v></c></row>';
        expect(parseSheet(xml, [])).toEqual([
            ['1', '', '', '4'],
            ['', '', '3'],
        ]);
    });
});

describe('excelSerialToIso', () => {
    it('turns an Excel date serial into an ISO date', () => {
        expect(excelSerialToIso('46295')).toBe('2026-09-30');
        expect(excelSerialToIso('45657')).toBe('2024-12-31');
    });

    it('returns empty for what is not a date', () => {
        expect(['', ' ', 'abc', '0', '-5'].map(excelSerialToIso)).toEqual(['', '', '', '', '']);
    });
});

describe('decodeXml', () => {
    it('decodes numeric references too', () => {
        expect(decodeXml('N.&#186; 254 &#x2013; SUNAT')).toBe('N.º 254 – SUNAT');
    });
});
