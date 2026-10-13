# EkBill v2 — rules for the build agent

This file is sections 2–5 of `docs/MASTER-PROMPT.md`, copied verbatim, followed by the design pack's own rules. Read the master prompt for the stage prompts (section 7) and the reference data (section 8). The version of Next.js here is newer than training data: read `node_modules/next/dist/docs/` before writing app code.

## 2. Operating rules

These go into `CLAUDE.md` verbatim.

1. **Stage by stage.** Do only the current stage. If something from a later stage is needed to make this one work, build the smallest stub, name it in the report, and stop.
2. **Every stage ends** with: watcher green, the app running on the VM (`curl localhost:8080/api/health` returns ok), the draft `docs/stages/stage-N-report.md` written and committed, living documents updated, the independent review run on that commit (rule 12), findings fixed, the final report committed and pushed to `main`, then STOP with the report printed.
3. **Tests with the code, not after.** Unit tests for every rule, calculation and state transition. Integration tests for every server action and route handler against a real Postgres. One Playwright journey per stage at 390px in both themes; the shell (tab bar, top bar, one list) also at 1280px. A test is named for the behaviour it protects.
4. **Read `.watch/status.json` before every commit.** Red blocks the commit. Never skip, `.todo`, or mark a test expected-failure to get green. If a test is wrong, fix the test and say so in the commit message.
5. **Small commits** after each working increment, conventional messages (`feat(bills): …`). Tag each stage start `stage-N-start`.
6. **The MVP is a read-only input.** `~/easybills` (tag `mvp-final`) is never imported at runtime and never edited. Code copied from it carries `// from mvp-final: <path>` and comes with its tests. Section 8.1 lists what is worth copying; the rest is rewritten.
7. **The design pack is the visual law, not the product spec, and what the operator approves is what ships.** Stage 1's screens are the production screens: the same files, components, tokens, textures and copy keys the wired app serves. Later stages change the data behind a screen, never its design (I10). `design/` decides how things look: every colour, radius, shadow, gradient, glass surface and type size comes from `design/tokens/themes.css` (`var(--eb-…)`), imported from the workspace, never copied; only the font files are copied into static assets at build. Every screen renders in both themes (Narangi light, Harmony dark) and is compared with the reference PNGs. **This prompt decides the screen flow, the buttons, the words, the product concepts and the guide highlight.** Where `design/CLAUDE.md` or `design/README.md` states a product rule (what Home contains, which tabs exist, what a string says, "no periods or returns", what the accent may be used for), section 8.0 of this document wins, and the flow approved in Stage 1 wins after that. A value the pack lacks (e.g. the guide highlight `--eb-guide`) is added to `design/tokens/tokens.json` and regenerated, never hard-coded. New screens are built from `design/components.md`'s vocabulary and added to `design/screens/<theme>/` as generated PNG references.
8. **One language per layer.** TypeScript for the app, worker, packages and tests. Scripts in `scripts/` may be `.mjs`; k6 load scripts are `.js`; `design/tokens/build.py` is the one Python file and is run only to regenerate tokens. SQL in migrations and `*.sql` files only.
9. **Every model call goes through `packages/ai`**: typed input and output (zod), a versioned prompt loaded from `packages/ai/prompts/<name>/v<N>.md`, a retry policy, a timeout, and one row in `ai_calls` per call. No `fetch` to a model endpoint anywhere else.
10. **Keep the folder layout** (section 5). A new top-level folder is added to `docs/ARCHITECTURE.md` in the same commit that creates it. No `utils/`, `misc/`, `helpers/`, `temp/`, `old/`.
11. **Secrets by environment variable.** `.env` is gitignored and lives on the VM (paste 3); `.env.example` lists every name with a one-line meaning. Production values come from Secret Manager through `deploy/vm/up.sh`. Secrets never appear in chat, in a commit, in a log line or in an error message.
12. **Independent review before every stage report, from Stage 0 onward.** `npm run review:stage -- N` sends to the **OpenAI model** named by `OPENAI_REVIEW_MODEL`, in a fresh context with no access to this session, exactly four things: the stage diff (`git diff stage-N-start..HEAD`, which includes the committed draft report), `CLAUDE.md`, the stage prompt, and `docs/stages/stage-N-report.md`. It answers a fixed checklist and nothing else: (a) every invariant upheld, citing file and line, or the violation; (b) every action and route added has a test; (c) every write to an authoritative table is audited; (d) generated documents regenerate without diff; (e) every screen touched renders in both themes from tokens only; (f) any claim in the stage report that the code does not support. Fix every finding and rerun until it reports **no new code defect**. Findings that cannot be resolved by code (by-design behaviour, statements a diff cannot prove, decisions pending from the operator) go in the report with a one-line rationale and do not block the stage.
13. **Security that is deferred is listed, not forgotten** (section 4.3). Do not add it early; do not drop it from the list.
14. **Living documents in the same commit** as the code that changes them (section 5.3).
15. **Simplicity wins ties.** The owner raises a bill a week to the same dozen people from a phone. When two designs tie, choose the one with fewer taps and fewer words; when correctness and simplicity conflict, correctness wins and the complexity is hidden behind a default, never removed.
16. **Hinglish on screen, English on the bill.** Every string the owner sees comes from `packages/copy` with `en` and `hi-Latn` forms; the printed document is English with Indian number formatting. No jargon in Hinglish (the MVP's copy tests enforce this; keep them).
17. **The voice lights up what it talks about.** Every section, field and button that voice or the guide can mention carries a `data-guide` id; when voice says it, the guide highlight (token `--eb-guide`, a glow ring plus a caption bubble) moves to it. Voice never presses a committing button (Bill banao, WhatsApp, Save, Paise aa gaye, Cancel, Bhejo); it lights it up and asks. It may press navigation and "Aage".
18. **Shared VM discipline.** Never touch the tariff or fdre products: not their compose projects, containers, images, volumes (`tariff_pgdata`, `ekbill_pgdata` and friends), ports (3000, 5432, 5433, 8000), firewall rules, Terraform state, or files outside `~/ekbill` and `~/easybills`. Never run `docker system prune` or `docker volume prune`. v2's compose project is **`-p ekbill2`** (the MVP's was `ekbill`). Never run `gcloud compute instances add-metadata`, `set-service-account`, `add-tags`/`remove-tags`, any IAM or firewall command, or edit sshd, ufw, iptables or `/etc/ssh`; `sudo` only for `apt-get install` of a named tool and for the cron line; never `apt-get upgrade` the host. Check free disk at the start of every session and before any seed or build; below 8 GB, stop, run `deploy/vm/free-space.sh`, and if still below 8 GB write the report as "blocked on disk" and STOP.
19. **Rate limits.** Analyse sequentially; use file trees and greps, not whole-directory reads. On a 429, wait 60 seconds and resume.
20. **Rebuild images when dependencies change**, and check container health at the start of each session.
21. **Ask once, in writing.** Questions for the operator go at the end of the stage report, numbered. Do not stop mid-stage to ask unless an invariant would otherwise be violated.

---

## 3. Invariants

These hold in every stage and override anything else in this document. If a stage prompt conflicts with one, the invariant wins and the agent flags the conflict in the report.

**I1 — Tenancy is total.** Every table that holds business data has a `business_id` column, `NOT NULL`, with a foreign key, and row-level security with a policy on `current_setting('app.business_id')`, set per transaction by `withTenant()`. The only tables without `business_id` are `users`, `sessions`, `memberships` (which maps users to businesses and is read once per request, before a scope exists, by `packages/db/auth.ts#resolveScope()`), and `audit_events`' own append path. Every other repository function takes a `TenantScope` (business id, acting user id, role, request id) as its first argument; `tests/integration/tenancy.test.ts` is generated from the repository module list: scope A sees and changes nothing of B.

**I2 — One writer for issued documents.** Only `packages/db/repos/documents.ts#issueDocument()` moves a document to `status = 'issued'`, allocates its number and writes its `issued_snapshot`; it does so in one transaction by calling the pure engine (`packages/engine/issue.ts#prepareIssue()`: assess, compute tax, build the snapshot) and then the numbering allocation and the writes. A Postgres trigger refuses any `UPDATE` to `number`, `issued_at`, `issued_snapshot`, `totals` or `lines` on a row whose status is `issued` or `cancelled`. Corrections are new documents (credit note, cancel-and-redo) that link back. Everything a customer sees (PDF, JPG, receipt, WhatsApp text, GST workings) is rendered from `issued_snapshot`, never from the live business or customer record.

**I3 — Numbers are gapless, per series, per financial year, and never reused.** Allocation happens inside the issuing transaction with `SELECT … FOR UPDATE` on the series row; a unique index on `(business_id, series_id, financial_year, number)` backs it. 50 concurrent `issueDocument()` calls on one series produce exactly 1…50. The MVP's numbering behaviour (prefix, zero padding, optional FY suffix, next number only goes up, FY rollover) is kept as is.

**I4 — Money and tax are deterministic, integer, and come from one engine.** `packages/engine` is pure: no I/O, no database, no model call, no floating point, no `Date.now()`; dates and the rule pack are passed in. Integer paise, integer basis points, rounding specified in `packages/engine/money.ts`. `packages/engine/tax.ts#computeTax()` is the only tax calculation; the bill form preview, the PDF, the receipt and the GST workings all read its output, and `tests/unit/one-engine.test.ts` asserts they agree on a fixture set.

**I5 — GST rules are versioned data, not code.** Rates, selectable rates, document types and their mandatory fields, HSN digit requirements, e-invoice thresholds, composition limits, place-of-supply rules and return calendars live in `packages/engine/rules/gst/*.json`, each entry with `effectiveFrom`, `effectiveTo`, `source` (an official URL), `verifiedOn`, `verifiedBy`. The engine selects by document date; a document's snapshot records the pack version. A rule change is a data change with a fixture test. `npm run rules:check` fails on an entry without a source or a verification date, and on more than 3 entries marked `unverified`.

**I6 — Model output lands in staging only.** Anything a model produces is written to `extractions` or `ai_calls` with provenance (input hash, model, prompt version, per-field confidence) and becomes a bill, a customer or a setting only when a human taps the button that commits it. A trigger forbids inserts into authoritative tables when `current_setting('app.actor_kind', true) = 'model'`.

**I7 — Every authoritative write is audited and attributed.** `documents`, `payments`, `adjustments`, `customers`, `items`, `businesses`, `memberships`, `series` each have a trigger appending to `audit_events` (business_id, actor user id, actor kind, table, row id, action, before, after, request id, at). `audit_events` is append-only. Every request carries a request id that reaches the logs and the audit row.

**I8 — Roles are enforced at the repository, not the screen.** `TenantScope` carries the role; each repository write declares `allowedRoles`; `tests/integration/roles.test.ts` is generated from those declarations (section 8.3). The UI hides what a role cannot do; hiding is not the enforcement.

**I9 — The golden path is measured, and it stays short.** A tap is one pointer press on a control; typing into a field counts as one tap for the field (the keyboard's keys are not counted). From Home, a bill for a known customer with last month's lines is issued and handed to WhatsApp in **≤ 4 taps** (chip, "Haan, wahi bharo", Bill banao, WhatsApp pe bhejo); recording its full payment takes **≤ 3 taps** from Home (dues row, Paise aa gaye, Poore). `tests/e2e/golden-path.spec.ts` counts the taps and times path (a) at ≤ 20 s on Playwright's "Slow 3G / 4× CPU" profile from the Home tap to the share-sheet call. A change that breaks either budget fails CI. Every screen state renders at most one `PrimaryCTA` or `WhatsAppButton`; the test asserts it in the DOM.

**I10 — What was approved is what ships.** The screens the operator approves in Stage 1 are built from `packages/ui` and `apps/web/screens` at final fidelity (both themes, the pack's depth, textures and glass, real copy keys, real fonts), on fixtures. Wiring (Stages 4–9) swaps the fixture data source for repositories and actions and may not change markup, class names, tokens or copy; the Stage 1 visual baselines (`tests/e2e/__screenshots__`) are the regression gate for every later stage (pixelmatch 0.1, max 0.5 % differing pixels). A baseline may be re-recorded only with a reason in the stage report and the operator's written answer; "the data looked different" is not a reason, because fixtures and real data must render identically.

---

## 4. Locked decisions

Not reopened unless analysis of the MVP shows something materially better; then `docs/DECISIONS.md` records why.

### 4.1 Stack

| Area                   | Decision                                                                                                                                                                                                                                                 | Why                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Repository             | **`Ergplan/ekbill`**, branch `main`; the MVP stays in `Ergplan/easybills` at tag `mvp-final`, checked out read-only at `~/easybills`                                                                                                                     | A clean history for the audit; the MVP readable on disk                            |
| Layout                 | npm workspaces monorepo: `apps/web`, `apps/worker`, `packages/engine`, `packages/ai`, `packages/db`, `packages/copy`, `packages/render`, `packages/ui`, plus `design/` (the pack, imported as a workspace package `@ekbill/design`)                      | The engine stays pure and testable; UI primitives are the only consumers of tokens |
| Language               | TypeScript 5.x, strict                                                                                                                                                                                                                                   | One language per layer; the proven engine is TypeScript                            |
| Web app                | Next.js 16 App Router, React 19, server actions for writes, route handlers for files, standalone output                                                                                                                                                  | Works on phones and on the VM; SSR for slow Android browsers                       |
| UI                     | `packages/ui`: components from `design/components.md` plus the ones v2 adds (listed in Stage 1); CSS with the pack's tokens; no Tailwind, no component library; both themes always                                                                       | The pack's depth, textures and glass are the quality bar                           |
| Themes                 | Narangi (light, default) and Harmony (dark); `users.theme = narangi \| harmony \| system`; `data-theme` on `<html>`                                                                                                                                      | From the pack                                                                      |
| Database               | PostgreSQL 16 with pgvector, **relational columns**, not jsonb documents                                                                                                                                                                                 | 500 tenants need indexes, constraints, RLS and reporting                           |
| ORM and migrations     | Drizzle ORM with `drizzle-kit` SQL migrations in `packages/db/migrations`; drift check in the watcher and CI; triggers and RLS by hand in the same migrations                                                                                            | Typed schema in code, plain SQL on disk                                            |
| Background work        | `apps/worker` with `pg-boss` (Postgres-backed queue): read-bill, render-other-sizes, index-search, reminders-due, backup-check                                                                                                                           | No Redis; jobs are rows, so they are auditable                                     |
| Auth                   | Firebase Auth phone OTP (as the MVP), server-minted session cookie; **during the build** `AUTH_MODE=switcher` (section 4.3)                                                                                                                              | OTP is what these users have                                                       |
| Tenancy and roles      | One business per tenant; memberships with role `owner`, `staff`, `accountant`; invite by phone                                                                                                                                                           | I1, I8                                                                             |
| Models                 | OpenAI through `packages/ai`: a vision-capable model for photographed bills, a text model for Poocho, Realtime for voice; model IDs by environment variable; defaults recorded in the decisions log                                                      | The account and key exist; reviewer and auditor are OpenAI, the builder is not     |
| Reviewer               | `OPENAI_REVIEW_MODEL` is the exact model ID the operator writes in `.env` (paste 3); Stage 0 only checks it resolves against the account's models list and records it                                                                                    | Rule 12; an agent cannot guess an ID from a nickname                               |
| Printed-document OCR   | docling-serve (existing image) for printed PDFs and scans; the vision model for handwriting, with Docling text as a hint                                                                                                                                 | Docling is cheap and local                                                         |
| PDF and images         | Playwright Chromium in the app image: HTML → PDF (A4/A5/80mm/58mm) and JPEG; the InvoicePaper is theme-independent; **the chosen format is rendered synchronously at issue** (budget 3 s) so the done screen has it; other sizes by the worker on demand | The done screen is on the golden path                                              |
| Search / Poocho        | Postgres full text + pgvector hybrid (MVP design), indexing in the worker                                                                                                                                                                                | Local                                                                              |
| Voice                  | OpenAI Realtime over WebRTC, server-minted client secrets, tools that light up, fill and press navigation; never commits (I6, rule 17); wired in Stage 9                                                                                                 | MVP design                                                                         |
| Copy                   | `packages/copy`: one dictionary `{en, hi-Latn}` seeded from `design/copy/strings.json` and the MVP's dictionary, with the MVP's jargon and length tests                                                                                                  | Rule 16                                                                            |
| Logs and metrics       | `pino` JSON logs with request id and business id, phones masked; `/api/health`; `/api/metrics` (Prometheus text, Stage 10)                                                                                                                               | Enough to run 500 businesses on one VM                                             |
| Deployment             | Docker Compose project **`ekbill2`** on `tariff-order`: `db` (volume `pgdata` → `ekbill2_pgdata`), `docling`, `app` on 127.0.0.1:8080, `worker`, `caddy`; one image for app and worker; the MVP's `deploy/vm/*.sh` adapted with the project name changed | Separate from the MVP's `ekbill` project and its volume                            |
| CI                     | GitHub Actions on push to `main`: the watcher's checks plus Playwright on a Postgres service (`@slow` excluded). Load at 1/10 scale and model evals run on `workflow_dispatch` only                                                                      | The watcher is for the agent; CI for everyone; no recurring spend                  |
| Testing                | vitest (unit, integration), Playwright (journeys, visual snapshots, tap counts), k6 (load, Stage 10)                                                                                                                                                     | What the MVP used, plus load and visual                                            |
| Accountant exports     | **One zip**: `workings.xlsx`, every PDF of the period, `gstr1.json` in the GSTN offline-tool format; "CA ko bhejo" opens the share sheet with the zip (WhatsApp, email, Drive)                                                                           | Operator's answer                                                                  |
| Composition businesses | Bill of supply with the mandatory legend; the GST tab is hidden (Aap shows "Composition: bill of supply only · CA ko PDFs bhejo"); no workings                                                                                                           | Operator's answer                                                                  |
| Debit notes            | Out of scope for v2 (section 4.2)                                                                                                                                                                                                                        | Rare for these owners; a credit note and a new bill cover the cases                |

### 4.2 Product scope for v2

Kept from the MVP: the front-desk home, one-question-at-a-time setup, three-field bill lines, "Pichle jaisa hi", WhatsApp share with PDF or photo, Kiske paise aane hain, Yaad dilao with tone and the customer's language, Likh lo, GST tab only when registered (regular), the guide highlight, voice, Poocho, old-bill import, contract billing helper, bill designs and paper sizes, logo.

New in v2: the design pack's look in two themes; roles and invites; PAN and GSTIN capture with checksum and consistency checks; a drawn signature; photographed handwritten bill → clean bill; an items master with HSN/SAC and rates; multiple numbering series; credit notes as first-class documents; GST workings (GSTR-1 tables, HSN summary, 3B figures) with rule-pack versioning; per-bill GST checks in plain Hinglish; e-invoice readiness (the IRN field); the CA pack; backups with a tested restore; metrics; load-tested for 500 businesses.

Out of scope for v2: filing on the GST portal; IRN generation through an IRP; e-way bills; TDS/TCS under GST; composition returns; debit notes; inventory; purchases and ITC; multi-currency; multi-GSTIN per business; payroll; a desktop-first layout (desktop is the phone layout centred with a side rail); a paid "explain this rule" model call (rule explanations are the pack's own `{en, hi-Latn}` text, shown directly).

### 4.3 Security posture during the build (deferred, explicitly)

The operator's instruction: keep security low during development and testing so the VM is never locked or stopped. Rule 18 lists what the agent may never run on the host.

| Deferred                                                 | Until                                                                                                      | Meanwhile                                                                                                                                                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phone OTP sign-in                                        | Stage 10                                                                                                   | `AUTH_MODE=switcher`: `/dev/switch` lists seeded users and sets the session cookie. Roles and tenancy are still enforced (I1, I8). Stage 10 turns OTP on with a one-line rollback.             |
| Rate limits                                              | Stage 10 (60 writes/min per session; sign-in 30/min per IP, the gate user exempt)                          | Caddy's basic-auth gate stays in front of the app                                                                                                                                              |
| WAF, bot checks, secret rotation, KMS, DLP               | Later                                                                                                      |                                                                                                                                                                                                |
| SSH restrictions, deny rules, IP allowlists, IAM changes | **Never in this build**                                                                                    | The firewall is not changed except the existing `ekbill-allow-web` rule. Where a later stage needs an IAM grant (Firebase Admin for OTP), the operator makes it; the agent asks in the report. |
| Row-level security, audit log                            | **On from Stage 2**                                                                                        | Not deferred                                                                                                                                                                                   |
| HTTPS                                                    | **On**                                                                                                     | Caddy                                                                                                                                                                                          |
| Backups                                                  | **On from Stage 0**: nightly cron, last dump checked non-empty by `/api/health`; restore drill in Stage 10 |                                                                                                                                                                                                |

Data on the VM during the build is test data. Every stage report repeats: "Sign-in is switched off; do not put a real business's books here yet."

---

## 5. Folder layout, continuous testing, living documents

### 5.1 Layout

```
ekbill/
  design/                # the design pack, as delivered; a workspace package (@ekbill/design) exporting tokens/themes.css, fonts.css, copy, fixtures
  apps/
    web/                 # Next.js: screens, server actions, route handlers; no business rules
      app/               #   routes
      screens/           #   one folder per screen: component tree, fixture states, manifest.ts (route, purpose, primary action, taps, data-guide ids, roles)
      actions/           #   server actions: validate input, call a repository or service, return ActionResult
      server/            #   server-only helpers: session cookie, resolveScope, request id, logger, auth modes
      lib/               #   browser-side helpers only: guide highlight, voice client, share sheet
    worker/              # pg-boss workers
  packages/
    ui/                  # components from design/components.md + v2's, tokens only, both themes; /kit renders them all
    engine/              # pure TypeScript: money, dates, ids, tax, rules, assess, numbering, prepareIssue, workings, contract
      rules/gst/         #   the GST rule pack (JSON, versioned, sourced) + fixtures; hsn-index.json
    db/                  # Drizzle schema, migrations (SQL), repositories (TenantScope first; issueDocument lives here), auth.ts (resolveScope), triggers, RLS
    ai/                  # the one model client: prompts/<name>/v<N>.md, typed calls, ai_calls, evaluation sets
    copy/                # the dictionary {en, hi-Latn} and its tests
    render/              # InvoicePaper HTML templates (designs, papers), shared by app and worker
  deploy/                # Dockerfile, docker-compose.yml (project ekbill2), Caddyfile, vm/*.sh
  scripts/               # watch.mjs, review-stage.mjs, seed.mjs, flow-map.mjs, trace.mjs, load/*.js (k6)
  tests/
    unit/                # mirrors packages/*
    integration/         # against a real Postgres: repositories, actions, triggers, RLS, roles, tenancy
    e2e/                 # Playwright: journeys, golden-path tap counts, visual snapshots, flow audit
    fixtures/            # bills, kaccha-bill photos (real/ from the operator, with ground truth), rule fixtures, expected PDFs
  docs/
    MASTER-PROMPT.md     # this file
    SCREEN-FLOW.md       # generated from the manifests
    ARCHITECTURE.md      # living
    DECISIONS.md         # living, dated
    KNOWN-GAPS.md        # living
    FIELD-TRACE.md       # generated: every user-visible field → table.column → who may write it
    stages/              # stage-N-report.md, stage-N-review-k.md, stage-1-answers.md
    audit/               # Stage 11
  .watch/                # watcher status.json and log (gitignored)
  CLAUDE.md              # sections 2–5 verbatim, then design/CLAUDE.md's "Always" list; its "Never" list is copied minus the items section 8.0 overrides
```

### 5.2 Continuous testing

`npm run watch` starts beside the app in Stage 0 and stays running in a tmux window. On every save it runs, stopping at the first red: `eslint`, `prettier --check`, `tsc --noEmit` for every workspace, vitest unit tests for the changed package then the full unit suite, `drizzle-kit check`, `npm run rules:check`, `npm run tokens:check`, `npm run trace:check`, `npm run flow:check`, and the integration suite when `packages/db` or `apps/web/actions` changed. It writes `.watch/status.json` (`{ ok, failed: [...], at }`) and `.watch/log`. Playwright, load and paid-model calls are `@slow`: run at the stage boundary and on `workflow_dispatch`.

`tokens:check` is exact: in `apps/web` and `packages/ui`, any `.css`, `.tsx` or `.ts` file matching `#[0-9a-fA-F]{3,8}\b`, `rgba?\(`, `hsla?\(`, a `border-radius` with a `px` value, a `box-shadow` whose value is not `none`, a `var(--eb-…)` or an inset ring coloured by a token, or `font-family:` fails, unless the file path is listed in `tokens-allow.txt` with a one-line reason (fonts.css, the InvoicePaper template which is theme-independent by design). Pixel sizes for layout are allowed.

### 5.3 Living documents

- `docs/SCREEN-FLOW.md` (generated by `scripts/flow-map.mjs` from the manifests): every screen with its purpose, primary action, other taps and their destinations, fixture states, `data-guide` ids, roles; the golden paths with their exact tap sequences and measured counts. The `/flow` screen renders the same data.
- `docs/ARCHITECTURE.md`: components, data model table (every table: purpose, who writes), the critical paths with real function names, the action and route surface with roles, deployment; "What changed in Stage N" appended each stage.
- `docs/DECISIONS.md`: dated entries: decision, options, why, who asked.
- `docs/KNOWN-GAPS.md`: what is knowingly incomplete, with the stage or condition that closes it.
- `docs/FIELD-TRACE.md`: generated by `scripts/trace.mjs` from zod schemas and Drizzle tables; CI fails on drift or on a field with no owner.

---

---

## Design pack rules (from `design/CLAUDE.md`)

Where these conflict with the master prompt on flow, tabs, text, product concepts or the guide highlight, the master prompt wins.

## Always

- **Tokens only.** Every colour, gradient, shadow, radius, size and font comes from `design/tokens/themes.css` (`var(--eb-…)`) or `tokens.ts`. No hex codes, rgba() or px radii in components. If a value is missing, add it to `tokens/tokens.json`, run `python3 design/tokens/build.py`, and use the new variable.
- **Both themes.** Every component must render correctly with `data-theme="narangi"` and `data-theme="harmony"`. Check both before you finish. A component that only works in one theme is a bug.
- **Strings from the dictionary.** All UI text comes from `design/copy/*.json` by key. Add a key to `copy/strings.json` (both `hi-Latn` and `en`), then regenerate the per-language files. Hinglish is the default.
- **Match the reference.** Compare your screen with `design/screens/<theme>/<screen>.png` at 390px width. Same hierarchy, spacing and order of elements.
- **Mobile first.** Design at 390px. Touch targets ≥ 44px. Nothing scrolls sideways.
- **Money** is integer paise in code. Format with Indian grouping (`₹1,12,400`) and `font-variant-numeric: tabular-nums` (`.eb-num`). Hero amounts use regular Urbanist; no dot-matrix or display fonts.
- **Accessibility.** Real `<button>`, `<a>`, `<input>` with `<label>`. `aria-label` on icon-only buttons. Status is a word plus colour, never colour alone. Text on gradients meets 4.5:1 (3:1 at 24px+).

## Never

- Put Hinglish, gradients, glass or theme colours on the **invoice/PDF**. It is always white paper, `--eb-invoice-ink`, formal English (`invoice.*` keys).
- Use `--eb-whatsapp` anywhere except the WhatsApp send button.
- Show the GST tab or `/gst` route when `profile.gstin` is empty.
- Load fonts from Google at runtime. Use `design/tokens/fonts.css`.
