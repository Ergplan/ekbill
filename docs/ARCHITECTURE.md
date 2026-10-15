# Architecture

EkBill v2 is an npm-workspaces monorepo. The master prompt (`docs/MASTER-PROMPT.md`) is the specification; this document describes what exists.

## Components

| Component   | Path              | What it is                                                                                                                                                                                               |
| ----------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web app     | `apps/web`        | Next.js 16 App Router, React 19. Screens, server actions (writes), route handlers (files, health). No business rules.                                                                                    |
| Worker      | `apps/worker`     | pg-boss on the same Postgres. Stage 0: a heartbeat queue. Later: read-bill, render-other-sizes, index-search, reminders-due, backup-check.                                                               |
| Engine      | `packages/engine` | Pure, deterministic: money, tax, rule pack, document types, numbering, workings. ESLint forbids `node:`, `pg`, drizzle, `@ekbill/ai`, `fetch`, `Date.now`, `Math.random` here.                           |
| Database    | `packages/db`     | Drizzle schema (`src/schema.ts`), plain SQL migrations (`migrations/NNNN_*.sql`) applied by `migrate.mjs` under an advisory lock, repositories (Stage 2 onward). The one place that writes the database. |
| Models      | `packages/ai`     | Every model call: typed input/output, versioned prompts, retries, timeouts, one `ai_calls` row per call (Stage 7 onward).                                                                                |
| Copy        | `packages/copy`   | `t(key, params, locale)` over `design/copy/strings.json` (`hi-Latn` default, `en` toggle).                                                                                                               |
| Render      | `packages/render` | HTML → PDF/JPEG through Chromium, paper sizes (Stage 6).                                                                                                                                                 |
| UI kit      | `packages/ui`     | The components of `design/components.md` plus v2's additions, tokens only, both themes. `/kit` renders them all.                                                                                         |
| Design pack | `design`          | Workspace package `@ekbill/design`: tokens (`tokens.json` → `themes.css`, `tokens.ts` via `build.py`), fonts, copy, fixtures, reference screens.                                                         |

## Data model

| Table               | Purpose                                                                                                   | Who writes                                                                                                | Tenancy (I1)                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `schema_migrations` | Which migrations have been applied                                                                        | `packages/db/migrate.mjs` only                                                                            | —                                                          |
| `users`             | A person who signs in: phone, name, theme, language                                                       | `repos/users.ts` (own row: setTheme, setLanguage, setName), `memberships.invite` (a new person), the seed | no business data; no RLS                                   |
| `businesses`        | A tenant: legal and trade name, status (active, archived; nothing is deleted)                             | `repos/businesses.ts` (createBusiness, rename, archive), the seed                                         | RLS on `id`; audited; delete refused                       |
| `memberships`       | Who acts for a business and as what (owner, staff, accountant); one active owner per business             | `repos/memberships.ts` (invite, remove), `businesses.createBusiness` (the owner), the seed                | read before a scope exists (resolveScope): no RLS; audited |
| `sessions`          | A signed-in device: user, the business and role it acts as, expiry                                        | `auth.ts` (createSession, deleteSession): `/dev/switch` in the build, OTP in Stage 10                     | no business data; no RLS                                   |
| `audit_events`      | One row per authoritative write (I7): actor, kind, table, row, before, after, request id                  | the `audit_row()` trigger alone (security definer); `ekbill_app` may only read                            | RLS on `business_id` for reads; append-only                |
| `ai_calls`          | Every model call (rule 9, I6): purpose, model, prompt version, input hash, tokens, cost, latency, outcome | `packages/ai` (Stage 7 onward)                                                                            | RLS on `business_id`, a null row for system calls          |

Extensions: `pgcrypto`, `vector`. The tenancy toolkit is `packages/db/tenancy.sql` (included by migration `0001_identity.sql`): `apply_tenancy(table)` adds forced row-level security on `business_id = app_business_id()`, the audit trigger, the delete refusal (8.3) and the model-actor refusal (I6: `app.actor_kind = 'model'` may not write). The application role `ekbill_app` owns nothing; `withTenant()` runs every scoped transaction as it (`SET LOCAL ROLE`) with the scope in `app.business_id`, `app.user_id`, `app.actor_kind`, `app.request_id`. Stage 3 adds series and documents through the same function.

## Critical paths

- **Health**: `GET /api/health` (`apps/web/app/api/health/route.ts`) → `schemaStatus()` (`packages/db/src/index.ts`) reads the newest `schema_migrations` tag; reads `BACKUP_STATE_FILE` for the last backup's age. No secrets in the body.
- **Migrations**: container start → `node packages/db/migrate.mjs` → advisory lock 7201019 → each pending `NNNN_*.sql` in one transaction → `schema_migrations` row.
- **A request**: `apps/web/proxy.ts` stamps `x-request-id` → the page or action calls `apps/web/server/session.ts#current()` → `@ekbill/db#resolveScope(sessionId, requestId)` reads `sessions` + `users`, then the active `memberships` row (outside RLS) → `TenantScope { businessId, userId, role, requestId }` → every repository function takes it first and runs inside `withTenant()` (`packages/db/src/scope.ts`).
- **A write**: action validates (zod, `apps/web/actions/schema.ts`) → repository checks `allow(scope, allowedRoles.x)` (I8) → `withTenant()` → the policy fences the rows (I1) → the audit trigger appends the row (I7) → `ActionResult`.
- **Become someone (the build)**: `GET /dev/switch/[person]` (`AUTH_MODE=switcher`) → `createSession()` for the seeded user and their one active membership → the `eb-session` cookie (httpOnly) plus `eb-theme` and `eb-lang` from the user's row → Home, or `/welcome` for the owner with no business.
- **Issue a document**: `packages/db/repos/documents.ts#issueDocument()` (Stage 3; I2) — not yet written.

## Action and route surface

| Kind          | Path                                                              | Roles                                                 | Test                                                                        |
| ------------- | ----------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| Route handler | `GET /api/health`                                                 | public                                                | `tests/integration/health.test.ts`                                          |
| Route handler | `GET /dev/switch/[person]`                                        | anyone, `AUTH_MODE=switcher` only (404 otherwise)     | `tests/integration/switch.test.ts`, `tests/e2e/identity.spec.ts`            |
| Route handler | `POST /api/auth/otp`                                              | 501 until Stage 10                                    | `tests/e2e/identity.spec.ts`                                                |
| Server action | `setTheme`, `setLanguage`, `setName` (`apps/web/actions/user.ts`) | owner, staff, accountant (own row)                    | `tests/integration/roles.test.ts` (generated), `tests/e2e/identity.spec.ts` |
| Repository    | `businesses.rename`, `businesses.archive`                         | owner                                                 | `tests/integration/roles.test.ts`, `tenancy.test.ts` (generated)            |
| Repository    | `memberships.invite`, `memberships.remove`                        | owner                                                 | generated, as above                                                         |
| Repository    | `users.setTheme`, `users.setLanguage`, `users.setName`            | owner, staff, accountant                              | generated, as above                                                         |
| Page          | `/kit`, `/flow`                                                   | public (the build)                                    | `tests/e2e/kit.spec.ts`, `screens.spec.ts`                                  |
| Pages         | every product screen                                              | the session's role; `?as=` is a look for `/flow` only | `tests/e2e/screens.spec.ts`                                                 |

## Tooling

- `npm run watch` (`scripts/watch.mjs`): the 5.2 checks on every save, first red stops; `.watch/status.json`, `.watch/log`. `--once` for CI and before a commit.
- `npm run review:stage -- N` (`scripts/review-stage.mjs`): rule 12. Four inputs, fixed checklist, `docs/stages/stage-N-review-k.md`. `--check-model` confirms `OPENAI_REVIEW_MODEL` resolves; `--dry` builds the prompt without a call.
- `npm run tokens:check`, `rules:check`, `trace` / `trace:check` (→ `docs/FIELD-TRACE.md`), `flow` / `flow:check` (→ `docs/SCREEN-FLOW.md` from `apps/web/screens/*/manifest.ts`).
- `scripts/copy-fonts.mjs` runs before `dev` and `build` of `apps/web`: the pack's `.woff2` files into `apps/web/public/fonts` (gitignored).
- `scripts/local-postgres.sh`: a local Postgres on 5440 with `ekbill2_dev` and `ekbill2_test`.

## Deployment

`deploy/`: one image (`deploy/Dockerfile`), two commands (web server, worker). Compose project **`ekbill2`** (`deploy/docker-compose.yml`): `db` (pgvector/pg16, volume `ekbill2_pgdata`, 127.0.0.1:5441), `docling`, `app` (127.0.0.1:8080), `worker`, `caddy` (80/443, automatic HTTPS, basic-auth gate while sign-in is off). `deploy/vm/up.sh` reads the secrets from Secret Manager and `.env`, hashes the gate password in a throwaway Caddy, and starts the stack. `deploy/vm/backup.sh` (nightly 02:30 IST via `deploy/vm/schedule-backup.sh`) dumps to `gs://<project>-ekbill-backups/pg2/` and writes `deploy/vm/state/last-backup.json` for `/api/health`. `deploy/vm/restore.sh` loads a dump; `deploy/vm/free-space.sh` removes only this project's unused images.

CI (`.github/workflows/ci.yml`): push to `main` and pull requests run `npm run watch -- --once` with a Postgres service, then build and Playwright (phone, both themes; `@slow` excluded). `slow.yml` on `workflow_dispatch`: `@slow` journeys, load (Stage 10), evals (Stage 7).

## Screens (Stage 1, I10)

`apps/web/screens/<id>/` holds each production screen: `manifest.ts` (route, purpose, primary action, taps, states, guide ids, tour, roles, hidden-per-role; `scripts/flow-map.mjs` and `/flow` read it), `data.ts` (a typed loader over `tests/fixtures/v2.json` through `screens/fixtures.ts`; Stages 4–9 re-point it at repositories), `Screen.tsx` (a client component built from `@ekbill/ui`). `apps/web/app/**/page.tsx` are thin: resolve the viewer (`screens/viewer.ts`: the session through `server/session.ts#current()`, with the fixture persona the seeded person maps to; `?as=` is a look for `/flow`), call the loader, render the screen. `screens/shell/AppShell.tsx` is the one shell (top bar, floating tab bar with the mic, Tour button, GuideHighlight). `screens/draft.ts` is the prototype's only memory (sessionStorage behind `useDraft`). `screens/registry.ts` lists every manifest, a sample URL per screen and the extra fixture states; `screens/golden-paths.ts` the tap sequences the tests count.

## What changed in Stage 0

Everything above was created. No product feature, no screen flow (Stage 1).

## What changed in Stage 1

Every screen of master prompt 8.0 as a clickable prototype on fixtures in both themes (25 screens, 22 extra states), the `/flow` review screen, the guide tour on every screen, the golden paths within budget, `packages/engine` ids and money copied from the MVP, 335 copy keys added, six kit components (Sheet, ChoiceList, SettingRow/Group, OtpInput, SearchInput, EmptyState, ProgressLine), `scripts/copy-build.mjs`, `scripts/copy-thumbs.mjs`, `scripts/flow-dump.ts`, `scripts/flow-urls.ts`, `scripts/fixtures-v2.mjs`.

## What changed in Stage 2

Identity, tenancy, roles and audit (migration `0001_identity.sql` from `packages/db/src/schema.ts`, with `packages/db/tenancy.sql` included): users, businesses, memberships, sessions, audit_events, ai_calls; the `ekbill_app` role and `withTenant()`; `resolveScope()`; repositories for businesses, memberships and users with `allowedRoles` on every write; the build seed (three businesses with owner, staff and accountant, one owner without a business; `npm run seed`); `/dev/switch` issues real sessions; theme and language live on the user (`apps/web/actions/user.ts`); the tests `tests/integration/tenancy.test.ts` and `roles.test.ts` are generated by `scripts/gen-tests.mjs` from the repository module list and the `allowedRoles` tables (`gen:check` in the watcher); `audit.test.ts`, `rls.test.ts` (raw connections), `session.test.ts`, `tests/e2e/identity.spec.ts`. No other screen was wired (the Stage 2 prompt).
