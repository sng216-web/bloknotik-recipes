import { test, expect } from '@playwright/test';

test('editorial shell contains no material when private authentication is unavailable', async ({ page }) => {
  await page.goto('redakciya/');
  await expect(page.locator('#notice')).not.toHaveText('Проверяем доступ…');
  await expect(page.locator('#workspace')).toBeHidden();
  await expect(page.locator('#title')).toHaveText('');
  await expect(page.locator('#images img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Одобрить и опубликовать', includeHidden: true })).toBeDisabled();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});
