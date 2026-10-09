// The INROCONTA view page, end to end in a browser (see view-page.mts).
import { expect, test } from '@playwright/test';
import { defaultResponses, openView } from './view-page.mts';

test('opens with the fixture data and shows how many documents there are', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openView(page);

    await expect(page.locator('#pagina')).toBeVisible();
    await expect(page.locator('#cargando')).toBeHidden();
    await expect(page.locator('#estadoDocs')).toHaveText('5 comprobantes');
    await expect(page.locator('#tituloSeccion')).toHaveText('Resumen');
    expect(errors).toEqual([]);
});

test('shows the server error instead of the page when the data fails', async ({ page }) => {
    await openView(page, { ...defaultResponses(), datosDeLaVistaEjecutiva: { ok: { error: 'La hoja no trae la columna "Moneda".' } } });

    await expect(page.locator('#error')).toBeVisible();
    await expect(page.locator('#errorTexto')).toHaveText('La hoja no trae la columna "Moneda".');
    await expect(page.locator('#pagina')).toBeHidden();
});

test('the price finder searches by product and by provider', async ({ page }) => {
    await openView(page);
    await page.locator('button[data-vista="precios"]').click();
    const results = page.locator('#resultados');

    await page.locator('#buscar').fill('papel');
    await expect(results).toContainText('PAPEL BOND A4');
    await expect(results).not.toContainText('TONER HP 85A');

    // Both products come from TONER PERU SAC, so the provider's name finds both.
    await page.locator('#buscar').fill('toner peru');
    await expect(results).toContainText('PAPEL BOND A4');
    await expect(results).toContainText('TONER HP 85A');
    await expect(results).not.toContainText('SERVICIO DE TRANSPORTE');
});

test('every section of the menu opens without a script error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openView(page);

    const sections = page.locator('nav button[data-vista]');
    const count = await sections.count();
    expect(count).toBeGreaterThan(5);
    for (let i = 0; i < count; i++) await sections.nth(i).click();
    expect(errors).toEqual([]);
});
