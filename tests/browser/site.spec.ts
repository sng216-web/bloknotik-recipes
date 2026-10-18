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
    category: 'soups', categoryTitle: 'Супы', href: '/bloknotik-recipes/recipes/synthetic-browser-only/',
    image: '/bloknotik-recipes/images/soup-demo.webp', searchText: 'Тёплый суп овощи',
  }] }));
  await page.goto('search/?q=ТЕПЛЫЙ');
  await expect(page.locator('#search-results article')).toHaveCount(1);
  await expect(page.locator('#search-results h2')).toContainText('<img src=x');
  await expect(page.locator('#search-results h2 img')).toHaveCount(0);
  await page.getByLabel('Категория', { exact: true }).selectOption('salads');
  await expect(page.getByRole('status')).toContainText('Ничего не нашли');
});

test('failed or malformed search responses remain recoverable and never cause input exceptions', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  for (const response of [{ status: 500, body: 'Unavailable' }, { json: {} }, { json: [{ title: 'Incomplete' }] }]) {
    await page.route('**/search-index.json', (route) => route.fulfill(response));
    await page.goto('search/');
    await expect(page.getByRole('status')).toContainText('Не удалось загрузить поиск');
    await page.getByLabel('Название или ингредиент').fill('тест');
    await page.getByRole('button', { name: 'Найти' }).click();
    await expect(page.getByRole('status')).toContainText('Не удалось загрузить поиск');
    await page.unroute('**/search-index.json');
  }
  expect(errors).toEqual([]);
});

test('real local HTTP routes, XML content types and missing-page status behave correctly', async ({ request, page }) => {
  for (const route of ['', 'categories/', 'categories/soups/', 'about/', 'search/', 'demo/ovoshchnoy-salat/']) {
    const response = await request.get(route || './'); expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
  }
  for (const route of ['rss.xml', 'sitemap.xml']) {
    const response = await request.get(route); expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/(?:application|text)\/(?:rss\+)?xml/);
  }
  expect((await request.get('robots.txt')).headers()['content-type']).toContain('text/plain');
  expect((await request.get('recipes/not-a-real-recipe/')).status()).toBe(404);
  await page.goto('404.html');
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex, follow');
});

test('small phones and tablets have no horizontal overflow and keyboard users can skip navigation', async ({ page }) => {
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['', 'categories/', 'demo/domashniy-sup/', 'search/']) {
      await page.goto(route || './');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await page.goto('./'); await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Перейти к содержимому' })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('#main')).toBeFocused();
});
