import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * The browser journeys need the build's people and bills in the database the
 * server uses (the switcher issues their sessions). The repositories run on
 * the server's import conditions (react-server), so the seeding runs in its
 * own Node: tests/e2e/prepare.ts.
 */
export default async function globalSetup() {
  const url = process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5440/ekbill2_dev';
  execFileSync(process.execPath, ['--conditions=react-server', '--import', 'tsx', join(__dirname, 'prepare.ts')], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
