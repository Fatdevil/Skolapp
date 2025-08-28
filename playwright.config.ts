import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 45000,
  use: { headless: true, screenshot: 'only-on-failure' },
  reporter: [['list'], ['html', { open: 'never' }]],
});
