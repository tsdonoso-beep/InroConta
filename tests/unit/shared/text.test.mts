import { describe, expect, it } from 'vitest';
import { nameCase, sentenceCase } from '../../../src/shared/text.ts';

describe('nameCase', () => {
    it('capitalizes names and keeps legal forms, codes and acronyms', () => {
        expect(nameCase('INROPLAS S.A.C.')).toBe('Inroplas S.A.C.');
        expect(nameCase('CORPRISEG LOS HALCONES S.A.C')).toBe('Corpriseg los Halcones S.A.C');
        expect(nameCase('DHL EXPRESS PERU SAC')).toBe('DHL Express Peru SAC');
        expect(nameCase('NUEVOS PRODUCTOS DE ACERO INOXIDABLE SOCIEDAD ANONIMA CERRADA - NUPROINOX S.A.C.')).toBe(
            'Nuevos Productos de Acero Inoxidable Sociedad Anonima Cerrada - Nuproinox S.A.C.',
        );
        expect(nameCase('PROY-2025-004-01 PEIP - JJC PAQ 05')).toBe('PROY-2025-004-01 PEIP - JJC Paq 05');
        expect(nameCase('GEYDI PRADO')).toBe('Geydi Prado');
        expect(nameCase('AUTOMATIZACIÓN Y PROYECTOS S.A.C.')).toBe('Automatización y Proyectos S.A.C.');
    });

    it('leaves alone a text that already has lowercase letters', () => {
        expect(nameCase('ThinkBook 16-R5-16GB Unificada')).toBe('ThinkBook 16-R5-16GB Unificada');
        expect(nameCase('Ingram Micro S.A.C.')).toBe('Ingram Micro S.A.C.');
        expect(nameCase('')).toBe('');
        expect(nameCase(null)).toBe('');
    });
});

describe('sentenceCase', () => {
    it('writes a label as a sentence', () => {
        expect(sentenceCase('ARCHIVO NUEVO')).toBe('Archivo nuevo');
        expect(sentenceCase('OC NUEVA')).toBe('OC nueva');
        expect(sentenceCase('LEGAJO COMPLETO')).toBe('Legajo completo');
        expect(sentenceCase('SERVICIOS PROFESIONALES')).toBe('Servicios profesionales');
    });
});
