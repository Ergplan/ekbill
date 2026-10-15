import { existsSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

/**
 * Browser journeys. Phone first (390px, the design pack's width), both
 * themes; the shell also at 1280px. Tagged @slow tests (load, paid models)
 * are excluded unless SLOW=1.
 */
// The VM image and this container carry a Chromium; CI installs Playwright's own.
const candidates = [
  process.env.PLAYWRIGHT_CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
];
const chromium = candidates.find((p) => p && existsSync(p));
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: 'tests/e2e',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  timeout: 60_000,
  expect: { timeout: 10_000, toHaveScreenshot: { threshold: 0.1, maxDiffPixelRatio: 0.005 } },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  grepInvert: process.env.SLOW ? undefined : /@slow/,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '.watch/playwright-report' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    launchOptions: {
      ...(chromium ? { executablePath: chromium } : {}),
      // The fake camera lets the live-camera sheet (laptops) be walked without a webcam or a permission prompt.
      args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  projects: [
    {
      name: 'phone',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
      grepInvert: /@desktop/,
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } },
      grep: /@desktop/,
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run dev', url: `${baseURL}/api/health`, reuseExistingServer: true, timeout: 120_000 },
});
