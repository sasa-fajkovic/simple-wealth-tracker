import { defineConfig, devices } from '@playwright/test'

/**
 * Runs against the production Hono server serving built web assets, so tests cover
 * both the SPA and API without needing a separate manually-started backend.
 * Set BASE_URL to target an already-running instance.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Start the production server with isolated local test data.
  webServer: {
    command: 'rm -rf .playwright-data && mkdir -p .playwright-data && npm run build && npm --prefix ../server run build && DATA_FILE=$PWD/.playwright-data/database.yaml DATA_POINTS_FILE=$PWD/.playwright-data/datapoints.csv LOGS_DIR=$PWD/.playwright-data/logs WEB_DIST=$PWD/dist PORT=4173 npm --prefix ../server run start',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
