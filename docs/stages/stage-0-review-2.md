# Stage 0 — independent review

- Reviewed commit: 69e14b7
- Base: stage-0-start
- Head: stage-1-start
- Model: gpt-6.1-sol
- At: 2026-10-15T15:20:24.639Z
- Verdict: clean

---

### (a) Invariants I1–I10

- **I1 — Not exercised by Stage 0 business data.** The Drizzle schema is empty; the migration creates extensions, not business tables. Migration tracking and the worker’s heartbeat queue are operational data, not tenant books (`packages/db/src/schema.ts:1–7`; `packages/db/migrations/0000_ground.sql:1–5`; `apps/worker/src/index.ts:15–22`). Tenant isolation is not yet implemented or demonstrated.
- **I2 — Not exercised.** There is no issuance repository or persisted issued document. The displayed invoice is explicitly fixture data (`docs/ARCHITECTURE.md:31`; `apps/web/app/kit/page.tsx:190–206`).
- **I3 — Not exercised.** Series and documents are deferred; no allocation implementation or concurrency test exists in this diff (`packages/db/src/schema.ts:2–5`; `docs/ARCHITECTURE.md:31`).
- **I4 — Current engine stub is pure, but enforcement is defective.** The engine exports only a version constant (`packages/engine/src/index.ts:1–9`). However, the later ESLint configuration replaces the engine’s `no-restricted-syntax` rule, losing the `Date.now()`, zero-argument `new Date()` and `Math.random()` restrictions (`eslint.config.mjs:55–89`). The fixture kit also performs its own floating-point amount calculation, rather than using an engine calculation (`apps/web/app/kit/KitInteractive.tsx:40–54,89`).
- **I5 — Violation in the checker shipped to enforce it.** It scans only immediate JSON children of `packages/engine/rules`, not the required `rules/gst/*.json`. It checks a `verified` flag rather than `verifiedOn` and never enforces the maximum of three unverified entries (`scripts/rules-check.mjs:11,20–22,41–46`). Its passing result currently proves only that no pack exists (`scripts/rules-check.mjs:13–16`).
- **I6 — No product-model promotion path is added.** The AI package contains configuration only, and no authoritative business tables exist (`packages/ai/src/index.ts:1–24`; `packages/db/src/schema.ts:1–7`). Staging provenance and model-actor rejection are therefore not yet demonstrated.
- **I7 — No authoritative writes, but the request-attribution clause is violated.** The health request has no request ID and emits no attributed request log (`apps/web/app/api/health/route.ts:34–47`). The report’s claimed request-ID fix is absent from this diff.
- **I8 — Not exercised.** There are no business repository writes on which to enforce roles; the database schema remains empty (`packages/db/src/schema.ts:1–7`). This is not evidence that role enforcement works.
- **I9 — Product budgets are not yet exercised; the literal one-primary requirement is not upheld by `/kit`.** `MakeBar` renders a `PrimaryCTA`, and the same kit page also renders a `WhatsAppButton`; both carry `data-primary="true"` (`apps/web/app/kit/KitInteractive.tsx:100`; `packages/ui/src/bill.tsx:209–213`; `apps/web/app/kit/page.tsx:185–188`; `packages/ui/src/primitives.tsx:87–105`). No DOM-count assertion exists in the kit tests (`tests/e2e/kit.spec.ts:17–27,88–94`).
- **I10 — Not yet exercised.** Stage 1 approval and production-screen baselines do not exist in the supplied diff; the generated flow explicitly contains zero screens (`docs/SCREEN-FLOW.md:5–11`). Screenshot tolerance is configured appropriately, but only for the current kit baseline (`playwright.config.ts:23`; `tests/e2e/kit.spec.ts:27`).

### (b) Tests for added actions and route handlers

- **`GET /api/health` → `tests/integration/health.test.ts`.** The handler is defined at `apps/web/app/api/health/route.ts:34–48`; its real-database status test and backup-state test are at `tests/integration/health.test.ts:16–40`.
- **No server actions are added.** The interactive kit uses local React state and callbacks, not server actions (`apps/web/app/kit/KitInteractive.tsx:1–54,99–100`).

### (c) Audit coverage of authoritative writes

- **No writes to the authoritative tables named in I7 are added.** The business schema is empty (`packages/db/src/schema.ts:1–7`). The actual writes are migration bookkeeping and operational heartbeat-queue operations, neither an authoritative business write (`packages/db/migrate.mjs:23–35`; `apps/worker/src/index.ts:17–22`). Audit triggers remain unimplemented, rather than proven working.

### (d) Generated-document reproducibility

- **`docs/FIELD-TRACE.md`: source inspection supports an exact regeneration.** Its empty-table/input content matches the generator’s empty branches and final newline construction; the supplied schema contains no tables (`docs/FIELD-TRACE.md:1–13`; `scripts/trace.mjs:103–124`; `packages/db/src/schema.ts:1–7`).
- **`docs/SCREEN-FLOW.md`: source inspection supports an exact regeneration.** The missing-manifest-directory path returns empty collections, and the renderer emits the supplied empty document (`scripts/flow-map.mjs:21–24,48–59,88–98`; `docs/SCREEN-FLOW.md:1–12`).
- **`tokens.ts` and `themes.css`: regeneration cannot be established from these inputs.** The added radius, guide-colour and guide-shadow values correspond across source and outputs, but `design/tokens/build.py` is not supplied, and the checks do not invoke it or compare regenerated token artifacts (`design/tokens/tokens.json:18–25,127–147,191–211`; `design/tokens/themes.css:12–15,92,104`; `design/tokens/tokens.ts:14–17,124,140`; `scripts/tokens-check.mjs:11–20,55–82`; `scripts/watch.mjs:74–78`).

### (e) Themes and token-only rendering

- **Both explicit themes have screenshot tests**, but those tests check only the theme attribute and absence of `#` in inline styles—not token-only styling or correct theme switching (`tests/e2e/kit.spec.ts:17–27`).
- **Literal typography violates token-only rendering.** Examples include `.eb-pill { font-size: 11px }`, avatar font sizes `14px`, `13px`, `20px`, and literal font weights (`packages/ui/src/ui.css:300–355`). These are not layout dimensions.
- **The checker does not enforce this requirement.** It has no pattern for literal font sizes or weights, named colours, or camelCase inline style properties (`scripts/tokens-check.mjs:12–19`).
- **System-dark rendering and the theme control disagree.** Without a cookie, the root script leaves `data-theme` unset, while `readTheme()` reports Narangi. Theme-specific Harmony structure is selected only by explicit `data-theme='harmony'` selectors, although other rules support system-dark fallback (`apps/web/app/layout.tsx:29–35`; `packages/ui/src/client.tsx:254–263`; `packages/ui/src/ui.css:28–43,680–787`). Thus “system dark” is not equivalent to explicitly selected Harmony.

### (f) Stage-report claims unsupported by this diff

- **“`npm run review:stage -- 0 --head stage-1-start`” reviews Stage 0’s own range.** `--head` is not implemented: the CLI parses only `--base`, and `stageDiff()` always compares to `HEAD` (`docs/stages/stage-0-report.md:3`, supplied Input 4; `scripts/review-stage.mjs:77–81,224–225`).
- **“The kit’s own sample primaries are marked `data-primary="kit"`.”** They are actually marked `"true"` with no kit override (`docs/stages/stage-0-report.md:9`, supplied Input 4; `packages/ui/src/primitives.tsx:87–105`; `apps/web/app/kit/KitInteractive.tsx:100`; `apps/web/app/kit/page.tsx:188`).
- **“`tokens:check` … plus `px` font sizes” and “`rules:check` … verification dates, at most 3 unverified”.** Neither feature exists in the supplied checkers (`docs/stages/stage-0-report.md:12`, supplied Input 4; `scripts/tokens-check.mjs:12–19`; `scripts/rules-check.mjs:20–46`).
- **“`/kit` renders them all.”** Exported components such as `TimelineEntry` and `TopBar` are not rendered by either kit component (`docs/stages/stage-0-report.md:9`; `packages/ui/src/remind.tsx:74–99`; `packages/ui/src/shell.tsx:8–38`; `apps/web/app/kit/page.tsx:1–211`; `apps/web/app/kit/KitInteractive.tsx:1–179`).
- **“The gate is off … `EKBILL_GATE=on` puts the password back.”** The supplied Caddy configuration always enables the gate, and Compose has no `EKBILL_GATE` setting (`docs/stages/stage-0-report.md:79–105`, supplied Input 4; `deploy/Caddyfile:10–15`; `deploy/docker-compose.yml:94–98`).
- **“The engine’s purity lint rules … fixed” and health request attribution “fixed: `apps/web/lib/log.ts`”.** The overwrite remains, and the supplied health handler imports no logger or request-ID helper (`docs/stages/stage-0-report.md:95–105`, supplied Input 4; `eslint.config.mjs:55–89`; `apps/web/app/api/health/route.ts:1–5,34–47`).
- **“`OPENAI_REVIEW_MODEL` resolves to `gpt-6.1-sol` (recorded in DECISIONS).”** The supplied decisions document instead says the ID remains to be recorded (`docs/stages/stage-0-report.md:95–105`, supplied Input 4; `docs/DECISIONS.md:158–162`). Deployment, cron installation and successful external calls cannot otherwise be verified from this diff.

### Additional code defects

- **First-time backup scheduling fails under `set -euo pipefail`.** With no existing crontab—or a crontab containing only the previous backup entry—the `crontab -l | grep -v …` pipeline returns nonzero. The subshell exits before appending the new line, while downstream `crontab -` receives empty input. **Failing input:** run `deploy/vm/schedule-backup.sh` for a user with no crontab (`deploy/vm/lib.sh:6`; `deploy/vm/schedule-backup.sh:11`).
- **Normal workspace edits make the watcher falsely red.** The changed-package run filters Vitest by paths such as `packages/ui`, but the supplied tests reside under `tests/unit`; there are no matching package tests and no `--passWithNoTests`. **Failing input:** save `packages/ui/src/primitives.tsx` while the watcher runs (`scripts/watch.mjs:55–70`; `vitest.config.mts:28–32`).
- **Review success can be parsed from a rejected or contradictory response.** `parseVerdict()` accepts the first matching substring anywhere, rather than exactly one terminal verdict line. **Failing input:** `Example: VERDICT: no new code defect\nVERDICT: defects found` returns `clean` (`scripts/review-stage.mjs:109–113`).
- **Oversized diffs receive incomplete reviews without blocking success.** The script truncates the diff and still allows a clean verdict. **Failing input:** a stage diff exceeding 700,000 characters with a defect after the cutoff (`scripts/review-stage.mjs:20,92–94,185–187`).
- **A report need not be committed before review.** The script checks only filesystem existence and reads the working-tree report alongside a committed diff. **Failing input:** create or modify an uncommitted stage report, then invoke review; the recorded commit does not contain the reviewed report (`scripts/review-stage.mjs:169–179,189–193`).
- **The documented fresh-clone migration command does not load `.env`.** Copying `.env.example` to `.env` does not export `DATABASE_URL`, and the Node migration entry point reads only `process.env`. **Failing input:** follow the README in a shell without an exported `DATABASE_URL`; `npm run db:migrate` exits immediately (`README.md:8–12`; `package.json:36`; `packages/db/migrate.mjs:51–56`).
- **Health accepts an explicitly empty backup as a valid backup.** Only its timestamp is validated. **Failing input:** backup state `{"at":"2026-10-15T00:00:00Z","bytes":0}` is reported as a backup, contrary to the non-empty-backup requirement (`apps/web/app/api/health/route.ts:22–28`; `CLAUDE.md:119–121`).
- **The readiness script exits successfully after an HTTP failure.** After polling expires, the final `curl` lacks `--fail`, so a persistent 503 is printed and deployment continues successfully. **Failing input:** reachable app whose `/api/health` continually returns 503 (`deploy/vm/up.sh:51–60`).
- **Repeat-fill does not refill the lines.** “Fresh” clears the lines, but “fill” changes only the filled flag. **Failing input:** click the fresh-bill control, then the repeat-fill control; the UI claims completion while retaining the blank line (`apps/web/app/kit/KitInteractive.tsx:64–68`).
- **Signature ink does not follow theme changes.** Canvas stroke colour is captured only when the effect runs for `height`. **Failing input:** load Narangi, switch to Harmony, then draw; the stroke retains the old theme’s text colour (`packages/ui/src/client.tsx:107–120,274–285`).
- **Small icon buttons lose their base styling.** Spreading `rest` after `className="eb-iconbtn"` replaces—not merges—the base class. **Failing input:** render a removable line item or attachment edit button, both of which pass `className="eb-iconbtn--small"` (`packages/ui/src/primitives.tsx:141–149`; `packages/ui/src/bill.tsx:97–99`; `packages/ui/src/remind.tsx:67–69`).

VERDICT: defects found
