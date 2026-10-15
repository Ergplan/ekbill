# Stage 2 — Identity, tenancy, roles, audit

**Status: built and tested in the build container; the independent review runs on the VM.** Stage 2 started on the operator's "continue build for next 12 hours" (15 Oct 2026) after the round-3 reviews, taken as the go-ahead past the Stage 1 gate on the report's own proposals (`docs/stages/stage-1-answers.md` records the assumption; "Run Stage 1 again" with a changed answer overturns any of them). No screen beyond the switcher and the shell was wired, as the stage prompt says.

## What exists

**Data model** (`packages/db/src/schema.ts` → `packages/db/migrations/0001_identity.sql`, generated with `npm run db:generate` and renumbered, the tenancy SQL appended by hand): `users` (phone_e164 unique, name, theme, language, created_at, last_seen_at), `businesses` (legal_name, trade_name, status active|archived, created_by), `memberships` (role owner|staff|accountant, status invited|active|removed; unique business+user; one active owner per business by partial unique index), `sessions` (user, business nullable, role, expires_at, user_agent), `audit_events` (append-only), `ai_calls` (RLS by business with a null row for system calls). Check constraints hold every enum.

**Tenancy toolkit** `packages/db/tenancy.sql` (included by the migration through `-- include tenancy.sql`, which `migrate.mjs` inlines): `app_business_id()`, `audit_row()` (security definer: the only writer of `audit_events`), `refuse_delete()` (8.3), `refuse_model_actor()` (I6), `refuse_change()` (append-only), `apply_tenancy(table, with_rls, business_column)`, the role `ekbill_app` (no login, owns nothing; the login role is a member so `SET LOCAL ROLE` works). Applied: `businesses` (RLS on `id`), `memberships` (audit and refusals, no RLS: read before a scope exists), `ai_calls` (its own policy), `audit_events` (read policy, no writes but the trigger).

**Services** `packages/db/src/scope.ts` (`TenantScope`, `withTenant()`: one transaction as `ekbill_app` with `app.business_id`, `app.user_id`, `app.actor_kind`, `app.request_id`; `withUser()` for a sign-in or a first business), `auth.ts` (`resolveScope`, `createSession`, `deleteSession`, `membershipsOf`), `repos/allow.ts` (`allow(scope, roles)`, `ForbiddenError`, `NotFoundError`), `repos/businesses.ts` (get, rename, archive, createBusiness), `repos/memberships.ts` (listMembers, invite, remove), `repos/users.ts` (getUser, setTheme, setLanguage, setName), `repos/index.ts` (the module list the generator reads), `seed.ts` (three businesses with owner, staff and accountant: Sharma Electricals, Gupta Kirana, Verma Traders; one owner with no business; deterministic ids keyed to the Stage 1 fixture ids).

**Web** `apps/web/server/{log,session,auth-mode}.ts` (pino with phone masking and the request id the proxy stamped; the `eb-session` cookie; `AUTH_MODE`), `apps/web/actions/{schema,user}.ts` (zod inputs; `setTheme`, `setLanguage`, `setName` → `ActionResult`), `/dev/switch` and `/dev/switch/[person]` (real sessions for the seeded people, their theme and language in the cookies the layout reads before paint; 404 under `AUTH_MODE=otp`), `POST /api/auth/otp` (501 until Stage 10), `screens/viewer.ts` (the session's user, business and role; the fixture persona the seeded person maps to for the still-fixture screens; `?as=` stays a look for `/flow`), the shell gets the person's language, Aap's theme switch and language toggle persist on the user.

**Tooling** `scripts/gen-tests.mjs` (`npm run gen:tests` / `gen:check`, in the watcher), `npm run seed` (refuses a database whose name says neither dev nor test unless `AUTH_MODE=switcher`; `--dry`), `deploy/vm/up.sh` seeds the build's instance after the stack is healthy, CI seeds before the browser journeys, Playwright's global setup seeds the dev database.

## Tests

| What                                                                                                                                                                                             | Where                               | Count |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ----- |
| Roles (I8): every repository write × every role, allowed or `ForbiddenError` — generated from `allowedRoles`                                                                                     | `tests/integration/roles.test.ts`   | 21    |
| Tenancy (I1): every module's probes as A against B, nothing of B touched — generated from the module list                                                                                        | `tests/integration/tenancy.test.ts` | 5     |
| Audit trigger: exactly one row per write with before/after, actor and request id; append-only; delete refused                                                                                    | `tests/integration/audit.test.ts`   | 4     |
| RLS on raw connections: the app role with no business sees 0 rows; scoped to A sees A only; a cross-tenant write updates 0 rows; a model actor cannot write; the app role cannot write the trail | `tests/integration/rls.test.ts`     | 5     |
| Session resolution: member, brand-new owner, wrong business, unknown/expired/deleted, the switcher's list                                                                                        | `tests/integration/session.test.ts` | 5     |
| `/dev/switch/[person]`: session cookie and settings cookies, business and role, `?to=`, unknown, request id, 404 under otp                                                                       | `tests/integration/switch.test.ts`  | 6     |
| Health                                                                                                                                                                                           | `tests/integration/health.test.ts`  | 2     |
| Playwright: owner of A sees A, staff of B sees B; brand-new owner → welcome; theme persists per user; OTP 501                                                                                    | `tests/e2e/identity.spec.ts`        | 4     |

The cross-tenant query of the report (`tests/integration/rls.test.ts`, as `ekbill_app` scoped to Sharma Electricals):

```sql
set local role ekbill_app;
select set_config('app.business_id', '00000000-0000-4000-9000-000000000001', true);
select count(*) from businesses where id = '00000000-0000-4000-9000-000000000002';  -- Gupta Kirana → 0
```

Watcher once: GREEN (eslint, prettier, tsc, unit 68, drizzle, rules, tokens, copy, trace, flow, gen:check, integration 48). Playwright: **118 passed** (114 of Stages 0–1 plus the four identity journeys; the switcher's baseline rebuilt for the ten seeded people).

## Documents

`docs/ARCHITECTURE.md` has the data model table (every table: purpose, who writes, tenancy), the request and write paths with the real function names, and the action and route surface with roles. `docs/FIELD-TRACE.md` lists the six tables and the three user input fields (theme, language, name → `users`). `docs/KNOWN-GAPS.md` and `docs/DECISIONS.md` updated.

## For the operator

- `npm run seed` after `npm run db:migrate` locally; on the VM `deploy/vm/up.sh` does it.
- `/dev/switch` lists the ten seeded people; Verma Traders' people see the first-run flow until Stage 4 wires the profile (the fixtures do not know that business).
- The independent review: on the VM, `npm run review:stage -- 2`.
