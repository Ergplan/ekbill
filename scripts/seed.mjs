#!/usr/bin/env node
// Seed people and businesses for the build (AUTH_MODE=switcher lists them on
// /dev/switch). Stage 0: nothing to seed; the tables arrive in Stage 2, the
// demo business (Sharma Electricals) in Stage 4–6, and the sized load seed in
// Stage 10. It refuses a database whose name does not say dev or test.
const url = process.env.DATABASE_URL ?? '';
const name = url.split('/').pop()?.split('?')[0] ?? '';
if (!/dev|test/.test(name)) {
  console.error(`seed: refusing to seed "${name || '(no DATABASE_URL)'}": the database name must contain dev or test`);
  process.exit(1);
}
console.log(`seed: nothing to seed yet for ${name} (tables arrive in Stage 2)`);
