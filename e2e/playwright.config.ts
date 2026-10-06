import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end smoke tests against the PRODUCTION build: mock VMS + built BFF serving the built SPA.
 * Run `pnpm --filter @crm/web build && pnpm --filter @crm/bff build` first.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:8082/crm/', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node ../node_modules/tsx/dist/cli.mjs ../apps/mock-vms/src/server.ts',
      url: 'http://localhost:8090/vms/internal/v1/ping',
      env: { MOCK_LATENCY_MS: '0' },
      reuseExistingServer: true,
    },
    {
      command: 'node dist/server.js',
      cwd: '../apps/bff',
      url: 'http://localhost:8082/crm/api/health',
      env: { APP_ENV: 'local', WEB_DIST: '../web/dist' },
      reuseExistingServer: true,
    },
  ],
});
