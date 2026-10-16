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

- Decision: `documents.search` is a stored generated `tsvector` over the number, the customer's name and GSTIN, with a GIN index; `listBills` matches it or an `ilike` on the number and name.
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
