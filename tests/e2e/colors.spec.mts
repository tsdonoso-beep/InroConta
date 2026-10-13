// The palette sheet (apps-script/inroconta/Colors.html, ?vista=colores) over shared/Styles.html.
import { expect, test } from '@playwright/test';
import { openView } from './view-page.mts';

test('the palette sheet paints every token it lists', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openView(page, {}, 'Colors');

    const swatches = page.locator('.muestra .color');
    expect(await swatches.count()).toBeGreaterThan(20);
    // A token that does not exist in shared/Styles leaves its swatch transparent.
    const unresolved = await page.$$eval('.muestra', (items) =>
        items
            .filter((li) => getComputedStyle(li.querySelector('.color')!).backgroundColor === 'rgba(0, 0, 0, 0)')
            .map((li) => li.querySelector('b')!.textContent),
    );
    expect(unresolved).toEqual([]);
    await expect(page.locator('.muestra code').first()).toHaveText('#006DB1');
    // A color-mix() token (-line) comes back as color(srgb …) in 0–1: read as 0–255 it was #010101.
    await expect(page.locator('.muestra', { hasText: '--primary-line' }).locator('code')).not.toHaveText('#010101');
    expect(errors).toEqual([]);
});
