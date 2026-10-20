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

### Camera, photo library and files are the OS's own doors

- Decision: `packages/ui/src/files.tsx` gives three doors, each a hidden `<input type="file">` the screen opens (`FileDoor`): `camera` (`capture="environment"`, the phone's camera app), `photos` (the library, `image/*`) and `files` (the folder: PDF, CSV, Excel, images, multiple). On a laptop, where `capture` is ignored, "Photo lo" opens the live camera (`CameraSheet`, `getUserMedia`) and falls back to the library when the browser refuses. The OS or the browser asks the person for permission the first time and remembers it; EkBill never asks on its own, never retries behind a refusal, and never reads a folder (the person picks each file). Files over 10 MB are refused with the words; images are downscaled to a 1600-px JPEG in the browser and kept in the draft, so the photo the person took is the photo the review shows. Doors: photo → bill (camera, library), import (files), Aap logo (library or files).
- Options: a custom in-app gallery or folder browser (needs broad permissions the stores and browsers frown on); upload every file to the server on pick.
- Why: the operator asked for camera, photo-library and files access on phones and laptops after the customer's permission. The OS pickers are what the person already knows, carry the permission prompt themselves, and need no broad storage permission. Nothing leaves the device in Stage 1; Stage 7 sends the picked photo to the model and Stage 9 the import files.
- Asked by: the operator, 15 Oct 2026.

## 2026-10-15 — after the third independent reviews

### A Stage 0 re-review reads Stage 0's files as they are now

- Decision: `npm run review:stage -- 0` diffs `stage-0-start..HEAD` limited to Stage 0's paths (`STAGE_PATHS` in `scripts/review-stage.mjs`); `--base`/`--head` still review any range whole.
- Options: keep reviewing the frozen first range (`--head stage-1-start`).
- Why: the third Stage 0 review repeated findings already fixed after `stage-1-start`, because the ground keeps changing as later reviews find things. A review that can never go clean is not a gate.
- Asked by: the build agent (rule 12).

### The rule pack decides, the engine reads

- Decision: a place-of-supply entry carries a `decide` table (`sameState`, `otherState`, `unknownState`); the engine applies it and throws on an entry without one. Every entry carries `verifiedOn` and `verifiedBy` (the date and author of the last check, verified or not); `rules:check` refuses one without, and at most 3 may be `verified: false`.
- Why: I5 says rules are data; a rule whose value the code never reads is not data. I5 also names a verification date on every entry.
- Asked by: the Stage 1 review, round 3.

### Fixtures are generated through the engine

- Decision: `scripts/fixtures-v2.mjs` imports `computeTax` (run as `npm run fixtures:build`, which loads the TypeScript engine with tsx); a unit test holds all 20 fixture bills to the engine.
- Why: I4 allows one tax calculation; the generator's own rounding was a second one.
- Asked by: the Stage 1 review, round 3.

### The tab bar is in the baselines

- Decision: the screen baselines no longer mask `.eb-tabbar`.
- Why: I10 approves the whole screen; a masked bar is not protected.
- Asked by: the Stage 1 review, round 3.

## 2026-10-15 — Stage 2

### The application role and forced row-level security

- Decision: every scoped transaction runs as `ekbill_app` (`SET LOCAL ROLE` inside `withTenant()`), a role that logs in nowhere and owns nothing, so the policies bind it; the tables also carry `FORCE ROW LEVEL SECURITY`, so the login role that migrates (a superuser on the local Postgres and in the compose stack) is bound too wherever it is not a superuser, and the seed sets the scope per business rather than relying on ownership. The audit trigger is `security definer`: the trail is written only through it, and `ekbill_app` may only read it.
- Options: rely on the login role and policies alone (a superuser bypasses RLS: the local and VM databases run as one); a separate login role for the app (a second password to manage on the VM).
- Why: I1 and I7 must hold on the databases the build actually uses, and the proof (`tests/integration/rls.test.ts`) must run on a raw connection.
- Asked by: I1, I6, I7.

### Memberships without RLS

- Decision: `memberships` has `business_id` but no policy: `resolveScope()` reads it before a scope exists, and `listMembers`/`remove` fence on `business_id = scope.businessId` in the query, which the generated tenancy test holds them to. It is audited and delete-refused like the other authoritative tables.
- Why: I1 names it among the tables read once per request before a scope exists.
- Asked by: I1.

### Generated tests through probes

- Decision: each repository module exports `allowedRoles` (the table I8 names), `roleProbes` (one call per write) and `tenancyProbes` (calls that report every business id they touched); `scripts/gen-tests.mjs` writes `tests/integration/roles.test.ts` (every write × every role) and `tenancy.test.ts` (every probe as A against B) from the module list in `packages/db/src/repos/index.ts`, formatted the way prettier would; `gen:check` in the watcher fails on drift.
- Options: hand-written tests per repository (I1 and I8 say generated: a module nobody listed would go untested).
- Asked by: I1, I8.

### The seed on the build's own instance

- Decision: `scripts/seed.mjs` refuses a database whose name says neither dev nor test, unless `AUTH_MODE=switcher` (the build's own instance, "sign-in switched off, test data only" as `/api/health` says); `deploy/vm/up.sh` seeds after the stack is healthy in that mode. Deterministic ids: the seed keys are the Stage 1 fixture ids, so the fixture screens map a session to a persona until the stages that wire them.
- Why: the switcher needs people on the VM, and the VM's database is named `ekbill`.
- Asked by: the Stage 2 prompt (seed, switcher).

### Theme and language on the user, echoed in cookies

- Decision: `users.theme` and `users.language` are the truth (`setTheme`, `setLanguage` actions through the repository, every role for their own row); `/dev/switch` and the actions echo them into `eb-theme` and `eb-lang`, which the root layout reads before paint (`data-theme`, `<html lang>`). The dictionary switch per user arrives with the Aap wiring in Stage 4.
- Why: no flash of the wrong theme, no database read in the layout for every request.
- Asked by: the Stage 2 prompt ("theme and language from the user").

### Stage 2 started on "continue build"

- Decision: the operator wrote "continue build for next 12 hours" after the round-3 reviews; the build agent took it as the go-ahead past the Stage 1 gate on the report's own proposals (`docs/stages/stage-1-answers.md`) and recorded the assumption there and in the Stage 2 report. "Run Stage 1 again" with a changed answer overturns any of them.
- Asked by: the operator, 15 Oct 2026.

## 2026-10-15 — Stage 3

### The seller columns arrive with the documents

- Decision: migration `0002_documents.sql` adds to `businesses` what issuing reads of the seller (`registration_type`, `gstin`, `state_code`, `turnover_paise`, `e_invoicing_applies`, `address`, `city`, `phone`, `upi`); Stage 4 adds the rest of the profile and the write path. The seed fills them for Sharma Electricals (regular, Maharashtra) and Gupta Kirana (composition, Uttar Pradesh); Verma Traders stays "not sure".
- Options: `issueDocument` taking the seller from its caller (the caller could pass anything: the snapshot must come from the row); waiting for Stage 4 (then Stage 3's issuance could not be tested against a real row).
- Why: I2 says the snapshot freezes what the business was at issue time; that has to be read inside the issuing transaction.
- Asked by: the Stage 3 prompt (issueDocument).

### The issue gate is a transaction-local setting

- Decision: the `issue_gate` trigger refuses `status = 'issued'` unless `app.issuing = '1'`; `issueDocument()` sets it with `set_config(…, true)` (local to its transaction) and nothing else does. The immutability trigger (`immutable_once_issued`) refuses every change to what the customer saw on an issued or cancelled row, lets status move only to cancelled, and lets the IRN be written once.
- Options: trust the repository alone (I2 names a trigger); a security-definer function that issues (the engine would then have to run inside Postgres).
- Why: I2 asks for one writer; a setting only that writer sets makes the database hold it, and the test `refuses status = issued from anything but issueDocument` proves it on a raw connection.
- Asked by: I2.

### Drafts lock first, then the series

- Decision: `issueDocument` locks the draft row, then the series row (`SELECT … FOR UPDATE`), then asks the engine, then allocates. A refusal rolls everything back and no number is spent. The `numbering` integration test issues 50 drafts concurrently on one fresh series and gets exactly 1…50.
- Why: I3 (gapless, never reused) and the one-order rule against deadlocks.
- Asked by: I3.

### A plain invoice is stored as a bill of supply

- Decision: `documents.kind` keeps the three values the prompt spells out (`tax_invoice`, `bill_of_supply`, `credit_note`); the engine's `invoice` (an unregistered business, or a registered one with GST off) is stored as `bill_of_supply`, and the snapshot keeps the engine's `kind` and the title the paper prints.
- Why: the column is a ledger category (tax charged or not); the paper reads the snapshot (I2).
- Asked by: the Stage 3 prompt (the column spec).

### The rule pack stays strict while the container cannot fetch

- Decision: every entry carries `verified: false` with `verifiedBy` saying why; `rules:check` is red on the count and the watcher stops there; `npm run rules:verify` on the VM (where `*.gov.in` resolves) fetches each `source`, looks for the `verify.mustContain` phrases and writes the verification fields; the pack is then committed from the VM.
- Options: marking entries verified from training knowledge (I5 says verified against the official source, with a date); loosening the cap for the build (a check that bends is not a check).
- Why: the build agent must not claim what it could not do; the values themselves come from the sources master prompt 8.2 names and are each held by a fixture (`tests/unit/engine-rules.test.ts`).
- Asked by: I5, rule 12.

### Messages leave the engine as keys

- Decision: the engine returns `Say { key, params }` (dictionary keys with parameters), never rendered text; the screens render them with `t()`. The blockers of `assess` and the problems of `bill-form` and `contract` are keys under `assess.*`, `error.*`, `help.*`, `bill.*`.
- Why: the engine is pure and the dictionary is the copy's one home (Stage 1); a Hinglish sentence inside the engine would be a second one.
- Asked by: I4, rule 6 (salvage with the voice kept).

## 2026-10-15 — Stage 4

### The owner's e-invoicing answer is the gate

- Decision: `assessDocument` takes the owner's "Nahi" (asked once in the setup, kept under Aap) as the answer: a notice, never a block, whatever the turnover band says; with no answer the band decides (unscreened blocks; above ₹5 crore blocks with "IRN zaroori hai"). Stage 8's GST checks flag a "Nahi" that the band contradicts.
- Options: let the band overrule the owner (a business the exemptions cover, or one whose band was a guess, could then never issue a bill).
- Why: the MVP's rule and the setup's words: the owner's answer is the gate, given once.
- Asked by: the Stage 4 prompt (e_invoicing_applies).

### The band gives the engine its turnover

- Decision: `turnover_band` is what the owner chose; `turnover_paise` is the band's upper bound (₹40 lakh, ₹1.5 crore, ₹5 crore, and ₹5 crore + 1 paisa for "5 crore se zyada"), so the pack's thresholds (HSN digits at ₹5 crore, e-invoicing above ₹5 crore, the IRN window at ₹10 crore) read one number.
- Why: the engine compares paise; the owner thinks in chips.
- Asked by: the Stage 4 prompt (the turnover chips in 8.0).

### Three pack figures were ten times too large

- Decision: `e-invoice-threshold-2023` (₹5 crore), `irn-30-day-2025` (₹10 crore) and the HSN band bound (₹5 crore) were written as 5e10, 1e11 and 5e10 paise in Stage 3; corrected to 5e9, 1e10 and 5e9 with their fixtures. Found while mapping the bands.
- Why: ₹1 crore is 1e9 paise. A per-entry fixture holds a number as written; it cannot tell that the number was wrong.
- Asked by: I5 (a rule change is a data change with a fixture test).

### Files stay in Postgres, audited without their bytes

- Decision: `business_files` holds the bytes (≤ 300 KB by constraint; a signature ≤ 60 KB by the engine); its audit trigger records `to_jsonb(new) - 'bytes'`; a file is written once (a new logo is a new row the business points at); `GET /api/files/[id]` serves a member of the business under the session's scope.
- Options: the filesystem or a bucket (another thing to back up and to fence by tenant).
- Why: the Stage 4 prompt ("Files stay in Postgres"); I7 (every write audited; the bytes would bloat the trail for nothing).
- Asked by: the Stage 4 prompt.

### One check, run twice

- Decision: `checkProfile` is the engine's and runs in the browser as the owner types (the sheet names the field) and in the repository before the write; the action validates the shape only (zod). The same for `acceptFile`.
- Why: I4, and the MVP's rule: the message is the same both times.
- Asked by: the Stage 4 prompt (checks).

### The real business behind every session

- Decision: `screens/viewer.ts` loads the session's business from the repositories (`screens/business.ts`) and shapes it like the fixture `Business`, keyed by the seed key when the fixtures know it, so the screens that still read fixture bills and customers keep working; `?as=` looks stay on the fixtures (the /flow review and the Stage 1 baselines). A business with nothing in it shows the first-bill welcome.
- Why: Stages 5–9 re-point the loaders one by one; the profile had to be real now without rewriting every screen.
- Asked by: the Stage 4 prompt, I10.

### The setup review grows a state row

- Decision: the `setup--review` baselines were re-taken: the review now shows the state (and the IRN answer and the composition legend), as the Stage 4 prompt's "sheher/rajya" asks. Every other Stage 1 baseline is unchanged.
- Asked by: the Stage 4 prompt, I10.

## 2026-10-15 — Stage 5

### Import files in Postgres, read by the worker

- Decision: the picked files are kept as bytes in `import_files` (≤ 8 MB each, 20 per import) and read by the worker's `read-import` job; the web server only stores and queues. The screen asks the server again until the import is read.
- Options: reading inline in the request (a scan through Docling takes minutes; the prompt puts the pipeline in the worker); the filesystem (another thing to back up and to fence by tenant).
- Why: the Stage 5 prompt (the import pipeline in the worker), Stage 4's rule that files stay in Postgres, I6 (the reading is staging, the owner's tick is the write).
- Asked by: the Stage 5 prompt.

### The worker runs with React's server condition

- Decision: `tsx --conditions=react-server` in the worker's scripts, the compose command and CI, because `@ekbill/db` imports `server-only` (which throws under the default condition).
- Options: dropping `server-only` from the db package (it is what keeps the database out of a client bundle).
- Asked by: the worker's first use of the repositories.

### A CSV reader in the engine

- Decision: `packages/engine/src/import/csv.ts` (quotes, doubled quotes, BOM, the delimiter the header uses) instead of the MVP's csv-parse.
- Why: the engine is pure and dependency-light; a party list needs no more.
- Asked by: rule 6 (salvage), I4.

### Seeded customers keep their fixture keys in their ids

- Decision: the seed's customers and items get ids derived from the business and the fixture position (`00000000-0000-4000-b000-<business><index>`); `seedCustomerKey(id)` maps back, so the fixture bills (Stage 6 replaces them) show on a real customer's folder and link to it.
- Why: the customer screens are real now and the bill screens are not yet; the two must agree on who a customer is.
- Asked by: I10 (the screens keep working between stages).

### The language is offered, never applied

- Decision: Naya customer offers the reminder language `guessLanguage` reads from the name or the GSTIN's state ("Patil — Marathi mein bhejein?") as a third choice; Hinglish stays the default until the owner taps it; `language_source` records whether it was chosen or accepted from the offer.
- Why: the MVP's rule (a reminder in the wrong language is the one mistake a customer remembers).
- Asked by: the Stage 5 prompt (language guess).

### Playwright starts its own servers with their own environment

- Decision: `playwright.config.ts` passes `AUTH_MODE=switcher` and the dev database to the dev server and the worker it starts, and starts the worker beside the dev server.
- Why: the journeys depended on a shell variable that a restarted shell did not have.
- Asked by: the Stage 5 Playwright run.

### Search is a generated column, not a job

- Decision: `documents.search` is a stored generated `tsvector` over the number and the customer's name, with a GIN index; `listBills` matches it or an `ilike` on the number, the name or the customer's GSTIN.
- Options: the master prompt's "search index job" in the worker.
- Why: Postgres keeps a generated column right on every write, inside the same transaction; a job would lag the bill the owner just made, and there is nothing to index outside the row.
- Asked by: the Stage 6 prompt (search index job).

### "Bill banao" drafts and issues in one action

- Decision: `issueBill` creates the draft (startDocument) and calls `issueDocument` in the same request; when the engine refuses, the draft stays and its id goes back to the form, which sends it with the next try (`updateDraft`), so one bill is one draft.
- Options: saving a draft on every keystroke (the form keeps the half-typed bill in the tab, as in Stage 1).
- Why: the owner taps once; nothing is left half-issued (I2); a refused bill is not lost.
- Asked by: the Stage 6 prompt (startDocument, issue via issueDocument).

### The shared format is printed at issue, the rest by the worker

- Decision: the format and paper the business shares (`bill_share_as`, `bill_paper`) are printed and kept inside `issueBill` (budget 3 s); `render-other-sizes` prints the other seven combinations of the business's design; a render that fails leaves the bill issued and the file route prints it on the first ask.
- Why: the WhatsApp tap on the done screen should find its file waiting; a printer failure must never undo or repeat an issue (I2).
- Asked by: the Stage 6 prompt (budget 3 s; other sizes on demand).

### The accountant reads files without keeping them

- Decision: `printAndKeep` for a role that may not keep a file (the accountant) prints from the snapshot and returns the bytes without storing them.
- Why: reading is the accountant's; keeping a file is a write (`storeRendering` is owner and staff).
- Asked by: the roles table (I8) meeting the download route.

### A credit note's amount follows the bill's own rates

- Decision: "Rakam kam karo" takes one amount and a reason; `makeCreditNote` splits it over the bill's rate summary in the bill's proportion, each part tax-inclusive at its rate, so the GST reversed matches the GST charged.
- Options: one line at the first line's rate (the seed's way for its single-rate bill).
- Why: a bill with lines at 5 % and 18 % would otherwise reverse the wrong tax.
- Asked by: the approved credit-note screen (one amount, one reason).

### A bill with a credit note is not cancelled

- Decision: the bill view hides "Cancel karke naya banao" once a credit note is issued against the bill; the repository refuses it anyway (`credit-note-exists`).
- Why: the bill is corrected already; cancelling it too would leave a credit note against nothing.
- Asked by: the owner journey in `tests/e2e/bills.spec.ts`.

### The seed's businesses match the fixtures

- Decision: Sharma Electricals' seeded GSTIN is the fixture's `27AAAAA0000A1Z2` (the seed had given it Mehta Traders' GSTIN, which the engine refuses as self-billing); the seeded series are the fixture's (INV-, AMC-, CN-; BOS-, GKCN-) without the year, so INV-031 is INV-031.
- Why: the seed issues the fixture bills through `issueDocument`, and the screens' numbers are the approved ones.
- Asked by: `self-billing` on the first seed run.

### A look stays on the fixtures

- Decision: `scopeOf(viewer)` is null for a `?as=` look even with a session cookie; the bill screens, Home and the dues read the fixtures for it; the customer screens map their real rows to fixture keys for a look.
- Why: a look is the /flow review and the Stage 1 baselines, not an identity.
- Asked by: I10.

### A walk-in's place of supply

- Decision: a bill without GST for a customer with no state on record is a supply at the counter (the seller's state); a tax invoice of a regular business asks the state (the CheckStrip's "Chuno", with every state under "Doosra state").
- Why: the engine blocks a tax invoice without a place of supply; asking only where it matters keeps the walk-in bill at three fields.
- Asked by: `missing-place-of-supply` on the first seed run.

### The daily dues list is logged, not sent

- Decision: `dues-today` runs at 08:00 IST, reads `businessesWithBills()` (ids only, outside any tenant), then per business as its owner (actor `system`) lists what falls due today and what is past due; it logs the counts and sends nothing.
- Why: the master prompt says no auto-sending; the owner opens each reminder in WhatsApp.
- Asked by: the Stage 6 prompt (a worker job listing "due today").

### Playwright seeds in its own Node

- Decision: `tests/e2e/global-setup.ts` runs `tests/e2e/prepare.ts` with `--conditions=react-server`; it seeds, cancels today's test bills and reverses today's test payments on fixture bills, so a rerun meets neither the duplicate guard nor paid-off dues.
- Why: the seed now issues bills through the repositories, which import `server-only`.
- Asked by: the first full Playwright run of Stage 6.

### The model writes one row, through one trigger

- Decision: `extractions` drops the general model-actor refusal for `guard_extraction`: a model may only turn a pending reading into ready or failed, once; it never inserts the row, never changes a recorded reading, never commits or points it at a document; a commit needs an issued bill and a person. Every other table keeps `refuse_model_actor`.
- Why: I6 at the database, not only in code: the worker writes as the model, so a bug in it can stage a wrong reading but cannot make a bill or a customer.
- Asked by: I6 (model output is staging only).

### Normalisation in the worker, the normalised photo on the reading

- Decision: the worker normalises (sharp: EXIF rotate, ≤ 2000 px, JPEG q85, EXIF dropped) and stores the result on the extraction (`image`); the upload keeps the original bytes unchanged.
- Options: normalising at upload in the web server.
- Why: the master prompt's pipeline; the upload stays exactly what the owner picked, and the review shows the photo the model saw.
- Asked by: the Stage 7 prompt.

### Chat completions with a JSON object, a fake transport for the build

- Decision: `openAiTransport` posts to `/v1/chat/completions` with the image as a data URL and `response_format: json_object`; the model ID is `OPENAI_VISION_MODEL`. `AI_TRANSPORT=fake` answers from `tests/fixtures/bills/fake/<sha256 of the photo>.json` and is what the tests and the journeys use.
- Why: the build container has no key and must never call a model; the fake answers the synthetic set's ground truth, with doubtful and unreadable fields on purpose.
- Asked by: rule 9; the Stage 7 tests.

### Cost from configured prices

- Decision: `cost_micros` = tokens in × `OPENAI_VISION_PRICE_IN` + tokens out × `OPENAI_VISION_PRICE_OUT` (USD per million tokens, which is micro-USD per token); unset prices leave the cost null.
- Why: prices change and differ by model; the operator writes the current ones in `.env` beside the model ID.
- Asked by: "cost per read from ai_calls".

### A photo bill is a counter sale unless the customer is known

- Decision: the reviewed bill takes the matched customer's state, else the shop's; a date the model could not read leaves the field empty and lit, and the bill is dated today if the owner leaves it empty.
- Why: golden path (c) is three taps; a kaccha bill is almost always local; the owner sees both before tapping.
- Asked by: I9 (path (c) within budget).

### Corrections are written with the commit

- Decision: `makeBillFromPhoto` issues first; only an issued bill records the corrections (each changed field, model value and human value) and commits the reading; a refused issue keeps the draft, as on the form.
- Why: corrections describe the bill that was made; a refused attempt would otherwise leave rows for a bill that does not exist.
- Asked by: the Stage 7 prompt (corrections recorded).

### The default series is the business's

- Decision: a draft with no series named goes in `businesses.default_series_id` (Aap), and only without one in the oldest active series.
- Why: a bill from the photo path landed in AMC- because the repository took the oldest series, not the default.
- Asked by: the Stage 7 journey (golden path (c)).

### Playwright clears the dev cache before its own server

- Decision: the webServer command removes `apps/web/.next/dev` before `npm run dev`; `tests/e2e/prepare.ts` also archives the customers earlier runs added.
- Why: a dev server killed mid-compile left Turbopack's cache unusable (pages never hydrated); old test customers pushed the fixtures' off Home's eight chips.
- Asked by: the Stage 7 Playwright runs.

### The workings are a read-only repository over the snapshots

- Decision: `repos/gst.ts` reads issued and cancelled documents of the period and hands their snapshots to the engine's salvaged `buildGstr1` and `buildGstr3bOutward`; a regular business's bills of supply are left out of GSTR-1; it has no writes (an empty `allowedRoles`), and the generated roles test skips it.
- Why: I2 (only the snapshot), I4 (only the engine); the same period renders the same way every time.
- Asked by: the Stage 8 prompt (workings, drill-down).

### The CA pack is built on request

- Decision: `GET /api/gst/pack` builds the zip when the owner taps "CA ko bhejo": workings.xlsx (written without a library: inline strings, numbers, no formulas), gstr1.json and each bill's kept A4 PDF (printed and kept first if it was not yet); fflate zips it.
- Options: a worker job and a download link later; an xlsx library.
- Why: a quarter of a small shop is tens of bills and the PDFs are mostly kept already; no formulas means nothing recomputes the engine's figures.
- Asked by: the Stage 8 prompt (CA pack).

### gstr1.json is checked against the offline tool's structure, transcribed

- Decision: `tests/fixtures/gstn/gstr1-sample.json` holds the GSTR-1 offline tool's JSON structure, transcribed key by key because the build container cannot reach gst.gov.in; the integration test checks every key path and type of the pack's gstr1.json against it. Replacing the file with GSTN's own sample needs no other change.
- Why: the prompt asks to validate against the sample; the sample cannot be fetched here.
- Asked by: the Stage 8 prompt (gstr1.json).

### The bill form runs the issue's checks

- Decision: the form calls the same `assessDocument` that `issueDocument` calls, with the seller as `sellerNow()` reads it; blockers stop "Bill banao" in the CheckStrip, notices are shown, each with "Kyun?" (the pack entry's Hinglish explanation and source). Two notices join `assess`: the customer's GSTIN state against the place of supply (asked, not refused) and a bill dated within 31 days of a rate change (its own date decides). The e-invoicing self-declaration is said only when the turnover is unknown or above the threshold.
- Why: one set of checks (I4, I5); the owner sees the refusal before tapping, with the reason in the rule's own words.
- Asked by: the Stage 8 prompt (per-bill checks).

### The pack's rules as a document

- Decision: `scripts/rules-update.mjs` lists the entries (`rules:update`) and writes `docs/GST-RULES.md` (`rules:doc`) with a prose section for the CA; the watcher runs `rules:doc:check`; Prettier leaves the generated file alone.
- Why: the CA reads what the app applies, generated so it cannot drift.
- Asked by: the Stage 8 prompt (rule-update workflow).

### An invitation waits for the phone to sign in

- Decision: inviting writes a membership with status `invited` for the phone (a person row is created by phone if there is none); it turns `active` when that phone signs in (`acceptInvites`, called by the switcher now and by the OTP sign-in in Stage 10). Nothing is sent: the screen hands the owner a WhatsApp message with the link.
- Why: the approved flow ("the invitee signs in with that phone and lands in the business") without a messaging provider; an invitation never grants anything until the number proves itself.
- Asked by: the Stage 9 prompt (invites).

### The switcher signs in by phone

- Decision: `/dev/switch/<person>` accepts a phone number as well as a seed key, finds the person by `users.phone_e164`, and accepts their invitations before listing their businesses.
- Why: the invite journey can run end to end during the build exactly as it will with OTP; the switcher stays off in production by `AUTH_MODE`.
- Asked by: the Stage 9 prompt ("switcher during the build").

### The flow audit's calibration

- Decision: the audit counts a tap target by its own box, except a field inside the search pill (the pill is the target); radio chips are exempt from the English-only check (they are values, such as "B2B"); the welcome screen needs no way back; the composition business is audited on its own bill, customer and item.
- Why: the MVP's audit spared the same cases; anything else is a finding to fix, not to exempt.
- Asked by: the Stage 9 flow audit's first run.

### A link to nothing has its own page

- Decision: `app/not-found.tsx` shows "Yeh mila nahi" in the person's theme with a "Ghar" link; the layout's hydration applies the theme cookie when a page rendered without one.
- Why: the flow audit found `/bills/<unknown>` in the default theme with no way out.
- Asked by: the Stage 9 flow audit.

### Poocho's index is one row per record, rewritten in place

- Decision: `search_records` holds one row per bill, credit note, customer and item, keyed by (business, kind, source); a record whose fingerprint (status, payments, credit notes, the customer's city, the row's own fields) moved is rewritten in place; an archived customer or item is kept and hidden. The table is not audited (the records it is written from are).
- Why: the MVP's delete-and-reinsert would break 8.3 (nothing is deleted); a bill's text is short enough not to need chunks; auditing derived text would copy every bill into audit_events on every payment.
- Asked by: the Stage 9 prompt (Poocho: hybrid search + grounded answer, salvaged).

### The text is refreshed when someone asks; the embeddings in the worker

- Decision: `askRecords` brings the index up to date before searching (only the moved records are rewritten), so money recorded a minute ago is in the answer; the worker's `index-search` (after each issue, and nightly) fills the embeddings in batches of 64.
- Why: words search must never be stale; an embedding call per question is one short input, per record it is a batch job.
- Asked by: master prompt section 3 ("indexing in the worker") and the MVP's catch-up.

### Search by meaning has a floor

- Decision: a record joins the results by meaning only when its cosine distance to the question is below 0.7 (similarity above 0.3); words have no floor.
- Why: without it the nearest records to a question about nothing come back, and the model is asked to answer from unrelated bills; "Records mein yeh nahi mila" must be reachable.
- Asked by: the Stage 9 integration test ("a question about nothing finds nothing, and asks no model").

### The accountant's questions are recorded too

- Decision: `recordAiCall` allows the accountant (Poocho is every member's).
- Why: rule 9 (every call one row) for a role that may ask.
- Asked by: the Stage 9 roles table (Poocho: accountant "Full.").

### The voice presses only what cannot commit, by default

- Decision: `screens/voice/dom.ts` lets the voice press an in-app link, a choice (a radio chip) or an item marked `data-voice="safe"` (Aage, Abhi nahi, Aur kaam jodo, the back arrow, the GST strip, Poocho's ask); every other button, a link out of the app (WhatsApp) and a download are OWNER-ONLY: the voice lights them with "Yeh aap khud dabao." and the tool answers refused. The model is told which items are OWNER-ONLY in each screen description, and the tool descriptions say so too.
- Why: rule 17 and I6; the MVP matched labels against a list of committing words, which a new button could slip past. Deny by default fails safe.
- Asked by: the Stage 9 prompt ("committing buttons lit, never pressed").

### The voice lives in the root layout

- Decision: `VoiceProvider` wraps every page in `app/layout.tsx` and draws its own highlight; `voiceAvailable()` (a model and a key, or the stand-in) is read on the server. The mic starts the voice where it is available and the tour otherwise; "Bolke" (businesses.voice_on_arrival) starts it on arrival only after the owner has started it once on that phone (the browser asks for the microphone on a tap).
- Why: one conversation must survive moving between screens ("Mehta ka bill banao" opens the form and carries on); a page may not use the microphone or play sound before a tap.
- Asked by: the Stage 9 prompt (voice: "Bolke" opt-in, the mic in the tab bar).

### The build drives the voice through the stand-in

- Decision: under `AI_TRANSPORT=fake` the session endpoint answers `fake: true`; the browser opens no connection and exposes `window.__ekbillVoice.run(tool, args)` and the messages it would have sent, so Playwright exercises the screen descriptions and every tool on real screens. Nothing in production sets `AI_TRANSPORT`.
- Why: no model is called from the build container; the tools are the part that can break the owner's screen.
- Asked by: the Stage 9 tests ("voice unit tests") and the build's rule on model calls.

### The contract helper stores no contract

- Decision: the helper takes the contract's terms (typed, or read from its pasted text) and what was billed before (the instalments ticked, or an amount) each time, works out this bill with the engine, and opens the bill form with the line; no contracts or projects table.
- Why: the Stage 9 prompt says "change nothing permanent"; the bill itself carries the working in its line ("Advance (instalment 1 of 3: 30% of contract value ₹5,00,000)"), so the customer's accountant can follow it. A stored contract that knows its own bills is a later stage's table.
- Asked by: the Stage 9 prompt (contract helper, salvaged).

### One way into the bill form from elsewhere

- Decision: `screens/bill/prefill.ts` (sessionStorage, one hop, read once and removed) carries lines and a GST rate from the voice's start_bill and from the contract helper to `/bills/new?customer=`.
- Why: the form's draft is per person, bill number and customer (Stage 4); a URL with the lines would put the owner's figures in the address bar and the history.
- Asked by: the Stage 9 voice and contract helper.

### The load seed is real bills, tagged, and the only thing ever deleted

- Decision: load-test businesses carry `businesses.load_test`; their bills go through `issueDocument` (real snapshots, numbering and audit trail); `removeLoad` deletes only them and the rows that name them, in one transaction with `session_replication_role = replica` (the no-delete and audit triggers off for that transaction only), as the database owner.
- Why: the Stage 10 prompt asks for the seed and its removal by tag; a seed that skipped the issue path would load-test something that is not the product.
- Asked by: the Stage 10 prompt (load, delete the seed afterwards).

### The disk estimate is measured, not guessed

- Decision: 10 KB per issued document (2.6 KB row, 5.3 KB of audit rows, a payment and indexes, measured on the build's database); the seed refuses a run that would leave less than 8 GB free on the disk the worker sees.
- Why: rule 18; the full run is 600,000 documents, about 6 GB.
- Asked by: the Stage 10 prompt (estimate disk before seeding).

### Rate limits live in the proxy, in memory

- Decision: `proxy.ts` counts writes (every POST, server actions included) per session cookie and sign-in requests (`/dev/switch`, `/api/auth/*`) per forwarded address, in a one-minute sliding window in the web process; over the limit it answers 429 with the dictionary's Hinglish words and Retry-After. `RATE_WRITES_PER_MIN` and `RATE_SIGNIN_PER_MIN` set them (0 turns one off; the journeys run with both off and the limits have their own tests). The gate user's exemption is moot while the gate is off.
- Why: master prompt 4.3 (60 writes a minute per session; sign-in 30 a minute per IP); one web process on one VM, so an in-memory window is exact; a restart forgets, which errs towards letting the owner work.
- Asked by: the Stage 10 prompt (rate limits with Hinglish messages).

### The restore drill checks the copy, then runs the suite beside it

- Decision: `deploy/vm/restore-drill.sh` restores the newest dump into a scratch database in the same Postgres, checks it with `scripts/restore-check.mjs` (every migration recorded, forced RLS and the no-delete and audit triggers on every business table, rows back, every issued snapshot's total adding up), runs the integration suite in a second scratch database there, records the times in `deploy/vm/state/last-restore-drill.json`, and drops both.
- Why: the integration suite empties its database first, so it proves the server and extensions, not the copy; the check proves the copy.
- Asked by: the Stage 10 prompt (restore drill, time recorded).

### Dues are chosen in SQL before the list's limit

- Decision: `listBills({ status: 'due' | 'paid' })` filters by what the bill still owes in SQL (total less live payments and adjustments less issued credit notes) before the limit of 500; Home, the dues list and the customer directory ask for dues as dues. The engine's `balanceOf` still computes every figure shown, and the screen's own filter stays.
- Why: the load seed showed a business with 1,200 bills losing its oldest unpaid bills from Dues (the newest 500 were filtered after the limit).
- Asked by: the Stage 10 load seed (EXPLAIN on 60,000 documents: 10.7 ms for the dues query).

### Home and the bill form read weeks, not the whole book

- Decision: Home reads the last nine weeks of bills (the sparkline, this month, the last three) and orders its chips by `customers.last_billed_at`; the bill form reads the last fortnight (the duplicate guard). Looks (`?as=`) keep the fixtures as they were.
- Why: Home took 120 ms for one owner with 1,200 bills, most of it moving 500 bills it did not show; `listBills` and the balances now read only each bill's total, not its whole totals JSON.
- Asked by: the Stage 10 budgets (Home 400 ms, the bill form 300 ms at p95).

### Phone OTP ends in EkBill's own session

- Decision: Firebase proves the phone (SMS code) and the browser posts its ID token once; the server verifies it (signature, audience, issuer, expiry, and no older than five minutes), finds or makes the person by phone, accepts their invitations, and creates the same `sessions` row and cookie the switcher does. Firebase's token and session cookie are not kept; signing out of Firebase follows at once.
- Why: one identity model for the build and production (I8 and RLS see the same sessions); the MVP's Firebase session cookies would have been a second kind of session.
- Asked by: the Stage 10 prompt (Firebase phone OTP, salvaged).

### The OTP steps stay on one screen

- Decision: with OTP on, the phone and code steps are state inside the login screen (no navigation to `?state=code`), so the pending confirmation survives; in switcher mode the screen is the approved prototype, unchanged.
- Why: Firebase's confirmation lives in the browser's memory between the two steps.
- Asked by: the OTP journey on the emulator.

### Verifying a token needs no key file

- Decision: Firebase Admin runs with application default credentials (the VM's service account through the metadata server) and the project ID; in CI, the emulator. No service-account key is created or stored anywhere.
- Why: the standing rule (never create or download a service-account key); verifying an ID token needs only Google's public keys and the project. The Firebase Authentication Admin role the operator grants covers what Admin calls may need later (revocation checks).
- Asked by: the Stage 10 prompt (Admin credentials through the VM's service account).

## 2026-10-16 — Stage 11

### Advisories are fixed by upgrading, and an unused path is pinned rather than left

- Decision: sharp 0.35.5, fflate 0.8.3 and firebase-admin 14 (which no longer depends on node-forge). The Firebase client's Firestore (never imported; only `firebase/app` and `firebase/auth` are) asks for `@grpc/grpc-js` ~1.9, which has two advisories: a root `overrides` entry lifts it to ^1.14.6. The one remaining advisory, esbuild under drizzle-kit, is moderate and dev only (its development server is never started), and its suggested fix is a downgrade of drizzle-kit to 0.18; it stays, recorded in `docs/audit/DEPENDENCIES.md`.
- Why: an auditor should find no reachable high advisory. sharp and fflate read what people upload.
- Asked by: master prompt Stage 11 (DEPENDENCIES.md with npm audit).

### The one-shot watcher runs every check

- Decision: `npm run watch -- --once` (CI) runs every check and reports every red; the watching mode still stops at the first. In CI, the build and the browser journeys run even when a check is red.
- Why: CI on main had been red since Stage 3 at the unit step (two tests read the CI shell's environment: the rate limits and the seed's switcher allowance), and stopping there hid everything after it, including the integration suite and Playwright. The rule pack's count of unverified entries stays red until `rules:verify` runs on the VM; it must not hide the rest.
- Asked by: Stage 11's clean-clone run (the CI profile from the README alone).

### Coverage counts the unit and integration runs only

- Decision: `npm run audit:coverage` measures vitest with v8 over the product source; the browser journeys are not merged in.
- Why: the journeys run against a separate `next` process, whose coverage would need the server instrumented. The actions and screens read low for that reason, and COVERAGE.md says so; the journeys are listed in TEST-INVENTORY.md.
- Asked by: master prompt Stage 11 (COVERAGE.md).

## 19 Oct 2026: the voice waits to be asked; Home has a star; the language changes in place

- Context: the operator's walk of the live app: the voice started on its own and kept talking while screens were tapped; no clear first action on Home; the language change was a reload; "Save" on Aap stuck; the globe icon unexplained.
- Decision: the voice starts only on a tap of the mic (a hint by the mic once a visit when "Bolke" is on), greets in at most five words, cancels its reply when the owner navigates, and stops after 3 s idle (`IDLE_MS`; prompt `voice/v3`). Home greets by name (`Greeting`) once the person has said it (`isOwnName`: not "Naya user" or "Naya member") and has one star: Naya bill banao, Pehla bill banao, or "Apne baare mein batao" (setup's first step asks the person's own name; Aap's "Aapki profile" changes it). A language change saves, blurs the screen's words, shows the new language's hello, `router.refresh()`es and waits for `<html data-locale>` (falls back to a reload after 8 s). The header carries Theme, Madad and Aapki profile, captioned.
- Consequences: one primary per screen still holds (the first-bill button is an outline while "Apne baare mein batao" is the star); the seeded `new` person is "Naya user" so the unnamed Home is in the baselines.

## 19 Oct 2026: phone OTP through Twilio Verify, not Firebase

- Context: the operator: "we will use twilio for OTP verification".
- Decision: EkBill's server sends and checks the SMS code with Twilio Verify (`apps/web/server/verify.ts`, REST, no SDK); the browser posts the phone, then the code, to EkBill only (`/api/auth/otp/send`, `/api/auth/otp/check`). An API key (SK…) is preferred over the auth token; either comes from `.env` or Secret Manager (`ekbill-twilio-api-key-secret`, `ekbill-twilio-auth-token`) through `up.sh`. Firebase (both packages, the emulator, `firebase.json`, the reCAPTCHA) is gone. Indian mobiles only; five codes an hour and ten tries per ten minutes per number on top of Twilio's own limits. The tests' sender (`OTP_FAKE_DIR`) writes codes to files, as the emulator did, and Compose never passes it.
- Consequences: no IAM grant is needed for sign-in; SMS cost is per verification, so the per-number limits and Twilio's Fraud Guard matter. Sign-in stays off (`AUTH_MODE=switcher`) until the operator turns it on. The SMS is Twilio's default text (English) until the domain-bound template exists; WhatsApp as the channel is a Verify service setting for later.

## 20 Oct 2026: Android fills the sign-in code in by itself (WebOTP)

- Context: the operator asked for the Android auto-fill template. Chrome on Android fills an SMS code only through the WebOTP API, and only from an SMS whose last line is `@<site domain> #<code>`; `autocomplete="one-time-code"` alone is Safari's way.
- Decision: the login screen calls WebOTP on the code step; the server sends `TemplateSid` when `TWILIO_VERIFY_TEMPLATE_SID` is set (else the service's default template applies). Twilio's custom templates are made by Twilio Support, so `deploy/vm/twilio-template.sh` prints the request with this VM's domain: `{{code}} is your {{friendly_name}} code. Do not share it.`, a blank line, `@<domain> #{{code}}` (77 characters with the sslip.io name; WebOTP allows 140).
- Consequences: the template is bound to the domain; a move off the sslip.io name needs a new template. Until Support makes it, Android users type the code (nothing breaks).

## 20 Oct 2026: the welcome and the app demo

- Context: the operator's first-run flow: a recorded greeting, Haan / Na, the language, a 45-second demo across the app that shows the voice filling everything, stoppable anywhere, ending at "Apne baare mein batao" for a first-timer; Hinglish by default; a way for people already billing to see it again (new features, showing a friend).
- Decision: a `DemoProvider` above the screens (`apps/web/screens/demo/`) runs a script of eight steps on the sample business (`?as=owner` looks: never the viewer's records) with the guide ring and caption, filling the bill's first line as the voice would. Every line is a dictionary key (`demo.*`, five languages); its recording is made once by OpenAI's speech model (`OPENAI_TTS_MODEL`, default gpt-4o-mini-tts) and kept in `demo_audio` by its text's hash, so everyone hears the same recording and a changed line is recorded again. Where nothing can be spoken (the build; no key) the phone's own voice reads the caption, or the caption alone stays for its reading time. New sign-ins land on Home (no longer the welcome or setup), where `users.demo_seen_version` = 0 offers the greeting; people already billing get a "naya kya hai" card once per `DEMO_VERSION`, and "App ka demo dekho" on Aap any time; visitors start it from the welcome screen. A first-timer's language choice becomes their app language; someone else's is the demo's only.
- Consequences: raising `DEMO_VERSION` offers the demo again to everyone (for new features). The first playback of a line before up.sh's warm-up has run waits for the model (a few seconds); after it, lines are served from the database.

## 20 Oct 2026: EkBill's own fee and refer-a-friend

- Context: the operator: 20 bills free, then ₹20 a month by UPI; a friend referred gives 25 % off the monthly fee.
- Decision: the rule is pure (`packages/engine/src/plan.ts`): 20 issued bills free (credit notes and cancelled bills not counted); then a month (a calendar month from the day after the paid time, or today) by UPI to `EKBILL_UPI_ID`; the owner types the 12-digit UPI reference and the month starts at once (`claimed`), the operator confirms or rejects it against the bank (`deploy/vm/payments.sh`; a rejection stops the month and gives a used referral back); references are unique across all businesses. Each friend who joins by a business's link (`/r/<code>`, kept in a cookie until setup) and issues a first bill earns that business one month at ₹15; one per payment, unused ones carry over. Enforced in `issueDocument` only when payments are on (`EKBILL_UPI_ID` set): until then nobody is stopped. The seed's busy businesses have `plan_comp_until` 2099; `payments.sh comp` gives any business free months.
- Consequences: no payment gateway: payment is the owner's word until the operator checks the statement. The referred friend gets no discount of their own (only the 20 free bills everyone has); the referrer's discount is per friend per month, not a lifetime 25 %. Both are one constant or one line in plan.ts to change.

## 20 Oct 2026: details are captured where the owner is (the voice saves the business's own details)

- Context: the operator set up "GST nahi hai", started a bill, realised they do have GST and told the voice on the bill screen; the voice sent them to Aap for it. "I would want the agent there to … ask to enter GST there itself and capture it … Voice agent is trying to go to multiple screens to close jobs rather than capturing data there itself."
- Decision: a new voice tool, `update_business` (field: gstin, pan, upi, address, city, pincode, phone, email), saves one of the owner's own business details from any screen through `saveBusinessDetail` (owner only; the same `checkGstin` / `checkProfile` as setup and Aap). A GSTIN makes the business regular (or composition, when the owner says so), with its state and PAN taken from the number. It is the one exception to rule 17 (the voice never commits): it changes the owner's own settings, never a bill, a customer or money, and the voice reads back the last four characters before saving. Prompt `voice/v4` adds "do the job where you are": ask for the detail in place, never navigate to finish a job. On the bill form an owner whose business has no GST sees "GST number hai? Yahan daalo" in the GST place; typed or said, the number is saved on the business and this bill's GST comes on, without leaving the form.
- Consequences: staff cannot change the business (no field, the tool is refused). Every other change to the business still goes through Aap; adding a field to `update_business` is one entry in `BUSINESS_DETAIL_FIELDS` and the action's list.
