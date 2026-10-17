import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Two projects: unit tests need nothing; integration tests need the local
 * Postgres (scripts/local-postgres.sh) and run in one worker against one
 * database, reset by the global setup.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@ekbill/engine': here('./packages/engine/src/index.ts'),
      '@ekbill/copy/server': here('./packages/copy/src/server.ts'),
      '@ekbill/copy/provider': here('./packages/copy/src/provider.tsx'),
      '@ekbill/copy': here('./packages/copy/src/index.ts'),
      '@ekbill/db/migrate': here('./packages/db/migrate.mjs'),
      '@ekbill/db': here('./packages/db/src/index.ts'),
      '@ekbill/ai': here('./packages/ai/src/index.ts'),
      '@ekbill/render': here('./packages/render/src/index.ts'),
      '@ekbill/ui': here('./packages/ui/src/index.ts'),
      'server-only': here('./tests/stubs/server-only.ts'),
    },
  },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts', 'packages/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          globalSetup: ['./tests/global-setup.ts'],
          pool: 'forks',
          maxWorkers: 1,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
