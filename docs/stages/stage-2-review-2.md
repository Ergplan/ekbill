# Stage 2 — independent review

- Reviewed commit: 100ae55
- Base: stage-2-start
- Head: stage-3-start
- Model: gpt-6.1-sol
- At: 2026-10-16T09:17:20.366Z
- Verdict: defects

---

### (a) Invariants I1–I10

- **I1 — Violated literally; the stage prompt conflicts with it.** `businesses` has no `business_id`; its policy instead uses `id`. `ai_calls.business_id` is nullable and NULL-business rows are accessible without a tenant scope. The stage prompt requests these exceptions, but the invariant says it overrides conflicting prompts; the report does not flag that conflict (`packages/db/src/schema.ts:47–63`; `packages/db/migrations/0001_identity.sql:111–118`; `docs/stages/stage-2-report.md:7–9`).
- **I2 — No new violation identified.** The new migration contains identity, audit and model-call tables, not issued documents or issuance writes. This does not establish the deferred issuance invariant (`packages/db/migrations/0001_identity.sql:1–125`).
- **I3 — No new violation identified.** No document-series or number-allocation implementation is added; gaplessness is not established by this stage (`packages/db/migrations/0001_identity.sql:1–125`).
- **I4 — No new violation identified.** The changed money-consumer test only supplies the expanded viewer fields; it retains the comparison against the engine-derived result (`tests/unit/bill-compute.test.ts:141–156`).
- **I5 — No new violation identified.** No GST rule data or selection logic is changed; the changed calculation test supplies viewer metadata only (`tests/unit/bill-compute.test.ts:144–154`).
- **I6 — Violated for settings.** `users` is writable under a model actor: the model-refusal trigger is installed on businesses and memberships, not users. Thus `users.setTheme({...scope, actorKind: 'model'}, 'harmony')` can commit a setting without human confirmation (`packages/db/migrations/0001_identity.sql:104–112`; `packages/db/src/repos/users.ts:38–53`; `packages/db/tenancy.sql:94–98`).
- **I7 — Required business and membership writes have audit triggers.** Those triggers capture before/after, actor and request ID, and audit rows cannot be updated or deleted by the application role. However, user-setting writes remain unaudited; see (c) (`packages/db/migrations/0001_identity.sql:111–112,121–125`; `packages/db/tenancy.sql:27–54,90–91`; `packages/db/src/scope.ts:39–42`).
- **I8 — Violated.** `createBusiness` is a repository write without `TenantScope`, an `allowedRoles` declaration or an `allow` check, and is omitted from generated role probes. Its pre-scope purpose needs an explicit invariant exception, not an unreported bypass (`packages/db/src/repos/businesses.ts:17–20,66–87,90–93`).
- **I9 — Not independently verifiable from these inputs.** No golden-path test implementation or execution evidence is supplied; the new browser tests test identity and theme, not tap/time budgets (`tests/e2e/identity.spec.ts:12–66`; `docs/stages/stage-2-report.md:36`).
- **I10 — Approval requirement not demonstrated.** The report says the switcher baseline was rebuilt, but supplies no operator-written approval for that baseline change. The recorded answer explicitly describes an assumed go-ahead rather than the required approval (`docs/stages/stage-2-report.md:36`; `docs/stages/stage-1-answers.md:3,16`). The switcher also changes conditional markup (`apps/web/screens/switch/Screen.tsx:46–50`).

### (b) Action and route tests

- `setTheme` → browser persistence test; **no real-Postgres integration test of the action boundary is supplied** (`apps/web/actions/user.ts:25–34`; `tests/e2e/identity.spec.ts:35–60`).
- `setLanguage` → **no action test supplied**. Generated tests call the repository, bypassing action validation, authentication and cookies (`apps/web/actions/user.ts:36–45`; `tests/integration/roles.test.ts:73–84`; `packages/db/src/repos/users.ts:65`).
- `setName` → **no action test supplied**. Generated tests likewise exercise only the repository (`apps/web/actions/user.ts:47–54`; `tests/integration/roles.test.ts:85–96`; `packages/db/src/repos/users.ts:66`).
- `POST /api/auth/otp` → browser request test; **no required integration test is supplied**, and the supplied test covers switcher mode only (`apps/web/app/api/auth/otp/route.ts:9–16`; `tests/e2e/identity.spec.ts:62–66`).
- Modified `GET /dev/switch/[person]` → real-session integration tests, including otp-mode rejection (`apps/web/app/dev/switch/[person]/route.ts:30–58`; `tests/integration/switch.test.ts:24–77`).
- `GET /api/health` is modified only to relocate its logger import, not newly added. Its existing test is named in the report but its implementation is not supplied (`apps/web/app/api/health/route.ts:7`; `docs/stages/stage-2-report.md:24`).

### (c) Authoritative-write auditing

- **Audited:** business rename, archive and creation; membership creation during business creation; membership invite/upsert and removal; seeded business and membership upserts. Both tables receive the audit trigger (`packages/db/src/repos/businesses.ts:33–41,50–54,73–84`; `packages/db/src/repos/memberships.ts:65–79,98–108`; `packages/db/src/seed.ts:169–196`; `packages/db/migrations/0001_identity.sql:111–112`).
- **Unaudited:** authoritative user name, theme and language updates; new users created by invitations; seed user upserts; sign-in `lastSeenAt` updates. No user audit trigger is installed (`packages/db/src/repos/users.ts:38–60`; `packages/db/src/repos/memberships.ts:61–64`; `packages/db/src/seed.ts:157–165`; `packages/db/src/auth.ts:118–121`; `packages/db/migrations/0001_identity.sql:111–119`).

### (d) Generated artifacts

- **`docs/FIELD-TRACE.md`: not independently verifiable.** Its listed input mappings agree with the three schemas, but `scripts/trace.mjs` is not supplied, so byte-identical regeneration cannot be certified (`docs/FIELD-TRACE.md:79–86`; `apps/web/actions/schema.ts:9–20`).
- **`docs/SCREEN-FLOW.md`: not independently verifiable.** Neither its contents nor its generator are supplied; merely invoking the check is not regeneration evidence (`scripts/watch.mjs:79`).
- **`tokens.ts` / `themes.css`: not independently verifiable.** Their contents, token source and builder are absent from the supplied diff. The report’s green-token-check assertion is not independently reproducible evidence (`docs/stages/stage-2-report.md:36`).

### (e) Themes and tokens

- No literal colour, radius, shadow or font is introduced in the supplied screen/UI changes. The new controls reuse existing UI components and classes (`apps/web/screens/aap/Screen.tsx:181–185,192–203`; `apps/web/screens/switch/Screen.tsx:46–50`; `packages/ui/src/client.tsx:291–302`).
- Rendering **every touched screen in both themes cannot be certified** from the supplied tests: the new identity tests assert theme attributes, not both-theme visual rendering of all touched screens (`tests/e2e/identity.spec.ts:35–60`).

### (f) Unsupported or contradicted report claims

- **“No screen beyond the switcher and the shell was wired”** is false: Aap now invokes persistent theme and language actions (`docs/stages/stage-2-report.md:3`; `apps/web/screens/aap/Screen.tsx:181–185,195–198`).
- **“`deploy/vm/up.sh` seeds the build's instance after the stack is healthy”** is false. The inserted seed block sits inside the corrupted health-failure diagnostic, not on the healthy execution path (`docs/stages/stage-2-report.md:15`; `deploy/vm/up.sh:66–73`).
- **“every repository write × every role”** is overstated: `createBusiness` is not declared or probed (`docs/stages/stage-2-report.md:19`; `packages/db/src/repos/businesses.ts:17–20,66–93`).
- **“a model actor cannot write”** is broader than the protection implemented: user settings remain writable by a model actor (`docs/stages/stage-2-report.md:22`; `packages/db/src/repos/users.ts:38–60`; `packages/db/migrations/0001_identity.sql:111–119`).
- **“Watcher once: GREEN” / “118 passed”** cannot be independently confirmed from this diff; no execution artifacts are supplied (`docs/stages/stage-2-report.md:36`).

### Additional code defects

- **Deployment script corruption.** Failing input: run `deploy/vm/up.sh` on a fresh healthy switcher deployment. The health-failure `echo` is split around the inserted shell text; no seed command is placed after the successful health check. Seeded identities therefore are not provisioned by the advertised deployment path (`deploy/vm/up.sh:66–73`).
- **Inviting oneself can remove the sole owner.** Failing input: Sharma’s owner scope invites `+919822012345` as staff. The conflict update changes the existing owner membership to staff; the partial unique index prevents multiple owners but does not require one owner (`packages/db/src/repos/memberships.ts:61–77`; `packages/db/src/seed.ts:16–18`; `packages/db/src/schema.ts:87–89`).
- **Malformed session cookies can cause database errors.** Failing input: `eb-session=------------------------------------`. The 36-character regex accepts it, then PostgreSQL rejects it as a UUID instead of resolving it to null (`packages/db/src/auth.ts:36–53`; `apps/web/server/session.ts:23–27`).
- **Reseeding destroys persisted preferences and membership changes.** Failing input: change Sharma’s theme/name, remove a seeded member, then rerun `npm run seed`. User settings are reset and removed memberships reactivate, contradicting “run it again and nothing changes” (`packages/db/src/seed.ts:11,157–165,174,194–196`).
- **Actions can reject instead of returning `ActionResult`, and Aap ignores failure.** Failing input: a database failure during a theme/language save. Repository exceptions escape the actions, while the screen changes locally and discards the result without rollback or error display (`apps/web/actions/user.ts:30–33,41–44,52–53`; `apps/web/screens/aap/Screen.tsx:183,195–198`).
- **Switcher selection uses a mutable name as identity.** Failing input: rename the signed-in user through `setName`, then visit `/dev/switch`. The page compares the current database name against unchanged seed names, so it loses—or incorrectly assigns—the selected persona (`apps/web/app/dev/switch/page.tsx:14–16`; `apps/web/screens/switch/data.ts:18–20`).

VERDICT: defects found
