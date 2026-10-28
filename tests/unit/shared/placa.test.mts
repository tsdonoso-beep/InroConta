// The vehicle plate of an invoice (src/shared/lib/sunat/placa.ts): the rules of Carga CONCAR
// (src/glosa.py) over a text, and where the XML carries it (property 7000, notes, descriptions).
import { describe, expect, it } from 'vitest';
import { leerComprobanteXml } from '../../../src/shared/lib/sunat/cpe-xml.ts';
import { claveDePlaca, esCombustible, placaDe, placasEnTexto } from '../../../src/shared/lib/sunat/placa.ts';

describe('placasEnTexto', () => {
    it('reads the plate next to the word PLACA, with or without the dash, and the O read for a 0', () => {
        expect(placasEnTexto('DIESEL B5 S50 PLACA: abc123')).toEqual(['ABC123']);
        expect(placasEnTexto('Placa N° CFY-7O8')).toEqual(['CFY708']);
        expect(placasEnTexto('PEAJE PLACA A1B 234')).toEqual(['A1B234']);
    });
    it('reads the ABC-123 form without the word, but not RUC-123 nor a series', () => {
        expect(placasEnTexto('GASOHOL 90 - BZA-857')).toEqual(['BZA857']);
        expect(placasEnTexto('RUC-123 IGV-018')).toEqual([]);
        expect(placasEnTexto('F001-123')).toEqual([]);
        expect(placasEnTexto(null, '', undefined)).toEqual([]);
    });
    it('gives each plate once, the labelled ones first', () => {
        expect(placasEnTexto('BZA-857', 'PLACA CFY798', 'BZA-857')).toEqual(['CFY798', 'BZA857']);
    });
    it('makes a search key without the dash', () => {
        expect(claveDePlaca(' abc-123 ')).toBe('ABC123');
    });
});

describe('placaDe', () => {
    it('trusts the 7000 property, then the notes and the descriptions', () => {
        expect(placaDe({ propiedades: ['ABC-123'], notas: ['PLACA D4E567'], descripciones: ['DIESEL'] })).toBe('ABC123 / D4E567');
        expect(placaDe({ propiedades: [], notas: [], descripciones: ['GASOHOL 90 PLACA BZA857'] })).toBe('BZA857');
        expect(placaDe({ propiedades: ['-'], notas: [], descripciones: [] })).toBe('');
    });
});

describe('leerComprobanteXml: the plate', () => {
    const xml = (line: string, note = '') => `<?xml version="1.0"?>
<Invoice xmlns:cbc="urn:cbc" xmlns:cac="urn:cac">
  <cbc:ID>F001-123</cbc:ID><cbc:IssueDate>2026-10-20</cbc:IssueDate>${note}
  <cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="GLL">10</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>150.00</cbc:LineExtensionAmount>
    <cac:Item>${line}</cac:Item>
  </cac:InvoiceLine>
</Invoice>`;

    it('comes from the 7000 property of the item', () => {
        const prop =
            '<cbc:Description>DIESEL B5 S50</cbc:Description><cac:AdditionalItemProperty><cbc:Name>Gastos Art. 37 Renta: Número de Placa</cbc:Name><cbc:NameCode>7000</cbc:NameCode><cbc:Value>ABC-123</cbc:Value></cac:AdditionalItemProperty>';
        expect(leerComprobanteXml(xml(prop)).placa).toBe('ABC123');
    });
    it('comes from a note or the description, and is null when there is none', () => {
        expect(leerComprobanteXml(xml('<cbc:Description>DIESEL</cbc:Description>', '<cbc:Note>PLACA: D4E-567</cbc:Note>')).placa).toBe('D4E567');
        expect(leerComprobanteXml(xml('<cbc:Description>GASOHOL 90 PLACA BZA857</cbc:Description>')).placa).toBe('BZA857');
        expect(leerComprobanteXml(xml('<cbc:Description>TONER HP</cbc:Description>')).placa).toBeNull();
    });
});

describe('esCombustible', () => {
    it('is fuel by the gallon or by what it says', () => {
        expect([
            esCombustible('X', 'GLL'),
            esCombustible('Diésel B5 S50'),
            esCombustible('GASOHOL 95 PLUS'),
            esCombustible('GLP'),
            esCombustible('TONER HP', 'NIU'),
        ]).toEqual([true, true, true, true, false]);
    });
});
