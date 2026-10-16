# Stage 7 — independent review

- Reviewed commit: 25c1f71
- Base: stage-7-start
- Head: stage-8-start
- Model: gpt-6.1-sol
- At: 2026-10-16T10:12:48.545Z
- Verdict: defects

---

### (a) Invariants I1–I10

- **I1 — Supported for the new photo tables; not fully verifiable.** Each has a non-null business FK and receives `apply_tenancy` (`packages/db/migrations/0006_photo.sql:3,14,39,53–74`). Repositories use `withTenant`; cross-tenant tests cover extraction reads, photo reads and corrections (`packages/db/src/repos/photos.ts:158–176,190–219`; `tests/integration/tenancy.test.ts:163–183`). The definition of `apply_tenancy` is not supplied, so its RLS policy cannot be independently verified.
- **I2 — No new bypass shown.** The photo action delegates issuance to the shared issue path before linking the extraction (`apps/web/actions/bills.ts:136–145,389–393`). The existing issuance implementation and document immutability trigger are outside the supplied hunks; their guarantees cannot be certified.
- **I3 — No new allocator shown.** The change selects the default series, rather than allocating a number (`packages/db/src/repos/documents.ts:218–231`). A test checks the selected prefix, not concurrent gaplessness (`tests/integration/bills.test.ts:274–284`). Existing allocation guarantees remain unverified.
- **I4 — Violated.** New engine money arithmetic uses floating-point division and multiplication to derive rates and compare amounts (`packages/engine/src/read-bill.ts:218–224`), despite the invariant’s explicit prohibition. Totals do use `computeTax`, rather than the image total (`packages/engine/src/read-bill.ts:244–265`).
- **I5 — No new GST-rule violation shown.** Reading validation delegates to the existing tax engine with GST disabled; it adds no statutory rates or thresholds (`packages/engine/src/read-bill.ts:244–258`). Existing rule-pack compliance cannot be verified from these hunks.
- **I6 — Staging boundary supported.** The worker writes the extraction as `actorKind: 'model'`; the trigger restricts that actor to pending → ready/failed and forbids committing (`apps/worker/src/read-bill/job.ts:29–36,113–127`; `packages/db/migrations/0006_photo.sql:108–143`). The human action is the issuance path (`apps/web/actions/bills.ts:377–400`). Database refusal tests cover documents, customers and extraction commits (`tests/integration/photos.test.ts:197–253`).
- **I7 — New photo writes have audit hooks; authoritative issuance auditing is not independently verifiable.** All three new tables receive tenancy/audit setup, with explicit byte-excluding audit triggers for uploads and extractions (`packages/db/migrations/0006_photo.sql:71–93`). The shared issuance path’s existing authoritative-table triggers are not supplied (`apps/web/actions/bills.ts:136–145,389`).
- **I8 — Supported for new repository writes.** All photo writes and AI-call recording declare and enforce allowed roles; generated tests cover owner, staff and accountant (`packages/db/src/repos/photos.ts:29–35,64,132,195,225,239`; `packages/db/src/repos/ai-calls.ts:15–17,34`; `tests/integration/roles.test.ts:24–35,360–419`).
- **I9 — Photo-path tap count tested; complete invariant not verifiable.** The new journey counts three taps against path (c)’s budget (`tests/e2e/photo.spec.ts:41–54`). It does not exercise the existing WhatsApp/payment budgets, throttled timing or primary-CTA cardinality.
- **I10 — Violated as written.** Wiring adds review markup for matching, total warnings and errors, plus an unavailable state and new copy; this is not solely a data-source swap (`apps/web/screens/photo/Screen.tsx:336–359,386–401`; `design/copy/strings.json:2748–2787`). No operator approval for those visual changes is supplied.

### (b) Added actions and route handlers versus tests

- `makeBillFromPhoto` (`apps/web/actions/bills.ts:377–400`) → exercised through the review/issue/correction journey (`tests/e2e/photo.spec.ts:57–94`).
- `POST /api/photos` (`apps/web/app/api/photos/route.ts:17–49`) → exercised by the fixture upload journeys (`tests/e2e/photo.spec.ts:32–49,60–61`).
- `GET /api/extractions/[id]/image` (`apps/web/app/api/extractions/[id]/image/route.ts:10–31`) → explicitly requested and content type checked (`tests/e2e/photo.spec.ts:68–69`).

**All three lack the required real-Postgres integration tests of the action/handler itself.** The supplied integration suite calls repositories and the worker directly, not these entry points (`tests/integration/photos.test.ts:53–63,161–194`).

### (c) Authoritative writes and auditing

- Photo bill issuance delegates to the existing shared path; its customer/document/numbering/file writes and audit triggers are not included, so universal authoritative-write auditing cannot be certified (`apps/web/actions/bills.ts:136–145,389`).
- New `uploads` and `extractions` inserts, reading updates, review updates, commits and discards have audit setup (`packages/db/src/repos/photos.ts:70–85,134–153,215–218,228–232,245–249`; `packages/db/migrations/0006_photo.sql:71–93`).
- New `extraction_corrections` inserts receive `apply_tenancy` and are append-only; the inherited audit implementation is not supplied (`packages/db/src/repos/photos.ts:199–214`; `packages/db/migrations/0006_photo.sql:74,97`).
- `ai_calls` recording is a new write site, but its pre-existing audit setup is not supplied; neither absence nor presence can be established here (`packages/db/src/repos/ai-calls.ts:35–39`).

### (d) Generated documents

- **`docs/FIELD-TRACE.md`: regeneration not verifiable.** New table columns are listed, while the new input uses `issueBillInput.extend(...)`; without `scripts/trace.mjs`, whether those fields are discovered cannot be determined (`docs/FIELD-TRACE.md:290–336`; `apps/web/actions/schema.ts:190–201`).
- **`docs/SCREEN-FLOW.md`: regeneration not verifiable.** No manifest or generator is supplied. The screen now supports `unavailable`, but no corresponding manifest change appears in the diff (`apps/web/screens/photo/Screen.tsx:37,386–401`).
- **`tokens.ts` / `themes.css`: no regeneration-triggering token-source change shown.** The new screen sections use existing UI components/classes; the only added inline style is `whiteSpace` (`apps/web/screens/photo/Screen.tsx:336–359,386–401`). Exact regeneration cannot be checked without the token sources and builder.

### (e) Both themes and tokens only

- **No literal colour, radius, shadow or font is introduced in the supplied photo-screen hunks.** New output uses existing UI components and classes; `whiteSpace: 'pre-line'` is not a prohibited visual literal (`apps/web/screens/photo/Screen.tsx:336–359,386–401`).
- **Both-theme rendering is not demonstrated by the supplied test code.** The journeys contain no theme selection or screenshots, and the Playwright project configuration is outside the supplied hunks (`tests/e2e/photo.spec.ts:41–110`; `playwright.config.ts:59–79`). Component CSS is also unavailable.

### (f) Unsupported stage-report claims

- **“It proves the pipeline and the scoring work”** overstates the evaluation evidence (`docs/stages/stage-7-report.md:8`). Failed reads are omitted from field/line/total denominators, and `--set synthetic` can mislabel synthetic inputs as real when real fixtures exist (`packages/ai/eval/read-bill.ts:106–115,187`).
- **“makeBillFromPhoto issues, then records corrections and commits”** is not guaranteed: correction/commit errors are swallowed and success is returned (`docs/stages/stage-7-report.md:30`; `apps/web/actions/bills.ts:389–400`).
- **“The review shows each field with its confidence”** is too broad: amount, unit, HSN and phone are not mapped into editable review fields (`docs/stages/stage-7-report.md:30`; `apps/web/screens/photo/data.ts:110–126`).
- **“Playwright now starts its server on a clean `.next/dev`”** is conditional, not universal: `reuseExistingServer: true` can bypass the cleanup command (`docs/stages/stage-7-report.md:99`; `playwright.config.ts:63–65`).
- **“vitest 648” / “Playwright 136 (Stage 1 baselines unchanged)”** cannot be independently substantiated from test definitions without execution artifacts (`docs/stages/stage-7-report.md:91–94`).

### Additional code defects

- **Issuance and extraction commitment are not atomic or idempotent.** Failing input: two concurrent submissions for one ready extraction with different valid reviewed bill contents. Both can pass the initial read and issue bills before either commits; the losing commit is swallowed, leaving an issued bill without its extraction link/corrections. A database failure after issuance has the same partial-success problem (`apps/web/actions/bills.ts:383–400`).
- **Queue failure strands a pending extraction.** Failing input: a valid photo while `enqueue` fails. `startRead` commits before enqueueing; the request throws without returning the extraction ID or marking it failed, and no recovery is shown (`apps/web/app/api/photos/route.ts:30–41`; `packages/db/src/repos/photos.ts:70–87`).
- **Certain phone matches are discarded at issuance.** Failing input: customer text `J. Bldrs` with a phone matching `Joshi Builders`. The engine produces a score-1 phone match, but the screen rejects it unless name likeness is ≥0.85, potentially creating a duplicate customer despite displaying a certain match (`packages/engine/src/read-bill.ts:267–277`; `apps/web/screens/photo/Screen.tsx:119–120,151–155`).
- **Corrections do not preserve the model’s actual values.** Failing input: model date `23/8/26` or rate `Rs. 340.00`, then a human edit. `modelValues` comes from the normalized/derived checked reading, not the raw model answer, so correction provenance records transformed values (`apps/worker/src/read-bill/job.ts:107–120`; `apps/web/screens/photo/data.ts:93–102`).
- **Invalid image IDs can produce database errors instead of 404.** Failing input: `GET /api/extractions/------------------------------------/image` with a valid session. The regex accepts 36 hyphens; the UUID query can throw, and only `NotFoundError` is handled (`apps/web/app/api/extractions/[id]/image/route.ts:12,16,27–29`; `packages/db/src/repos/photos.ts:167–176`).
- **The totals warning becomes stale after edits.** Failing input: an initially matching reading followed by a rate edit. The CTA total recomputes, but warning visibility and numbers remain the original extraction values, so no mismatch warning appears (`apps/web/screens/photo/Screen.tsx:118,346–350`).
- **Evaluation misreports dataset provenance.** Failing input: five real fixtures plus `--set synthetic`. The report labels five selected synthetic fixtures as real because it uses directory counts rather than selected-file provenance (`packages/ai/eval/read-bill.ts:56–63,187`).
- **Evaluation accuracy excludes failed reads.** Failing input: one successful labelled bill and one transport failure. The failure increments only `failures`; its labelled fields, lines and total never enter denominators, allowing otherwise perfect accuracy/recall/total-match percentages (`packages/ai/eval/read-bill.ts:106–115,126–172`).

VERDICT: defects found
