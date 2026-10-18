import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('home is honest about publications, responsive, accessible and has working navigation', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Простые продукты');
  await expect(page.getByRole('heading', { name: 'Первые рецепты ещё готовятся' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(violations.map((item) => ({ id: item.id, targets: item.nodes.map((node) => node.target) }))).toEqual([]);
  await page.locator('img').evaluateAll((images) => Promise.all(images.map(async (image) => {
    if (image instanceof HTMLImageElement) { image.loading = 'eager'; await image.decode(); }
  })));
  await page.screenshot({ path: `test-results/home-${testInfo.project.name}.png`, fullPage: true });
  if (testInfo.project.name === 'mobile') {
    await page.getByLabel('Открыть меню').click();
    await page.getByRole('navigation', { name: 'Мобильная навигация' }).getByRole('link', { name: 'Рецепты и категории' }).click();
  } else await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: 'Рецепты', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Что будем готовить?');
  expect(errors).toEqual([]);
});

test('demo recipe cannot masquerade as a publication and works on narrow screens', async ({ page }) => {
  await page.goto('demo/ovoshchnoy-salat/');
  await expect(page.getByText('Демонстрационная страница', { exact: true })).toBeVisible();
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex, follow');
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  await page.getByRole('link', { name: 'К шагам приготовления ↓' }).click();
  await expect(page.getByRole('heading', { name: 'Готовим шаг за шагом' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations.map((item) => ({ id: item.id, targets: item.nodes.map((node) => node.target) }))).toEqual([]);
});

test('search fetches only the publication index and explains an empty catalog', async ({ page }) => {
  await page.goto('search/');
  await expect(page.getByRole('status')).toContainText('Опубликованных рецептов пока нет');
  await page.getByLabel('Название или ингредиент').fill('овощи');
  await expect(page.locator('#search-results article')).toHaveCount(0);
});

test('search filters Russian input and never renders index text as HTML', async ({ page }) => {
  // The response is mocked only in the browser test, never added to site content.
  await page.route('**/search-index.json', async (route) => route.fulfill({ json: [{
    title: '<img src=x onerror=alert(1)> Тестовый суп', description: 'Synthetic browser fixture only',
    category: 'soups', categoryTitle: 'Супы', href: '/bloknotik-recipes/demo/domashniy-sup/',
    image: '/bloknotik-recipes/images/soup-demo.webp', searchText: 'Тёплый суп овощи',
  }] }));
  await page.goto('search/?q=ТЕПЛЫЙ');
  await expect(page.locator('#search-results article')).toHaveCount(1);
  await expect(page.locator('#search-results h2')).toContainText('<img src=x');
  await expect(page.locator('#search-results h2 img')).toHaveCount(0);
  await page.getByLabel('Категория', { exact: true }).selectOption('salads');
  await expect(page.getByRole('status')).toContainText('Ничего не нашли');
});
