# Stage 2 — independent review

- Reviewed commit: 100ae55
- Base: stage-2-start
- Head: stage-3-start
- Model: gpt-6.1-sol
- At: 2026-10-16T09:16:11.152Z
- Verdict: defects

---

### (a) Invariants I1–I10

- **I1 — Violated.**
  - `businesses` has no `business_id`; its policy instead uses `id`. This departs from I1’s explicit column requirement without an exception being recorded (`packages/db/src/schema.ts:45–63`; `packages/db/migrations/0001_identity.sql:112`).
  - `ai_calls.business_id` is nullable, and its policy permits **every** application transaction to read/write null-business rows—not just system calls. The stage prompt’s nullable-system-call requirement conflicts with I1, but the report does not flag that conflict (`packages/db/src/schema.ts:144`; `packages/db/migrations/0001_identity.sql:118–120`; `docs/stages/stage-2-report.md:7`).
  - `createBusiness` is a repository function without a first-argument `TenantScope`; it also has no generated tenancy probe (`packages/db/src/repos/businesses.ts:65–85, 93–103`).
  - Resolution is not cached once per request: each `current()` call invokes `resolveScope()` again (`apps/web/server/session.ts:22–27`).

- **I2 — No new violation visible; issuance is not implemented here.** The architecture explicitly leaves `issueDocument()` to Stage 3; this diff supplies identity tables rather than issued-document writes (`docs/ARCHITECTURE.md:39`; `packages/db/src/schema.ts:24–165`).

- **I3 — Not exercised by this stage.** No numbering allocator or series table is added; issuing remains deferred (`docs/ARCHITECTURE.md:39`; `packages/db/src/schema.ts:24–165`).

- **I4 — No new violation visible.** The changed calculation test only supplies the expanded viewer fields and retains its comparisons against the shared engine result; no engine calculation changes appear (`tests/unit/bill-compute.test.ts:144–157`).

- **I5 — No new violation visible.** This stage adds identity/settings schemas, not GST rules or calculations (`packages/db/src/schema.ts:24–165`; `apps/web/actions/schema.ts:9–20`). Existing rule-pack compliance cannot be established from these inputs.

- **I6 — Violated for user settings.** `users` receives neither the model-actor refusal nor any equivalent enforcement. A model-scoped call to `users.setTheme()` passes the role check and updates the authoritative setting (`packages/db/migrations/0001_identity.sql:105–113`; `packages/db/src/repos/users.ts:38–53`). The raw model-refusal test covers businesses and memberships only (`tests/integration/rls.test.ts:56–78`).

- **I7 — Listed business tables are audited, but user-setting writes are not.** Businesses and memberships receive the audit trigger, whose payload includes attribution and request ID; audit updates/deletes are refused (`packages/db/migrations/0001_identity.sql:112–113, 123–125`; `packages/db/tenancy.sql:27–54, 91–98`). However, the authoritative theme/language/name writes have no audit trigger (`packages/db/src/repos/users.ts:38–60`; `packages/db/migrations/0001_identity.sql:112–113`).

- **I8 — Incomplete.** Rename, archive, invite, remove, and the three user setters declare roles and call `allow()` (`packages/db/src/repos/businesses.ts:17–20, 30–31, 47–48`; `packages/db/src/repos/memberships.ts:19–22, 59, 95`; `packages/db/src/repos/users.ts:16–20, 50–60`). `createBusiness` writes both businesses and memberships without an `allowedRoles` declaration or `allow()` check, and therefore escapes generated role tests (`packages/db/src/repos/businesses.ts:65–85, 89–92`; `scripts/gen-tests.mjs:65–79`).

- **I9 — Not independently verified.** The diff changes viewer resolution and the shared theme control, but supplies no golden-path execution or tap-count evidence. The added identity journeys do not measure the golden paths (`apps/web/screens/viewer.ts:49–100`; `packages/ui/src/client.tsx:278–301`; `tests/e2e/identity.spec.ts:12–66`).

- **I10 — Approval requirement not demonstrated.** The report says the switcher baseline was rebuilt for different seeded data, while the supposed approval record explicitly acknowledges there was no separate approval line. That does not establish the written approval required for re-recording a baseline (`docs/stages/stage-2-report.md:36`; `docs/stages/stage-1-answers.md:3, 16`). Switcher markup also changes by conditionally removing the role pill (`apps/web/screens/switch/Screen.tsx:46–50`).

### (b) Tests for added server actions and route handlers

- **`setTheme`** → browser journey exercising the Aap switch and persistence (`apps/web/actions/user.ts:25–34`; `tests/e2e/identity.spec.ts:35–59`). **No direct real-Postgres action integration test is supplied**; generated tests call repository probes instead (`tests/integration/roles.test.ts:61–71`).
- **`setLanguage` — no action test supplied.** The generated test exercises `users.roleProbes.setLanguage`, not boundary validation, authentication, cookies, or the action result (`apps/web/actions/user.ts:36–45`; `tests/integration/roles.test.ts:73–83`).
- **`setName` — no action test supplied.** Again, only the repository probe is tested (`apps/web/actions/user.ts:47–54`; `tests/integration/roles.test.ts:85–95`).
- **`POST /api/auth/otp`** → OTP 501 browser/API test (`apps/web/app/api/auth/otp/route.ts:9–16`; `tests/e2e/identity.spec.ts:62–66`). **No integration-suite test is supplied.**
- **Changed `GET /dev/switch/[person]`** → session, redirect, cookie, request-ID, and OTP-mode integration tests (`apps/web/app/dev/switch/[person]/route.ts:30–58`; `tests/integration/switch.test.ts:25–78`).
- **Changed health route:** only its logger import changes; the claimed existing health test is not included, so its coverage cannot be inspected (`apps/web/app/api/health/route.ts:7`; `docs/stages/stage-2-report.md:27`).

### (c) Audit coverage of authoritative writes

- **Businesses:** rename, archive, creation, and seed upsert are audited through `apply_tenancy('businesses', ...)` (`packages/db/src/repos/businesses.ts:33–41, 50–54, 72–75`; `packages/db/src/seed.ts:168–175`; `packages/db/migrations/0001_identity.sql:112`; `packages/db/tenancy.sql:91–92`).
- **Memberships:** invitation/upsert, removal, initial owner insertion, and seed upsert are audited through `apply_tenancy('memberships', false)` (`packages/db/src/repos/memberships.ts:65–79, 98–108`; `packages/db/src/repos/businesses.ts:76–83`; `packages/db/src/seed.ts:182–195`; `packages/db/migrations/0001_identity.sql:113`).
- **Users — unaudited:** theme, language, name, and `lastSeenAt` updates; creation during invitation; and seed inserts/upserts. No user audit trigger is installed (`packages/db/src/repos/users.ts:38–60`; `packages/db/src/auth.ts:117–120`; `packages/db/src/repos/memberships.ts:61–64`; `packages/db/src/seed.ts:157–164`; `packages/db/migrations/0001_identity.sql:112–113`). Adding that trigger alone would not suffice: `audit_row()` assumes non-business rows contain `business_id`, while `audit_events.business_id` is non-null (`packages/db/tenancy.sql:40–43`; `packages/db/src/schema.ts:120`).

### (d) Generated-document regeneration

- **`docs/FIELD-TRACE.md`: not independently verifiable.** Its listed tables and inputs appear consistent with the shown schema, but the actual generator is absent, so byte-for-byte regeneration cannot be established (`docs/FIELD-TRACE.md:8–86`; `packages/db/src/schema.ts:24–165`; `apps/web/actions/schema.ts:9–20`).
- **`docs/SCREEN-FLOW.md`: not independently verifiable.** Neither the document nor generator source is supplied; adding the watcher invocation does not prove no drift (`scripts/watch.mjs:79–80`).
- **`tokens.ts` / `themes.css`: not independently verifiable.** Neither their source tokens nor generated contents are supplied. The report’s “tokens” green claim is execution evidence asserted by the author, not a reproducible result in these inputs (`docs/stages/stage-2-report.md:36`).

### (e) Both themes and tokens only

- **No literal colour, radius, shadow, or font is introduced in the shown screen/control changes.** Aap retains shared controls, the shell change adds a language property, and the switcher retains existing classes/components (`apps/web/screens/aap/Screen.tsx:181–185, 195–201`; `apps/web/screens/shell/AppShell.tsx:21–22`; `apps/web/screens/switch/Screen.tsx:46–50`; `packages/ui/src/client.tsx:291–301`).
- **Both-theme rendering cannot be certified from this diff.** The new identity test changes themes and checks `data-theme`, but does not visually assert every touched screen in both themes; existing visual tests and baselines are absent (`tests/e2e/identity.spec.ts:35–59`; `docs/stages/stage-2-report.md:36`).

### (f) Unsupported or contradicted stage-report claims

- **“No screen beyond the switcher and the shell was wired”** is contradicted by Aap calling the new persistence actions (`docs/stages/stage-2-report.md:3`; `apps/web/screens/aap/Screen.tsx:21, 183, 198–200`).
- **“`deploy/vm/up.sh` seeds the build's instance after the stack is healthy”** is unsupported: the inserted commands interrupt an existing quoted error message inside the unhealthy branch, rather than forming a valid post-health seeding block (`docs/stages/stage-2-report.md:15`; `deploy/vm/up.sh:66–73`).
- **“Roles (I8): every repository write × every role”** omits `createBusiness`, which is absent from `allowedRoles` and `roleProbes` (`docs/stages/stage-2-report.md:21`; `packages/db/src/repos/businesses.ts:17–20, 65–85, 89–92`).
- **“`setTheme`, `setLanguage`, `setName` → `ActionResult`”** is not guaranteed on repository/database failure: exceptions propagate rather than becoming the declared result (`docs/stages/stage-2-report.md:13`; `apps/web/actions/user.ts:30, 41, 52`).
- **“Watcher once: GREEN” / “118 passed”** cannot be independently confirmed from supplied code and have no attached execution artifacts (`docs/stages/stage-2-report.md:36`). These are unverified execution claims, not independently established code defects.

### Additional code defects

- **Broken deployment script.** Failing input: normal execution of `deploy/vm/up.sh`, especially a healthy stack with `AUTH_MODE=switcher`. The seeding insertion splits the quoted diagnostic and is placed inside the failure branch; it cannot perform the claimed healthy-stack seeding and may break shell parsing (`deploy/vm/up.sh:66–73`).

- **Malformed session cookies can cause database errors.** Failing input: `eb-session=------------------------------------`—36 hyphens passes the regex, then reaches a PostgreSQL UUID comparison and throws instead of resolving to null (`packages/db/src/auth.ts:36–37, 53`; `apps/web/server/session.ts:24–27`).

- **Inviting oneself can remove the sole owner.** Failing input: Sharma’s owner scope inviting `+919822012345` as `staff`. The existing user and membership are found, then the conflict update changes the owner’s role to staff. The partial unique index enforces at most one owner, not at least one (`packages/db/src/repos/memberships.ts:61–77`; `packages/db/src/schema.ts:87–89`; `packages/db/src/seed.ts:16–19`).

- **Reseeding overwrites persisted settings and team state.** Failing input: change Sharma’s theme/name, remove a seeded member, or archive a seeded business, then run the seed again. User preferences/names reset, removed memberships reactivate, and archived businesses become active. This contradicts the seed’s “run it again and nothing changes” contract (`packages/db/src/seed.ts:11, 157–164, 171–175, 192–195`).

- **Personal preferences unnecessarily require a business.** Failing input: sign in as `new`, then call `setTheme({theme:'harmony'})` or `setLanguage({language:'en'})`. The valid session has no scope, so both return `auth.no.business` despite updating personal user settings (`apps/web/actions/user.ts:14–18, 25–29, 36–40`; `tests/integration/session.test.ts:23–30`).

- **Persistence failures are silently ignored by Aap.** Failing input: a signed-out user changes language/theme, or a database write fails. The UI updates optimistically but discards the action result, with no error display or rollback (`apps/web/screens/aap/Screen.tsx:183, 198–200`; `packages/ui/src/client.tsx:296–298`).

- **Switcher selection is identified by mutable display name.** Failing input: change Sharma’s name using `setName`, then open `/dev/switch`. The current user no longer matches the static seed name; duplicate names can select the wrong person (`apps/web/app/dev/switch/page.tsx:15–17`; `apps/web/screens/switch/data.ts:18–21`; `apps/web/actions/user.ts:47–53`).

VERDICT: defects found
