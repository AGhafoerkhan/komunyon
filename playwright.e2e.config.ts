import { defineConfig, devices } from '@playwright/test';

if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== 'true'
  || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== 'demo-komunyon') {
  throw new Error('Frontend E2E tests must run against the demo-komunyon Firebase emulators.');
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  reporter: 'list',
  projects: [
    {
      name: 'desktop-chrome-e2e',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:3101',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3101',
    url: 'http://127.0.0.1:3101/login',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
