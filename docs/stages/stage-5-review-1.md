# Stage 5 — independent review

- Reviewed commit: 0d71b3c
- Base: stage-5-start
- Head: stage-6-start
- Model: gpt-6.1-sol
- At: 2026-10-16T10:10:30.224Z
- Verdict: defects

---

### (a) Invariants I1–I10

- **I1 — Configured for the new tables; full enforcement not independently provable from this diff.** All five tables have non-null business foreign keys, and the migration calls `apply_tenancy` for each (`packages/db/migrations/0004_customers.sql:90–98,113–120`). Repository operations use `withTenant`; cross-business probes were added (`packages/db/src/repos/customers.ts:45–88,159–191`; `packages/db/src/repos/imports.ts:274–314`; `packages/db/src/repos/items.ts:140–165`). The implementation of `apply_tenancy` and transaction scoping is not supplied.
- **I2 — No new issued-document writer found.** The new authoritative writes target customers and items, not documents or issued snapshots (`packages/db/src/repos/customers.ts:90–137`; `packages/db/src/repos/items.ts:71–118`; `packages/db/src/repos/imports.ts:224–237`).
- **I3 — No numbering allocation changed.** The new commit transaction inserts customers and updates import links/status only (`packages/db/src/repos/imports.ts:184–240`).
- **I4 — New validation/readers remain in the engine; no new competing tax calculation found.** Item rates are checked as safe-integer paise and selectable basis points; imported monetary evidence uses `parseMoney` (`packages/engine/src/item.ts:69–74`; `packages/engine/src/import/bill-text.ts:177–183`). This does not establish the unchanged one-engine regression suite’s runtime result.
- **I5 — Violation: GST classification requirements are hard-coded.** `isHsnSac` embeds HSN digit lengths and the SAC prefix/length rule rather than selecting versioned rule-pack data by date (`packages/engine/src/item.ts:50–54`). The database independently embeds another, weaker rule accepting every length from two through eight (`packages/db/migrations/0004_customers.sql:85`).
- **I6 — Human-selected staging-to-customer path is present.** Reading inserts candidates into staging; committing filters by the supplied import and selected row IDs before inserting customers (`packages/db/src/repos/imports.ts:98–129,184–240`). The model-actor refusal has an integration test (`tests/integration/customers.test.ts:193–224`). No model call is added by this diff; Docling is called as a document converter (`apps/worker/src/import/docling.ts:43–65`).
- **I7 — Audit hooks are configured for every new table.** `apply_tenancy` is invoked for customers, items, imports and import rows; import files replace its audit trigger with `audit_file_row` (`packages/db/migrations/0004_customers.sql:113–122`). Attribution is passed into worker scope (`apps/worker/src/import/job.ts:21–27`). The shared audit-function implementations are absent, so their complete behavior cannot be reverified.
- **I8 — Enforcement exists, but declaration/generated-test coverage is incomplete.** Customer/item writes enforce declared roles (`packages/db/src/repos/customers.ts:26–30,90–128`; `packages/db/src/repos/items.ts:26–30,71–109`). `failImport` performs a write using `allowedRoles.recordReading` but has no own declaration or generated role probe (`packages/db/src/repos/imports.ts:43–47,133–140,255–273`).
- **I9 — No new duplicate-primary-action state is apparent, but the golden-path budget is unverified.** Import primary actions are separated by state, and the item screen adds only one primary save action (`apps/web/screens/import/Screen.tsx:94–99,157–165`; `apps/web/screens/item/Screen.tsx:164–171`). The new journeys do not measure the golden path or its tap/time budgets (`tests/e2e/customers.spec.ts:18–89`).
- **I10 — Violation: wiring changes markup and copy, not just data/actions.** Changes add a language-offer option and explanatory copy, import provenance/error/empty-state markup, and an HSN lookup sheet (`apps/web/screens/customer-new/Screen.tsx:162–183`; `apps/web/screens/import/Screen.tsx:137–189`; `apps/web/screens/item/Screen.tsx:173–201`). Keeping fixture screenshots unchanged does not establish approval of these new live states; the report supplies no operator approval (`docs/stages/stage-5-report.md:3,17`).

### (b) Server-action and route-handler tests

- `saveCustomer` → customer creation journey (`apps/web/actions/people.ts:36`; `tests/e2e/customers.spec.ts:18–37`). **No action-level Postgres integration test is supplied, and the update branch is not exercised by that journey** (`apps/web/actions/people.ts:43`).
- `setCustomerArchived` → **no action test supplied** (`apps/web/actions/people.ts:52–64`). The supplied archive test invokes the repository, not the action (`tests/integration/customers.test.ts:63–74`).
- `saveItem` → item creation journey (`apps/web/actions/people.ts:66`; `tests/e2e/customers.spec.ts:74–89`). **No action-level integration test or update-branch journey is supplied** (`apps/web/actions/people.ts:74`).
- `setItemArchived` → **no action test supplied** (`apps/web/actions/people.ts:82–94`). Generated tests exercise repository probes instead (`tests/integration/roles.test.ts:256–267`).
- Action `commitImport` → import journey (`apps/web/actions/people.ts:97–110`; `tests/e2e/customers.spec.ts:39–72`). The Postgres integration test calls the repository directly, not the action (`tests/integration/customers.test.ts:173–190`).
- `POST /api/imports` → upload portion of the import journey (`apps/web/app/api/imports/route.ts:17–49`; `tests/e2e/customers.spec.ts:49–56`). **No dedicated route integration test covering authentication, forbidden roles or malformed uploads is supplied**; those branches exist at `apps/web/app/api/imports/route.ts:19–24,44–47`.

Thus the mandatory integration-test requirement is not met for the added action/route surface.

### (c) Authoritative-write auditing

No new write lacking an audit-hook installation is evident, subject to the unavailable shared trigger implementations:

- **Customers:** create, update, archive, import insertion and seed insertion (`packages/db/src/repos/customers.ts:95–99,112–116,129–133`; `packages/db/src/repos/imports.ts:224–228`; `packages/db/src/seed.ts:353–372`) → audit configured at `packages/db/migrations/0004_customers.sql:113`.
- **Items:** create, update, archive and seed insertion (`packages/db/src/repos/items.ts:76–80,93–97,110–114`; `packages/db/src/seed.ts:375–388`) → audit configured at `packages/db/migrations/0004_customers.sql:114`.
- **Imports:** start, ready, failed and committed writes (`packages/db/src/repos/imports.ts:58–61,124–128,136–139,234–237`) → audit configured at `packages/db/migrations/0004_customers.sql:115`.
- **Import files:** insertion (`packages/db/src/repos/imports.ts:64–72`) → metadata-only audit configured at `packages/db/migrations/0004_customers.sql:120–122`.
- **Import rows:** staging insertion and customer-link update (`packages/db/src/repos/imports.ts:114–121,232`) → audit configured at `packages/db/migrations/0004_customers.sql:116`.

### (d) Generated-document regeneration

- **`docs/FIELD-TRACE.md` is inconsistent with its changed ownership source.** Its customer/item IDs lack the source’s explanatory ownership text, and `commitImportInput.importId` is reported as `import_rows.importId` instead of the explicit override `imports.id (status → committed)` (`docs/FIELD-TRACE.md:295–320`; `docs/field-owners.json:13–16`). These outputs cannot be certified as a faithful regeneration; the trace generator is not supplied.
- **`docs/SCREEN-FLOW.md`: regeneration unverified.** No manifest change is supplied, but the screen now has a new `failed` state and retry navigation that need to be checked against the absent manifest/generated output (`apps/web/screens/import/data.ts:20`; `apps/web/screens/import/Screen.tsx:178–189`).
- **`tokens.ts` / `themes.css`: regeneration unverified, with no token-source change shown.** The new UI uses existing classes/components rather than adding token definitions (`apps/web/screens/item/Screen.tsx:173–201`; `apps/web/screens/import/Screen.tsx:166–189`). Neither generator nor generated token files is supplied.

### (e) Both themes and tokens

- **No new literal screen colour, radius, shadow or font found in the supplied screen edits.** Customer-new, customer, import and item additions use existing classes/UI components (`apps/web/screens/customer-new/Screen.tsx:105–190`; `apps/web/screens/customer/Screen.tsx:110–123`; `apps/web/screens/import/Screen.tsx:137–189`; `apps/web/screens/item/Screen.tsx:173–201`).
- **Both-theme rendering is not established by these inputs.** The new journeys contain no theme-switching or screenshot assertions, and the shared Playwright project configuration is only partially supplied (`tests/e2e/customers.spec.ts:18–89`; `playwright.config.ts:56–77`). The report’s unchanged-baseline claim does not cover the new live language-offer, failure and lookup states (`docs/stages/stage-5-report.md:3,17`).

### (f) Unsupported or contradicted report claims

- **“a sentence for every file that gave nobody”** / **“says why a file gave nobody”** — explanations render only when the entire preview has zero rows. Uploading a valid party CSV alongside an unreadable photo hides the photo’s explanation (`docs/stages/stage-5-report.md:11,17`; `apps/web/screens/import/Screen.tsx:171–177`).
- **“recordReading writes import_rows and nothing else”** — it also updates `imports.status`, `summary` and `readAt` (`docs/stages/stage-5-report.md:21`; `packages/db/src/repos/imports.ts:124–128`).
- **“import_files … never changed”** — the immutability trigger permits changes to `name`, `size` and `created_at`. Likewise, the reading trigger permits changes to `file_name` and `existing_customer_id` despite “the reading itself never changes” (`docs/stages/stage-5-report.md:7`; `packages/db/migrations/0004_customers.sql:123–145`).
- **“every Stage 1 baseline is unchanged”** and the reported green totals are execution claims, not independently supported by supplied test results. The diff supplies test definitions, not run artifacts (`docs/stages/stage-5-report.md:3,35`; `tests/e2e/customers.spec.ts:18–89`).

### Additional code defects

- **Customer edits erase fields absent from the screen.** Failing input: edit an existing customer having address, notes, email or contact person, change only their name, and save. The loader retains only four fields, the screen submits only those fields, and the repository replaces every cleaned customer field; omitted values become null (`apps/web/screens/customer-new/data.ts:27–31`; `apps/web/screens/customer-new/Screen.tsx:64–71`; `packages/engine/src/customer.ts:115–130`; `packages/db/src/repos/customers.ts:108–116`).

- **Item edits erase hidden settings.** Failing input: edit an item with `description: 'Annual contract'` and `priceIncludesTax: true`, then save its name. Neither field is submitted; validation defaults them to null and false, and the update writes those defaults (`apps/web/screens/item/Screen.tsx:69–76`; `packages/engine/src/item.ts:76–87`; `packages/db/src/repos/items.ts:88–97`).

- **Queue failure leaves an import permanently reading.** Failing input: a valid upload for which queue initialization/send fails after `startImport` commits. The import transaction and enqueue are separate, and the route neither marks the import failed nor schedules recovery; the live screen polls indefinitely (`apps/web/app/api/imports/route.ts:28–40,43–48`; `packages/db/src/repos/imports.ts:57–75`; `apps/web/screens/import/Screen.tsx:42–49`).

- **A transient worker failure makes configured retries ineffective.** Failing input: the first attempt throws after loading files, but the next attempt could succeed. The catch marks the import failed; a later successful attempt reaches `recordReading`, which refuses to process any status other than `reading` and returns the failed row unchanged (`apps/worker/src/import/job.ts:28–38`; `packages/db/src/repos/imports.ts:100–102`; `apps/worker/src/index.ts:38`).

- **Matcher precedence depends on row order, not identifier strength.** Failing input: existing A has name `Acme` and no GSTIN; existing B has a different name and GSTIN G; candidate has name `Acme` and GSTIN G. A preceding B is returned by name before B’s exact GSTIN match is examined, incorrectly disabling the candidate as already existing (`packages/engine/src/import/match.ts:27–32`; `apps/web/screens/import/data.ts:92–93`).

- **Non-Latin customer names collapse into one staging row.** Failing input: CSV rows `राम` and `सीता`, both without GSTIN. ASCII-only normalization produces an empty key for both, and deduplication discards the second customer (`packages/engine/src/import/match.ts:16–20,37–43`).

- **Large valid imports cannot be committed through the UI.** Failing input: an accepted CSV containing 501 distinct new customers. All default to selected and the screen submits every selected ID, but action validation rejects arrays above 500; no batching or limit explanation is implemented (`apps/web/screens/import/Screen.tsx:29–31,75–78`; `apps/web/actions/schema.ts:119–126`; `apps/web/actions/people.ts:98–100`).

- **XLSX decompression has no expanded-size bound.** Failing input: an under-8-MB XLSX ZIP containing a highly compressible, enormous XML entry. Every entry is synchronously inflated without `maxOutputLength`, allowing one accepted upload to exhaust worker memory or block processing (`apps/worker/src/import/read-file.ts:41,65–67`; `apps/worker/src/import/xlsx.ts:33–46`).

VERDICT: defects found
