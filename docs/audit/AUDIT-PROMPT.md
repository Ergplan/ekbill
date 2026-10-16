# To the auditor

You are auditing **EkBill v2**: a Hinglish GST billing app for very small Indian businesses (a shop, an AMC contractor, a tiffin service), used mostly on a phone. Sign-in is phone OTP. The owner makes a bill in a few taps, shares the PDF or JPG on WhatsApp, records the money, reminds the customer, and hands the accountant the GST workings.

Please assess the code in every aspect and tell us what is wrong, with evidence. We would rather hear about one real defect than ten style preferences.

## Scope

1. **Security.** Authentication (phone OTP, and the build's `/dev/switch`), sessions, authorisation, input validation, file uploads, rendering untrusted text into PDFs, model output, secrets handling, rate limits, logging of personal data.
2. **Correctness.** Money (integer paise), tax, numbering, balances, credit notes, cancellations, the photo reading and its corrections, imports.
3. **GST compliance against the rule pack.** `packages/engine/rules/gst/*.json` and `RULES.md`: document types and their mandatory fields, place of supply, CGST/SGST/UTGST/IGST, the rates by date, the composition legend, the B2C recipient threshold, HSN digits, credit-note limits, e-invoicing applicability, and GSTR-1 and GSTR-3B (3.1, 3.2) workings and `gstr1.json`.
4. **Tenancy.** Can a member of business A read or change anything of business B, by any route, action, job, query or file?
5. **Data integrity.** Constraints, triggers, transactions, concurrency, what is append-only, what can never change once issued, backup and restore.
6. **Operability.** Health, metrics, logs, the worker and its jobs, the restore drill, the load seed, disk discipline on a shared VM, and rollbacks.
7. **Code quality.** Structure, duplication, dead code, error handling, tests that test what they claim.
8. **The UI against the design pack.** `design/` (tokens, components, reference screens) and the approved Stage 1 baselines: both themes, 44 px targets, one primary action per state, no English leftovers in Hinglish screens.

## The invariants, and where each is enforced

|     | Invariant                                                          | Enforced at                                                                                                                                                                                     | Tested by                                                                                                                                                         |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | Tenancy is total: forced RLS on `business_id`, set per transaction | `packages/db/tenancy.sql:79` (`apply_tenancy`), `packages/db/src/scope.ts:35` (`withTenant`: `SET LOCAL ROLE ekbill_app`, `app.business_id`)                                                    | `tests/integration/tenancy.test.ts` (generated from the repository list), `tests/integration/rls.test.ts`, `tests/integration/audit-pack.test.ts` (RLS per table) |
| I2  | One writer for issued documents; an issued row never changes       | `packages/db/src/repos/documents.ts:398` (`issueDocument`), `packages/db/migrations/0002_documents.sql:113` (`refuse_issued_change`)                                                            | `tests/integration/documents.test.ts`                                                                                                                             |
| I3  | Numbers are gapless per series and financial year, never reused    | the series row locked `FOR UPDATE` in `issueDocument` (`documents.ts:408`), unique index `documents_number` (`packages/db/src/schema.ts:354`)                                                   | `tests/integration/numbering.test.ts` (50 concurrent issues)                                                                                                      |
| I4  | Money and tax: integer, deterministic, one engine                  | `packages/engine` (pure: no I/O, no clock, no floats in money), `packages/engine/src/tax.ts` (`computeTax`)                                                                                     | `tests/unit/engine-purity.test.ts`, `tests/unit/one-engine.test.ts`, `tests/unit/engine-tax.test.ts`                                                              |
| I5  | GST rules are versioned data with sources                          | `packages/engine/rules/gst/*.json`, `scripts/rules-check.mjs`                                                                                                                                   | `tests/unit/engine-rules.test.ts`, `npm run rules:check`                                                                                                          |
| I6  | Model output lands in staging only                                 | `packages/db/tenancy.sql:63` (`refuse_model_actor`), `packages/db/migrations/0006_photo.sql:102` (`guard_extraction`); the voice presses nothing that commits (`apps/web/screens/voice/dom.ts`) | `tests/integration/photos.test.ts`, `tests/e2e/voice.spec.ts`, `tests/unit/voice.test.ts`                                                                         |
| I7  | Every authoritative write is audited with actor and request id     | `packages/db/tenancy.sql:27` (`audit_row`), `apps/web/proxy.ts` (request id)                                                                                                                    | `tests/integration/audit.test.ts`                                                                                                                                 |
| I8  | Roles are enforced in the repository                               | `packages/db/src/repos/allow.ts:19`, each repository's `allowedRoles`                                                                                                                           | `tests/integration/roles.test.ts` (generated), the role journeys in `tests/e2e/`                                                                                  |
| I9  | The golden paths stay short                                        | the screens                                                                                                                                                                                     | `tests/e2e/golden-path.spec.ts`, `tests/unit/manifests.test.ts`                                                                                                   |
| I10 | What was approved is what ships                                    | `apps/web/screens`, `packages/ui`, `design/tokens`                                                                                                                                              | `tests/e2e/screens.spec.ts` (Stage 1 baselines, both themes), `tests/e2e/flow-audit.spec.ts`                                                                      |

Deliberate exceptions, each recorded in `../DECISIONS.md`:

- `search_records` and `ai_calls` are not audited.
- `memberships` has no RLS: it is read before a scope exists.
- The load seed's removal is the one deletion in the product.

## How to run it

See `README.md` in this folder: a clean clone, an ephemeral Postgres, no VM services, no secrets.

## What to send back

For each finding:

- **Severity**: critical, high, medium or low. Critical means a tenant's data crosses to another, money or tax is wrong on an issued bill, or an unauthenticated person can act.
- **Where**: `file:line`.
- **Reproduction**: the steps, request or test that shows it.
- **Fix**: what you would change.

Then say what you did not cover.

## Read first

| What                                                 | File                               |
| ---------------------------------------------------- | ---------------------------------- |
| The architecture                                     | `../ARCHITECTURE.md`               |
| The decisions and why                                | `../DECISIONS.md`                  |
| What we know is missing                              | `KNOWN-GAPS.md`                    |
| Assets, actors, boundaries and the deferred security | `THREAT-MODEL.md`                  |
| Every table                                          | `DATA-MODEL.md`                    |
| Every input field and where it is stored             | `FIELD-TRACE.md`                   |
| Every screen                                         | `SCREEN-FLOW.md`                   |
| The GST pack                                         | `RULES.md`                         |
| Tests and coverage                                   | `TEST-INVENTORY.md`, `COVERAGE.md` |
| Dependencies                                         | `DEPENDENCIES.md`                  |
| Measurements                                         | `PERFORMANCE.md`                   |
| The stage reviews                                    | `REVIEWS.md`                       |
