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

- Decision: `gpt-6.1-sol`. Resolved against the account's models list by `node scripts/review-stage.mjs --check-model` on the VM "ekbill" on 2026-10-15.
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

## 2026-10-15 — Stage 1 (screen flow)

### The short setup path

- Decision: name → "GST mein registered ho?" → only what that answer needs (GSTIN; turnover; IRN when 5 crore+) → "Sab sahi hai?" with "Chalo, shuru karte hain". PAN, UPI, city and signature are offered on that review screen ("Abhi bhar deta hoon") and on Aap; PAN is derived from the GSTIN when one is given.
- Options: every question in 8.0's order before the first bill (19 taps from welcome to WhatsApp).
- Why: I9's budget for path (d) is 14 taps; the OTP moves on by itself at six digits, Kitna defaults to 1, and the first bill carries the customer's name inline. Open question 1 on /flow.
- Asked by: the Stage 1 prompt ("Redesign until within budget").

### Inactive tabs show their icon only

- Decision: the five-slot tab bar (Ghar · Bills · mic · GST · Aap) words only the active tab.
- Why: five worded slots do not fit 390 px at 44 px targets; the pack's mock had three tabs. Open question 4.
- Asked by: the Stage 0 kit screenshots.

### Session drafts through one store hook

- Decision: `apps/web/screens/draft.ts#useDraft(key, initial)` subscribes React to sessionStorage (useSyncExternalStore); screens never set state inside an effect. Stage 4 onward replace the store with server actions behind the same names.
- Why: eslint's react-hooks rules forbid setState in effects; the prototype still has to survive a reload mid-bill.
- Asked by: the build agent.

### Baselines at device scale 2

- Decision: the Playwright phone project renders at deviceScaleFactor 2 (780 px wide), the pack's own scale; every screen's baseline is also copied to `design/screens/<theme>/v2-<id>.png`, so the repository stores each image once.
- Why: the pack's references are 780 px wide; the kit baselines were remade at this scale.
- Asked by: the Stage 1 prompt (references for /flow and the pixel comparison).

### `allowedDevOrigins` for the dev server

- Decision: `next.config.ts` allows `127.0.0.1` and `localhost` in development.
- Why: Next 16 refuses chunk requests from an origin other than the one it started on; the tests and the VM reach the dev server by IP and nothing hydrated. Production is unaffected.
- Asked by: the golden-path tests (every tap silently did nothing).

### The dev switch redirects with a relative Location

- Decision: `/dev/switch/[person]` answers 303 with `Location: /`, not an absolute URL.
- Why: an absolute URL built from `request.url` carried `localhost`, so the cookie set on 127.0.0.1 never reached the next page.
- Asked by: path (d).

### The Caddy gate is off during the build

- Decision: `deploy/vm/up.sh` mounts `deploy/caddy/gate-off.caddy` by default; `EKBILL_GATE=on deploy/vm/up.sh` mounts `gate-on.caddy` with the shared password from Secret Manager. The site is open; `AUTH_MODE=switcher` shows seeded test data only.
- Why: the operator asked for no login or password in front of the prototype (15 Oct 2026). Stage 10 turns OTP on, which replaces the gate.
- Asked by: the operator.

## 2026-10-15 — after the first independent reviews

### Tax and rates moved into the engine before Stage 3

- Decision: `packages/engine/src/tax.ts#computeTax()` and `packages/engine/rules/gst/rates.json` (with `selectableRates`, `supplyKind`) exist from Stage 1; the form, the done paper and the fixture bills read them. Stage 3 completes the pack and verifies it.
- Options: keep a prototype calculation in the web layer until Stage 3.
- Why: the reviews found I4 and I5 violated in the prototype (tax in `apps/web`, rates in code, SGST derived from rounded CGST). An invariant holds in every stage; the engine is where it can be checked mechanically.
- Asked by: the Stage 0 and Stage 1 reviews (rule 12).

### The reviewer's range for an earlier stage

- Decision: `npm run review:stage -- N --head REF` reviews `stage-N-start..REF`; Stage 0 is reviewed on `stage-0-start..stage-1-start`.
- Why: the first Stage 0 review covered Stage 1's code as well and repeated its findings.
- Asked by: the build agent.

### Path (a) is timed only against a production build

- Decision: `tests/e2e/golden-path.spec.ts` throttles to Slow 3G / 4× CPU and asserts ≤ 20 s when `E2E_PROD=1` (CI, `next start`); against the dev server it counts taps untimed. Measured: 2.5 s.
- Why: the dev server's unminified bundles measure the compiler, not the app.
- Asked by: I9 and the Stage 1 review.

## 2026-10-15 — after the second independent reviews

### The engine takes the date and both state codes

- Decision: `computeTax({ lines, registration, gstOn, dateIso, sellerStateCode, customerStateCode })` selects the rule pack by date and decides the place of supply, the state head (SGST or UTGST) and the document kind from the pack entries (`place-of-supply-state`, `document-kinds-2017`); the result names `rulesApplied`. Half rates are exact (`taxable × bp / 20 000`, rounded once). The GST screen's workings are computed by the engine over the period's bills; the fixture carries only the period.
- Options: keep `supplyKind(seller, customer)` without a date and the document kinds in code.
- Why: the second review found I4 and I5 still violated (hard-coded workings, truncated half rates, kinds in code, rates constant on the item screen). Stage 3 verifies the pack; its shape is now what the engine reads.
- Asked by: the Stage 1 review, round 2 (rule 12).

### A request id on every request

- Decision: `apps/web/proxy.ts` (Next's proxy convention, Node runtime) stamps `x-request-id` on every non-asset request, passes it to the page or route as a request header and logs one JSON line; `lib/log.ts#requestId()` reads it there.
- Why: I7 asks for a request id on every request; the routes had one, the pages did not.
- Asked by: the Stage 1 review, round 2.

### WhatsApp is a real hand-off

- Decision: `apps/web/screens/share.ts#handoffToWhatsApp()` calls the Web Share API (the phone's sheet offers WhatsApp) and falls back to a `wa.me` link; the buttons mark "sent" only after the sheet returns. Golden path (a) stubs `navigator.share` and is timed to that call. Stage 6 attaches the PDF/JPG.
- Why: I9 measures the path up to the share sheet; a button that only changed its label measured nothing.
- Asked by: the Stage 1 review, round 2.
