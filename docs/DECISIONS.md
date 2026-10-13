# Decisions

Dated entries: decision, options, why, who asked. Newest at the bottom of each date. The stack table of the master prompt (4.1) is recorded here as the first entries.

## 2026-10-13 — locked stack (master prompt 4.1)

### Repository

- Decision: **`Ergplan/ekbill`**, branch `main`; the MVP stays in `Ergplan/easybills` at tag `mvp-final`, checked out read-only at `~/easybills`
- Why: A clean history for the audit; the MVP readable on disk
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### Layout

- Decision: npm workspaces monorepo: `apps/web`, `apps/worker`, `packages/engine`, `packages/ai`, `packages/db`, `packages/copy`, `packages/render`, `packages/ui`, plus `design/` (the pack, imported as a workspace package `@ekbill/design`)
- Why: The engine stays pure and testable; UI primitives are the only consumers of tokens
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### Language

- Decision: TypeScript 5.x, strict
- Why: One language per layer; the proven engine is TypeScript
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### Web app

- Decision: Next.js 16 App Router, React 19, server actions for writes, route handlers for files, standalone output
- Why: Works on phones and on the VM; SSR for slow Android browsers
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### UI

- Decision: `packages/ui`: components from `design/components.md` plus the ones v2 adds (listed in Stage 1); CSS with the pack's tokens; no Tailwind, no component library; both themes always
- Why: The pack's depth, textures and glass are the quality bar
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### Themes

- Decision: Narangi (light, default) and Harmony (dark); `users.theme = narangi \
- Why: harmony \
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### Database

- Decision: PostgreSQL 16 with pgvector, **relational columns**, not jsonb documents
- Why: 500 tenants need indexes, constraints, RLS and reporting
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### ORM and migrations

- Decision: Drizzle ORM with `drizzle-kit` SQL migrations in `packages/db/migrations`; drift check in the watcher and CI; triggers and RLS by hand in the same migrations
- Why: Typed schema in code, plain SQL on disk
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### Background work

- Decision: `apps/worker` with `pg-boss` (Postgres-backed queue): read-bill, render-other-sizes, index-search, reminders-due, backup-check
- Why: No Redis; jobs are rows, so they are auditable
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### Auth

- Decision: Firebase Auth phone OTP (as the MVP), server-minted session cookie; **during the build** `AUTH_MODE=switcher` (section 4.3)
- Why: OTP is what these users have
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### Tenancy and roles

- Decision: One business per tenant; memberships with role `owner`, `staff`, `accountant`; invite by phone
- Why: I1, I8
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### Models

- Decision: OpenAI through `packages/ai`: a vision-capable model for photographed bills, a text model for Poocho, Realtime for voice; model IDs by environment variable; defaults recorded in the decisions log
- Why: The account and key exist; reviewer and auditor are OpenAI, the builder is not
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### Reviewer

- Decision: `OPENAI_REVIEW_MODEL` is the exact model ID the operator writes in `.env` (paste 3); Stage 0 only checks it resolves against the account's models list and records it
- Why: Rule 12; an agent cannot guess an ID from a nickname
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### Printed-document OCR

- Decision: docling-serve (existing image) for printed PDFs and scans; the vision model for handwriting, with Docling text as a hint
- Why: Docling is cheap and local
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### PDF and images

- Decision: Playwright Chromium in the app image: HTML → PDF (A4/A5/80mm/58mm) and JPEG; the InvoicePaper is theme-independent; **the chosen format is rendered synchronously at issue** (budget 3 s) so the done screen has it; other sizes by the worker on demand
- Why: The done screen is on the golden path
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### Search / Poocho

- Decision: Postgres full text + pgvector hybrid (MVP design), indexing in the worker
- Why: Local
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### Voice

- Decision: OpenAI Realtime over WebRTC, server-minted client secrets, tools that light up, fill and press navigation; never commits (I6, rule 17); wired in Stage 9
- Why: MVP design
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### Copy

- Decision: `packages/copy`: one dictionary `{en, hi-Latn}` seeded from `design/copy/strings.json` and the MVP's dictionary, with the MVP's jargon and length tests
- Why: Rule 16
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### Logs and metrics

- Decision: `pino` JSON logs with request id and business id, phones masked; `/api/health`; `/api/metrics` (Prometheus text, Stage 10)
- Why: Enough to run 500 businesses on one VM
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### Deployment

- Decision: Docker Compose project **`ekbill2`** on `tariff-order`: `db` (volume `pgdata` → `ekbill2_pgdata`), `docling`, `app` on 127.0.0.1:8080, `worker`, `caddy`; one image for app and worker; the MVP's `deploy/vm/*.sh` adapted with the project name changed
- Why: Separate from the MVP's `ekbill` project and its volume
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### CI

- Decision: GitHub Actions on push to `main`: the watcher's checks plus Playwright on a Postgres service (`@slow` excluded). Load at 1/10 scale and model evals run on `workflow_dispatch` only
- Why: The watcher is for the agent; CI for everyone; no recurring spend
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### Testing

- Decision: vitest (unit, integration), Playwright (journeys, visual snapshots, tap counts), k6 (load, Stage 10)
- Why: What the MVP used, plus load and visual
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### Accountant exports

- Decision: **One zip**: `workings.xlsx`, every PDF of the period, `gstr1.json` in the GSTN offline-tool format; "CA ko bhejo" opens the share sheet with the zip (WhatsApp, email, Drive)
- Why: Operator's answer
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### Composition businesses

- Decision: Bill of supply with the mandatory legend; the GST tab is hidden (Aap shows "Composition: bill of supply only · CA ko PDFs bhejo"); no workings
- Why: Operator's answer
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

### Debit notes

- Decision: Out of scope for v2 (section 4.2)
- Why: Rare for these owners; a credit note and a new bill cover the cases
- Asked by: the master prompt (section 4.1), accepted by the operator on 13 Oct 2026

## 2026-10-13 — Stage 0

### Reviewer model ID

- Decision: recorded by `npm run review:stage -- --check-model` on the VM once `.env` is filled; the ID is written here by the build agent in the Stage 0 session on the VM (not from this container, which has no `.env`).
- Why: rule 12; the agent cannot guess an ID from a nickname.
- Asked by: the master prompt.

### tokens:check patterns made exact

- Decision: `box-shadow` fails unless its value is `none`, a `var(--eb-…)` or an inset ring (`inset 0 0 0 Npx`) coloured by a token or `color-mix()` of tokens; `border-radius` fails on any `px` value. Four radius tokens were added to the pack (`tile` 28px, `chip` 12px, `small` 8px, `tip` 6px; tokens.json 1.2.0) so the kit has no literal radius.
- Options: the literal regex in draft 3 (`box-shadow:\s*[^v]`), which rejected `box-shadow: var(--eb-shadow-card)` itself because `\s*` can match nothing.
- Why: the check must pass on correct code and fail on literals; section 5.2 of the master prompt was reworded to say what the script does.
- Asked by: the build agent (Stage 0).

### Local Postgres databases are `ekbill2_dev` and `ekbill2_test`

- Decision: `scripts/local-postgres.sh` creates `ekbill2_dev` and `ekbill2_test` on port 5440; the MVP's `ekbill_dev`/`ekbill_test` on the same server are left alone.
- Why: the MVP's local databases carry its schema; sharing a name made `migrate.mjs` read the MVP's `schema_migrations`.
- Asked by: the build agent (Stage 0); the Stage 0 prompt named `ekbill_test`/`ekbill_dev`.

### Backup age reaches /api/health through a state file

- Decision: `deploy/vm/backup.sh` writes `deploy/vm/state/last-backup.json`; compose mounts `deploy/vm/state` read-only at `/app/state`; the route reports `lastBackup: { at, bytes, ageHours }` or `none`.
- Options: the app querying the bucket (needs credentials in the container), or the worker's backup-check job (Stage 10).
- Why: no credentials in the app container; the file is written by the same script that made the backup.
- Asked by: the Stage 0 prompt ("/api/health reports last backup age once one exists").

### The worker runs its TypeScript with tsx inside the image

- Decision: the image carries the worker's sources and the full production `node_modules`; compose starts it with `node_modules/.bin/tsx apps/worker/src/index.ts`.
- Options: a second build (`tsc` to `dist/`) or bundling.
- Why: one image, two commands, no second build pipeline for a process with a handful of handlers. Revisit in Stage 10 if start time or image size matters.
- Asked by: the build agent (Stage 0).
