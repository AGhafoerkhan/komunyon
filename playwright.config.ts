import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/cards',
  fullyParallel: true,
  reporter: 'list',
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['iPhone 13'], browserName: 'chromium', channel: 'chrome' },
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100/dev/card-fixtures',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
