# Stage 0 — independent review

- Reviewed commit: 69e14b7
- Base: stage-0-start
- Head: stage-1-start
- Model: gpt-6.1-sol
- At: 2026-10-15T17:16:41.563Z
- Verdict: defects

---

### (a) Invariants I1–I10

- **I1:** No business tables or tenant repositories are introduced; the schema is empty. Tenancy enforcement is not implemented yet, rather than proven upheld (`packages/db/src/schema.ts:1–7`).
- **I2:** No issuance implementation or persisted issued documents exist. The invoice shown is explicitly fixture data, not a production issuance path (`apps/web/app/kit/page.tsx:188–205`).
- **I3:** No numbering allocation exists; the displayed invoice number is a fixture (`apps/web/app/kit/page.tsx:192`). Concurrency and gaplessness are not yet testable.
- **I4:** The engine itself is a constant-only stub (`packages/engine/src/index.ts:1–9`). However, the purported purity enforcement is defective: the later ESLint block replaces the engine’s `no-restricted-syntax` rules, removing its clock/randomness restrictions (`eslint.config.mjs:55–88`). Fixture arithmetic also uses floating-point parsing outside the engine (`apps/web/app/kit/KitInteractive.tsx:40,54`).
- **I5 — violation:** `rules:check` scans only JSON files immediately under `packages/engine/rules`, not the mandated `rules/gst` directory. It checks a `verified` flag but neither verification dates nor the maximum of three unverified entries (`scripts/rules-check.mjs:11,20–22,42–46`).
- **I6:** No business-model output is committed to authoritative tables in this stage; the AI package is configuration only (`packages/ai/src/index.ts:1–24`). Model-actor database protection remains unimplemented (`packages/db/src/schema.ts:1–7`).
- **I7 — violation:** The added health request has no request ID or request logging (`apps/web/app/api/health/route.ts:34–48`). No authoritative business writes exist to audit yet (`packages/db/src/schema.ts:1–7`).
- **I8:** No repository writes or role-bearing scope exist; role enforcement is deferred, not demonstrated (`packages/db/src/schema.ts:1–7`, `packages/db/src/index.ts:5–8`).
- **I9 — violation as written:** `/kit` simultaneously renders a `MakeBar` containing `PrimaryCTA` and a `WhatsAppButton`; both receive `data-primary="true"`. There is no DOM assertion limiting primaries (`apps/web/app/kit/KitInteractive.tsx:100`, `apps/web/app/kit/page.tsx:186`, `packages/ui/src/primitives.tsx:88,100`, `tests/e2e/kit.spec.ts:18–27`). A kit exemption would need to be explicitly documented; the supplied diff does not implement the report’s claimed exemption.
- **I10:** No Stage 1 approved screens or baselines are being modified in this diff. The only visual regression test introduced is the kit baseline test (`tests/e2e/kit.spec.ts:18–27`).

### (b) Server actions and route-handler tests

- **`GET /api/health` → `tests/integration/health.test.ts`:** Both normal database status and backup-age reporting have real-database integration tests (`apps/web/app/api/health/route.ts:34–48`, `tests/integration/health.test.ts:16–40`).
- **No server actions are added.** The interactive kit uses local state and a no-op make handler, not a server action (`apps/web/app/kit/KitInteractive.tsx:43–53,100`).

### (c) Auditing authoritative writes

- **No writes to the authoritative business tables are introduced.** The schema is empty; the migration runner writes only migration bookkeeping (`packages/db/src/schema.ts:1–7`, `packages/db/migrate.mjs:24–35`). There is consequently no new authoritative business write missing an audit trigger.

### (d) Generated artifacts

- **`docs/FIELD-TRACE.md`:** Its empty-table/empty-input output matches the generator and empty schema shown (`docs/FIELD-TRACE.md:6–13`, `scripts/trace.mjs:101–122`, `packages/db/src/schema.ts:7`).
- **`docs/SCREEN-FLOW.md`:** Its zero-screen output matches the generator’s no-manifest branch (`docs/SCREEN-FLOW.md:5–12`, `scripts/flow-map.mjs:24,57–59,88–89`).
- **`tokens.ts` / `themes.css`:** The added radii, guide colours and guide shadows correspond to the added JSON values (`design/tokens/tokens.json:18–25,127–147,191–211`, `design/tokens/themes.css:12–15,92,104,145,157`, `design/tokens/tokens.ts:14–18,124,140,184,200`). Exact regeneration cannot be independently verified: the generator’s implementation is not supplied; its invocation is only prescribed (`CLAUDE.md:182`).

### (e) Themes and token-only rendering

- **Both explicit themes have screenshot tests**, but only the desktop shell’s default theme is tested at 1280px (`tests/e2e/kit.spec.ts:17–27,88–94`).
- **Token-only rendering is violated by literal typography:** examples include `font-weight: 500`, `font-weight: 600`, and `font-size: 11px` (`packages/ui/src/ui.css:30,142,307–308`). The checker does not inspect literal font sizes or weights (`scripts/tokens-check.mjs:12–19`).
- **System-dark rendering is inconsistent:** without a theme cookie, the root script leaves `data-theme` unset, while `ThemeSwitch` reports Narangi. Harmony’s structural folder rules require an explicit Harmony attribute (`apps/web/app/layout.tsx:31–35`, `packages/ui/src/client.tsx:260–263`, `packages/ui/src/ui.css:678–690`).

### (f) Unsupported stage-report claims

- **“`npm run review:stage -- 0 --head stage-1-start`” reviews Stage 0’s own range:** unsupported. The supplied script implements `--base`, not `--head`, and always diffs through `HEAD`; that command silently includes later commits (`docs/stages/stage-0-report.md:3,101`, supplied Input 4; `scripts/review-stage.mjs:79–84,221–229`).
- **“the kit's own sample primaries are marked `data-primary="kit"`”:** false in this diff; both primitive buttons use `"true"` and the kit does not override them (`docs/stages/stage-0-report.md:9`, supplied Input 4; `packages/ui/src/primitives.tsx:88,100`, `apps/web/app/kit/KitInteractive.tsx:100`, `apps/web/app/kit/page.tsx:186`).
- **“`tokens:check` … plus `px` font sizes” and “`rules:check` … verification dates, at most 3 unverified”:** neither additional check exists (`docs/stages/stage-0-report.md:12`, supplied Input 4; `scripts/tokens-check.mjs:12–19`, `scripts/rules-check.mjs:42–46`).
- **“`/kit` renders them all”:** the exported `TimelineEntry`, `TopBar`, and `InkButton`, for example, are absent from the kit’s component imports and rendering (`docs/stages/stage-0-report.md:9`, supplied Input 4; `packages/ui/src/index.ts:12,26,54`, `apps/web/app/kit/page.tsx:1–211`, `apps/web/app/kit/KitInteractive.tsx:1–179`).
- **“`EKBILL_GATE=on` puts the password back” / “no password”:** no gate toggle exists in the supplied deployment configuration; basic authentication is unconditional outside health (`docs/stages/stage-0-report.md:86,97`, supplied Input 4; `deploy/Caddyfile:12–15`, `deploy/docker-compose.yml:94–98`).
- **“`OPENAI_REVIEW_MODEL` … recorded in DECISIONS”:** the supplied decisions document still says recording is pending (`docs/stages/stage-0-report.md:97`, supplied Input 4; `docs/DECISIONS.md:157–161`).
- **“purity lint … fixed” and “request id … fixed: `apps/web/lib/log.ts`”:** the supplied diff retains the lint override and contains no corresponding health-route request-ID integration (`docs/stages/stage-0-report.md:101`, supplied Input 4; `eslint.config.mjs:72–88`, `apps/web/app/api/health/route.ts:34–48`).

### Additional code defects

- **Watcher rejects ordinary workspace edits.** Failing input: save `packages/ui/src/money.ts`. The watcher runs Vitest with positional filter `packages/ui`, but the supplied unit tests live under `tests/unit`; no matching UI test exists, so this preliminary invocation fails before the full suite (`scripts/watch.mjs:69–73`, `vitest.config.mts:32`).
- **Reviewer can accept contradictory or quoted verdicts.** Failing input: `Example: VERDICT: no new code defect\nVERDICT: defects found`. `parseVerdict` accepts the first unanchored occurrence and returns clean, despite the final verdict reporting defects (`scripts/review-stage.mjs:112–116`).
- **Review coverage is silently truncated.** Failing input: a stage diff exceeding 700,000 characters with a defect after that boundary. The script submits only the prefix and can still return a clean result instead of refusing incomplete review (`scripts/review-stage.mjs:20,92–95,188–189`).
- **“Repeat” does not refill the bill.** Failing input: click the fresh-bill control, then the repeat-fill control. Fresh replaces the lines with an empty line; fill only changes `filled`, leaving the bill empty while displaying the filled state (`apps/web/app/kit/KitInteractive.tsx:64–68`).
- **Worker inherits an impossible health check.** Failing input: start the worker service. Its image probes `127.0.0.1:3000/api/health`, but the worker command starts only the queue process, not a web server; the container becomes unhealthy (`deploy/Dockerfile:52–56`, `deploy/docker-compose.yml:72–82`).
- **Deployment can report success after failed readiness.** Failing input: the app repeatedly returns HTTP 503. After exhausting retries, the final `curl` omits `--fail`, and the script continues to print the public address and exits successfully (`deploy/vm/up.sh:51–60`).
- **Image deletion is unattended despite the required safety contract.** Failing input: run `deploy/vm/free-space.sh` with a matching dangling image present. It immediately executes `docker image rm`, with no confirmation or explicit apply option (`deploy/vm/free-space.sh:23–27`).
- **Documented local setup does not load `.env`.** Failing input: follow the README commands with `DATABASE_URL` present only in the copied `.env`, not exported. `npm run db:migrate` invokes a runner that reads only `process.env.DATABASE_URL` and exits with “DATABASE_URL is not set” (`README.md:8–12`, `package.json:36`, `packages/db/migrate.mjs:51–56`).
- **Backup health accepts empty backups as valid state.** Failing input: a state file containing `{"at":"2026-10-15T00:00:00Z","bytes":0}`. The route validates only the timestamp and reports the backup without checking nonempty size; overall health depends only on the database (`apps/web/app/api/health/route.ts:25–28,38–45`).

VERDICT: defects found
