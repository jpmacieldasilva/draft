import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir: './tests/browser',
 timeout: 30000,
 workers: 1,
 globalSetup: './tests/evidence-setup.ts',
 globalTeardown: './tests/evidence-teardown.ts',
 use: { viewport: { width: 1440, height: 1000 }, headless: true, trace: 'retain-on-failure' },
 reporter: [['list'], ['html', { open: 'never' }]],
});
