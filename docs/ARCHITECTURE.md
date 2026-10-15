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

| Table               | Purpose                            | Who writes                     |
| ------------------- | ---------------------------------- | ------------------------------ |
| `schema_migrations` | Which migrations have been applied | `packages/db/migrate.mjs` only |

Extensions: `pgcrypto`, `vector`. Stage 2 adds users, businesses, memberships, sessions, audit and `ai_calls` with row-level security.

## Critical paths

- **Health**: `GET /api/health` (`apps/web/app/api/health/route.ts`) → `schemaStatus()` (`packages/db/src/index.ts`) reads the newest `schema_migrations` tag; reads `BACKUP_STATE_FILE` for the last backup's age. No secrets in the body.
- **Migrations**: container start → `node packages/db/migrate.mjs` → advisory lock 7201019 → each pending `NNNN_*.sql` in one transaction → `schema_migrations` row.
- **Issue a document**: `packages/db/repos/documents.ts#issueDocument()` (Stage 3; I2) — not yet written.

## Action and route surface

| Kind          | Path              | Roles                                    | Test                               |
| ------------- | ----------------- | ---------------------------------------- | ---------------------------------- |
| Route handler | `GET /api/health` | public                                   | `tests/integration/health.test.ts` |
| Page          | `/kit`            | public (behind the Caddy gate on the VM) | `tests/e2e/kit.spec.ts`            |
| Page          | `/`               | redirects to `/kit` until Stage 1        | —                                  |

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

`apps/web/screens/<id>/` holds each production screen: `manifest.ts` (route, purpose, primary action, taps, states, guide ids, tour, roles, hidden-per-role; `scripts/flow-map.mjs` and `/flow` read it), `data.ts` (a typed loader over `tests/fixtures/v2.json` through `screens/fixtures.ts`; Stages 4–9 re-point it at repositories), `Screen.tsx` (a client component built from `@ekbill/ui`). `apps/web/app/**/page.tsx` are thin: resolve the viewer (`screens/viewer.ts`: cookie `eb-as` or `?as=`), call the loader, render the screen. `screens/shell/AppShell.tsx` is the one shell (top bar, floating tab bar with the mic, Tour button, GuideHighlight). `screens/draft.ts` is the prototype's only memory (sessionStorage behind `useDraft`). `screens/registry.ts` lists every manifest, a sample URL per screen and the extra fixture states; `screens/golden-paths.ts` the tap sequences the tests count.

## What changed in Stage 0

Everything above was created. No product feature, no screen flow (Stage 1).

## What changed in Stage 1

Every screen of master prompt 8.0 as a clickable prototype on fixtures in both themes (25 screens, 22 extra states), the `/flow` review screen, the guide tour on every screen, the golden paths within budget, `packages/engine` ids and money copied from the MVP, 335 copy keys added, six kit components (Sheet, ChoiceList, SettingRow/Group, OtpInput, SearchInput, EmptyState, ProgressLine), `scripts/copy-build.mjs`, `scripts/copy-thumbs.mjs`, `scripts/flow-dump.ts`, `scripts/flow-urls.ts`, `scripts/fixtures-v2.mjs`.
