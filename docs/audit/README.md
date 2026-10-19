# The audit pack

Everything an outside auditor needs to judge EkBill v2 without the VM, its services or any secret. Start with `AUDIT-PROMPT.md`.

| Page                                                            | What it is                                                                     | Made by                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------- |
| `AUDIT-PROMPT.md`                                               | The brief: scope, the invariants and where each is enforced, what to send back | Hand                                    |
| `THREAT-MODEL.md`                                               | Assets, actors, boundaries, the deferred security                              | Hand                                    |
| `PERFORMANCE.md`                                                | What was measured, where, and what is still the VM's to measure                | Hand                                    |
| `DATA-MODEL.md`                                                 | Every table: columns, RLS, audit, who may write                                | `npm run audit:pack`                    |
| `TEST-INVENTORY.md`                                             | Every test file and its cases, by kind                                         | `npm run audit:pack`                    |
| `COVERAGE.md`                                                   | Line and branch coverage of the unit and integration runs                      | `npm run audit:coverage`                |
| `DEPENDENCIES.md`                                               | Every runtime dependency, its licence, and `npm audit`                         | `npm run audit:deps`, then `audit:pack` |
| `REVIEWS.md`                                                    | The independent review of each stage (rule 12) and its verdict                 | `npm run audit:pack`                    |
| `FIELD-TRACE.md`, `SCREEN-FLOW.md`, `KNOWN-GAPS.md`, `RULES.md` | Copies of the build's own maps and the GST pack                                | `npm run audit:pack`                    |

`npm run audit:pack:check` fails when a generated page is out of date; the watcher and CI run it.

## Run it from a clean clone

Needs Node 22, npm, and a Postgres 16 with pgvector. Nothing else: no VM, no model, no Twilio, no secret. Every model call in the build goes through a stand-in (`AI_TRANSPORT=fake`).

### 1. An ephemeral Postgres on port 5440

With Docker:

```bash
docker run --rm -d --name ekbill-audit-pg -p 5440:5432 \
  -e POSTGRES_HOST_AUTH_METHOD=trust pgvector/pgvector:pg16
psql -h 127.0.0.1 -p 5440 -U postgres -c 'create database ekbill2_test' -c 'create database ekbill2_dev'
```

Without Docker (Debian/Ubuntu, `postgresql-16` and `postgresql-16-pgvector` installed): `scripts/local-postgres.sh start`.

### 2. The checks, as CI runs them

```bash
git clone <the repository> ekbill && cd ekbill
npm ci
npm run watch -- --once
```

The watcher runs, once, and exits non-zero on the first red:

- lint, format, types
- the unit tests
- drizzle's migration check
- the GST rule pack and its document
- the design tokens, the copy dictionary, the field trace, the screen flow, the generated tests
- this pack's freshness
- the integration tests (they wipe and migrate `ekbill2_test`)

Its status is in `.watch/status.json`.

**Expect one red: `rules:check`.** The 23 entries of the GST rule pack carry `verified: false` until `npm run rules:verify` fetches each official source and confirms its phrases. The build container cannot reach `*.gov.in`, so that waits on the operator's run on the VM (`KNOWN-GAPS.md`). The check is red on that count alone; the pack's structure and dates are checked on every run. Every other check should be green.

### 3. The browser journeys

```bash
DATABASE_URL=postgres://postgres@127.0.0.1:5440/ekbill2_dev npm run db:migrate
npx playwright install chromium     # unless a Chromium is at PLAYWRIGHT_CHROMIUM_PATH
npm run e2e
```

Playwright starts the dev server and the worker itself, seeds the build's people, and walks every journey at 390 px in both themes plus the shell at 1280 px. About ten minutes.

Left out by default:

- **`@slow`**: the load run and the paid-model evals. Run with `SLOW=1`; the evals need a model key.
- **`@otp`**: the phone sign-in, with the tests' code sender: an app started with `AUTH_MODE=otp OTP_FAKE_DIR=/tmp/ekbill-otp`, then `OTP=1 OTP_FAKE_DIR=/tmp/ekbill-otp npx playwright test tests/e2e/otp.spec.ts`; see the `otp` job in `.github/workflows/ci.yml`.

### 4. Coverage, if you want it

```bash
npm run audit:coverage    # writes COVERAGE.md and coverage/ (HTML)
```

## Signing in on a local run

Sign-in is in switcher mode (`AUTH_MODE=switcher`): `http://127.0.0.1:3000/dev/switch` lists the seeded people:

| Person     | Business                         | Role       |
| ---------- | -------------------------------- | ---------- |
| Sharma ji  | Sharma Electricals (regular GST) | Owner      |
| Ravi       | Sharma Electricals               | Staff      |
| Meera (CA) | Sharma Electricals               | Accountant |
| Gupta ji   | Gupta Kirana (composition)       | Owner      |
| Naya owner | None yet (the setup journey)     | —          |

Any phone number may be typed there too, which is why the VM holds test data only (`THREAT-MODEL.md`).
