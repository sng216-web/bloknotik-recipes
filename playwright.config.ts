import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  retries: process.env['CI'] ? 1 : 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4321/bloknotik-recipes/', trace: 'retain-on-failure' },
  webServer: { command: 'npm run preview -- --port 4321 --ignore-lock', url: 'http://127.0.0.1:4321/bloknotik-recipes/', reuseExistingServer: !process.env['CI'] },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }],
});
