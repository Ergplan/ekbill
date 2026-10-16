# Stage 10 — independent review

- Reviewed commit: 7ebd63a
- Base: stage-10-start
- Head: stage-11-start
- Model: gpt-6.1-sol
- At: 2026-10-16T10:16:48.417Z
- Verdict: defects

---

## (a) Invariants I1–I10

- **I1 — Violation in the administrative load path.** Tenant mutations run directly on a pool client, without `withTenant()` or a `TenantScope` argument; removal discovers and deletes across tenant tables using a database-owner connection. The stage prompt requests cleanup, but does not override I1 (`packages/db/src/load.ts:88–124,186–209`).
- **I2 — Upheld by the new issuing path.** The seed creates drafts and calls `issueDocument()` rather than allocating numbers or writing issued snapshots itself. No second issuing implementation is introduced (`packages/db/src/load.ts:145–165`).
- **I3 — No new allocation implementation.** Seed issuance delegates to `issueDocument()`; existing numbering concurrency guarantees cannot be independently re-established from the supplied diff (`packages/db/src/load.ts:145–165`).
- **I4 — No new tax engine or floating-point money calculation.** Balance aggregation still delegates to `balanceOf()`; the SQL outstanding expression subtracts integer monetary amounts for filtering (`packages/db/src/repos/payments.ts:61–80`; `packages/db/src/repos/documents.ts:604–608`).
- **I5 — No GST rule changes introduced.** The new seed supplies sample bill inputs; it does not alter the rule pack or introduce another rule-selection implementation (`packages/db/src/load.ts:145–165`).
- **I6 — No new model-to-authoritative-table path identified.** The load writer identifies itself as `system`, and OTP identity comes from token verification, not model output (`packages/db/src/load.ts:90–94`; `apps/web/server/otp.ts:37–46`).
- **I7 — Violated.** Cleanup disables audit triggers, deletes authoritative rows, and deletes their audit events through the generic `business_id` table sweep. This is explicitly an unaudited destructive path, notwithstanding its disclosure in the report (`packages/db/src/load.ts:193–209`; `docs/stages/stage-10-report.md:31`). Also, the OTP route passes only `userAgent` into the sign-in service; its request ID is not propagated through the invitation-acceptance write path (`apps/web/app/api/auth/otp/route.ts:25–29`; `apps/web/server/otp.ts:46–53`).
- **I8 — Not upheld for the new administrative writers.** Load creation and removal mutate authoritative tables directly, without repository `allowedRoles` enforcement. These privileged exceptions need explicit treatment rather than a claim that every write follows I8 (`packages/db/src/load.ts:95–120,186–215`).
- **I9 — Not established by this stage’s tests.** Home now excludes bills older than 63 days from the ledger used for its “last three”; an established business whose last bills predate that cutoff loses those recent-history entries. The new load measurements only fetch pages and do not exercise the measured issuing/payment golden paths (`apps/web/screens/home/data.ts:28–30,72`; `tests/load/measure.mjs:19–24,40–49`).
- **I10 — Strict markup freeze not upheld.** Login gains an error paragraph and conditionally removes the developer link in OTP mode. These are markup changes, not merely a data-source swap; the report supplies no operator approval for them. No baseline files are changed (`apps/web/screens/login/Screen.tsx:156–172`; `docs/stages/stage-10-report.md:99`).

## (b) Server actions and route-handler tests

- **New `GET /api/metrics` → tested:** handler at `apps/web/app/api/metrics/route.ts:37–62`; tests at `tests/integration/metrics.test.ts:13–32,34–59`.
- **Reimplemented `POST /api/auth/otp` → tested:** handler at `apps/web/app/api/auth/otp/route.ts:20–41`; route tests at `tests/integration/otp-route.test.ts:15–47`, successful emulator journeys at `tests/e2e/otp.spec.ts:26–38,53–67`.
- **Modified `GET /api/health` → tested:** queue addition at `apps/web/app/api/health/route.ts:40–55`; test at `tests/integration/metrics.test.ts:34–54`.
- **No new server-action export appears in the diff.** The new sign-in function is a server-side service called by the route, with service integration tests (`apps/web/server/otp.ts:31–55`; `tests/integration/otp.test.ts:21–62`).

## (c) Auditing of authoritative writes

- **Not every write is audited:** `removeLoad()` deliberately turns triggers off and deletes from tenant tables, including `audit_events`, then deletes businesses. This alone fails the checklist (`packages/db/src/load.ts:193–209`).
- **Seed writes:** businesses, memberships, series, the default-series update, customers, documents and payments use the normal trigger-enabled path. Actor/request settings are supplied for direct seed writes, and a system scope is supplied for repository writes. The test demonstrates an audit trail exists, but does not verify every table’s individual event (`packages/db/src/load.ts:90–124,127–179`; `tests/integration/load.test.ts:38–43`).
- **OTP invitation acceptance:** the service calls the existing invitation writer, but does not pass the incoming request ID. Its test checks membership/session outcome, not audit attribution (`apps/web/server/otp.ts:46–53`; `tests/integration/otp.test.ts:32–40`).
- **User/session writes are identity-table writes, not the authoritative business-table list in I7.** Their creation paths are visible, but no new audit mechanism is added for them (`packages/db/src/auth.ts:179–190`; `apps/web/server/otp.ts:49–53`).

## (d) Generated documents

- **`docs/FIELD-TRACE.md`: structurally consistent with the source change.** `loadTest` is added in the same position as the Drizzle column (`docs/FIELD-TRACE.md:49–55`; `packages/db/src/schema.ts:108–115`). Exact regeneration cannot be verified without the generator and complete generated file.
- **`docs/SCREEN-FLOW.md`: no manifest/source change is supplied, so no regeneration delta is demonstrated.** However, OTP introduces runtime-only screen states and controls without a corresponding manifest change; unchanged generation does not establish that the flow document describes them (`apps/web/screens/login/Screen.tsx:34–41,76–91,156–172`).
- **`tokens.ts` / `themes.css`: no token-source or generated-token change is supplied.** Nothing in the new login markup requires a new literal visual token, but exact regeneration is not executable from these inputs (`apps/web/screens/login/Screen.tsx:144–172`).

## (e) Themes and tokens

- **No new literal colour, radius, shadow or font is present in the touched screen markup.** Login uses existing UI components and `eb-meta`; Home, bill and customer changes are data-loader changes (`apps/web/screens/login/Screen.tsx:144–172`; `apps/web/screens/home/data.ts:28–38`; `apps/web/screens/bill/data.ts:108–118`; `apps/web/screens/customers/data.ts:24–30`).
- **Both-theme OTP rendering is not demonstrated.** The new emulator journeys neither select Harmony nor parameterize over themes (`tests/e2e/otp.spec.ts:26–67`). Thus token-only additions pass static inspection, but the required two-theme runtime check is unproven.

## (f) Unsupported stage-report claims

- **“`deploy/vm/restore-drill.sh` and `deploy/vm/disk-log.sh` (weekly, logs only) are scheduled by `schedule-backup.sh`.”** Only backup and disk-log commands are scheduled; restore-drill is not (`docs/stages/stage-10-report.md:61`; `deploy/vm/schedule-backup.sh:7–15`).
- **“`removeLoad` deletes only load-test businesses and the rows that name them.”** It also deletes any unaffiliated user whose phone matches `+9170000%`, without proving that user was created by the seed (`docs/stages/stage-10-report.md:31`; `packages/db/src/load.ts:210–215`).
- **“The seed is idempotent and carries on from a half-done business.”** Recovery is incomplete: drafts can be stranded between draft creation and issuance, and payment population is skipped if issuance already reached the target count before interruption (`docs/stages/stage-10-report.md:29`; `packages/db/src/load.ts:128–134,145–179`).
- **“No index was added.”** Migration `0008_scale.sql` adds `businesses_load_test`. This is a report accuracy issue, even though it is not a list-query index (`docs/stages/stage-10-report.md:46`; `packages/db/migrations/0008_scale.sql:2`).
- **“The database is not the limit; every query is under 15 ms.”** The supplied script measures six selected SQL statements, not every application query or query behavior under concurrent load. Its balance measurement is only a payments query, not the complete `balancesIn()` operation (`docs/stages/stage-10-report.md:82`; `scripts/explain.mjs:27–42`; `packages/db/src/repos/payments.ts:35–80`).

## Additional code defects

- **Cleanup can delete real identities and leave dangling references.** Failing input: create a legitimate, unaffiliated user with phone `+917000099999` and a null-business session, then run removal while at least one load-test business exists. The prefix-based deletion removes that real user; foreign-key triggers are disabled, so the session can survive pointing to a deleted user (`packages/db/src/load.ts:193–215`).

- **Metrics output is invalid for multiple waiting queue kinds.** Failing input: waiting jobs exist in two distinct queues. Each queue emits another `HELP` and `TYPE` declaration for the same metric names; Prometheus text exposition permits only one declaration per metric name (`apps/web/app/api/metrics/route.ts:17–24,51–56`).

- **Valid JSON `null` crashes the OTP endpoint.** Failing input: `AUTH_MODE=otp`, configured Firebase project, and `POST /api/auth/otp` with body `null`. Parsing succeeds, then `body.idToken` throws; the catch rethrows this non-`OtpError`, producing a server error instead of rejecting invalid input (`apps/web/app/api/auth/otp/route.ts:24–26,36–40`).

- **Optional Firebase auth-domain fallback fails for an empty environment value.** Failing input: valid API key/project ID but `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` left empty, as Compose supplies by default. `??` retains `''` instead of deriving `<project>.firebaseapp.com`, passing an unusable auth domain to browser authentication (`deploy/docker-compose.yml:64`; `apps/web/app/login/page.tsx:17–21`; `apps/web/screens/login/firebase.ts:36–42`).

- **Interrupted seeding is not restart-safe.** Failing input: terminate after `createDraft()` commits but before `issueDocument()`. Restart counts only issued documents and creates another draft for the same position, leaving the previous draft behind. Alternatively, terminate after the last issuance but before payment insertion: restart takes the completion `continue`, leaving the business without its intended payments (`packages/db/src/load.ts:128–134,145–179`).

- **Load scenarios do not test the required workloads or budgets.** Failing input: run the supplied k6 script at either scale. “Owners making bills” only loads Home and the form; there is no issuing operation or photo-read scenario. Consequently, issue-with-render and photo-read budgets are not measured (`tests/load/routes.k6.js:19–30,45–67`).

- **Seed cleanup is not registered until after seeding succeeds.** Failing input: seeding writes several businesses and then fails. With `set -e`, the script exits before installing its cleanup trap, leaving the partial seed behind (`tests/load/run.sh:5–9`).

- **Restore integration tests run against an empty sibling database, not the restored copy.** Failing input: a backup containing data that breaks integration behavior but passes the shallow restore check. The dump is restored into `DRILL`; Vitest is pointed at the separately created `SUITE`, so it cannot detect that restored-data failure (`deploy/vm/restore-drill.sh:20–32,40–44`).

- **Restore validation accepts missing snapshot totals.** Failing input: an issued document with non-null `issued_snapshot = '{}'`, or a snapshot missing one compared totals field. SQL casts yield `NULL`; the inequality becomes unknown and the row is not reported as broken (`scripts/restore-check.mjs:93–104`).

VERDICT: defects found
