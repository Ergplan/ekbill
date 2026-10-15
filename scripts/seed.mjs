#!/usr/bin/env node
// Seed the build's people and businesses (AUTH_MODE=switcher lists them on
// /dev/switch). Run with `npm run seed` (node --import tsx: the seed data and
// the schema are TypeScript). It refuses a database whose name does not say
// dev or test unless this is the build's own instance (AUTH_MODE=switcher,
// sign-in off: test data only, as /api/health says). Stage 4–6 add the demo
// business's customers and bills; Stage 10 the sized load seed.
import { SEED, seedAllowed, seedBuild } from '../packages/db/src/seed.ts';

const url = process.env.DATABASE_URL ?? '';
const { ok, name } = seedAllowed(url);
if (!ok) {
  console.error(
    `seed: refusing to seed "${name || '(no DATABASE_URL)'}": the database name must contain dev or test, or AUTH_MODE must be switcher`,
  );
  process.exit(1);
}
if (process.argv.includes('--dry')) {
  console.log(`seed: would seed ${name} (${SEED.users.length} people, ${SEED.businesses.length} businesses)`);
  process.exit(0);
}
await seedBuild(url);
