// Consulta RUC and the SSCO warning (apps-script/inroconta/VistaConsultaRuc.html), end to end.
import { expect, test, type Page } from '@playwright/test';
import { baseData } from '../fixtures/base-data.mts';
import { defaultResponses, openView } from './view-page.mts';

async function openWithBase(page: Page, base = baseData()) {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openView(page, { ...defaultResponses(), datosDeLaBaseVista: { ok: base } });
    await expect(page.locator('#pagina')).toBeVisible();
    return errors;
}

async function consult(page: Page, text: string) {
    await page.locator('button[data-vista="ruc"]').click();
    await page.locator('#rucBuscar').fill(text);
}

test('Resumen warns about received invoices from SSCO suppliers', async ({ page }) => {
    const errors = await openWithBase(page);
    const warning = page.locator('#alertaSsco');

    await expect(warning).toContainText('1 comprobantes recibidos de 1 proveedores sin capacidad operativa (SSCO)');
    await expect(warning).toContainText('1 emitidos después de que su atribución quedó firme');
    await expect(page.locator('#insigniaSsco')).toHaveText('1');

    await page.locator('#verSsco').click();
    await expect(page.locator('#tituloSeccion')).toHaveText('Consulta RUC');
    await expect(page.locator('#rucResultado')).toContainText('E001-45');
    expect(errors).toEqual([]);
});

test('a supplier of ours in the SSCO list: its ficha, the red SSCO box and its invoices', async ({ page }) => {
    await openWithBase(page);
    await consult(page, '20200000002');
    const result = page.locator('#rucResultado');

    await expect(result).toContainText('TRANSPORTES ANDINOS EIRL');
    await expect(result.locator('.chip-rojo')).toHaveText('⚠ Sin capacidad operativa (SSCO)');
    await expect(result).toContainText('NO HABIDO');
    await expect(result).toContainText('Agente de retención');
    await expect(result.locator('.ruc-ssco.mal')).toContainText('firme el 20/08/2026');
    await expect(result).toContainText('1 comprobantes con nosotros');
});

test('a RUC that is not ours but is in the list', async ({ page }) => {
    await openWithBase(page);
    await consult(page, '10002179496');
    const result = page.locator('#rucResultado');

    await expect(result).toContainText('RUIZ CRUZ FIDEL ENRIQUE');
    await expect(result).toContainText('No tenemos comprobantes con este RUC');
    await expect(result.locator('.ruc-ssco.mal')).toBeVisible();
});

test('a supplier that is not in the list gets the green check with the list date', async ({ page }) => {
    await openWithBase(page);
    await consult(page, '20100000001');
    const result = page.locator('#rucResultado');

    await expect(result).toContainText('✓ Buen contribuyente');
    // The list is as of its latest publication (the first RUC of the fixture), not of each row.
    await expect(result.locator('.ruc-ssco.bien')).toContainText('al 30/09/2026');
    await expect(result.locator('.chip-rojo')).toHaveCount(0);
});

test('searching by name offers the matches and opens the chosen one', async ({ page }) => {
    await openWithBase(page);
    await consult(page, 'andinos');

    await page.locator('#rucResultado button[data-ruc="20200000002"]').click();
    await expect(page.locator('#rucBuscar')).toHaveValue('20200000002');
    await expect(page.locator('#rucResultado .ruc-ssco.mal')).toBeVisible();
});

test('without the SSCO tab the page says the list is not loaded and claims nothing', async ({ page }) => {
    const errors = await openWithBase(page, baseData({ ssco: null }));
    await consult(page, '20200000002');

    await expect(page.locator('#rucResultado')).toContainText('Lista SSCO: todavía no cargada');
    await expect(page.locator('#rucResultado .chip-rojo')).toHaveCount(0);
    await expect(page.locator('#alertaSsco')).toBeEmpty();
    expect(errors).toEqual([]);
});
