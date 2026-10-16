# Stage 6 — independent review

- Reviewed commit: 67717f7
- Base: stage-6-start
- Head: stage-7-start
- Model: gpt-6.1-sol
- At: 2026-10-16T10:11:45.997Z
- Verdict: defects

---

### (a) Invariants I1–I10

- **I1 — Violated.** `businessesWithBills()` reads business documents across tenants without a `TenantScope` or `withTenant()` (`packages/db/src/system.ts:11–17`). Returning only IDs does not satisfy total tenancy. The three new tables do receive tenancy setup (`packages/db/migrations/0005_money.sql:74–76`).

- **I2 — Violated.**
  - Re-rendering uses the **current** business design and accent, not issued presentation data (`packages/render/src/print.ts:42–44, 62`). An old bill rendered in a previously unprinted size can change after profile edits.
  - Customer-facing WhatsApp text uses the current business name in reminders (`apps/web/screens/remind/data.ts:36–43`) and the current customer phone in the done loader (`apps/web/screens/bill-done/data.ts:35–46`), rather than exclusively the issued snapshot.
  - Cancel-and-redo reads the old bill but does not pass a correction link when issuing the replacement; `redoId` stops at loader data (`apps/web/screens/bill/data.ts:107–108, 178–180`; `apps/web/screens/bill/Screen.tsx:148–162`).
  - Issuance itself does call `issueDocument()` (`apps/web/actions/bills.ts:185`).

- **I3 — Not fully verifiable.** The unique numbering index remains represented in the migration snapshot (`packages/db/migrations/meta/0005_snapshot.json`, `documents_number` entry), but the allocation implementation and 50-concurrent-issue test are not supplied in this diff. The new seed explicitly advances series counters before issuing fixture numbers (`packages/db/src/seed.ts:486–494`); that is test-data setup, not evidence of gapless production allocation.

- **I4 — Violated.** Credit allocation is a new money calculation implemented with floating-point multiplication/division in the web action, not an integer engine function (`apps/web/actions/bills.ts:246–258`). It can allocate more than requested: four equal-gross groups and a two-paise credit allocate `1, 1, 1, -1`; filtering the negative line produces a three-paise credit (`apps/web/actions/bills.ts:267`). Form-preview agreement is tested only for the explicitly restricted fixture subset (`tests/unit/one-engine.test.ts:447–471`).

- **I5 — No new rule-data mutation shown; overall compliance unverified.** The report explicitly says `rules:check` remains red because of unverified rules (`docs/stages/stage-6-report.md:3`). Consequently, this input does not establish that the invariant’s verification gate is upheld.

- **I6 — No new model-output commit path shown.** New authoritative writes are repository calls following submitted inputs (`apps/web/actions/bills.ts:149–185, 262–269, 302–318, 334–337, 351`). The migration invokes tenancy/model-write protection setup for the new tables, but the implementation of that shared protection is not supplied (`packages/db/migrations/0005_money.sql:73–76`).

- **I7 — Partially evidenced, not fully verifiable.** New payments, reminders and rendering tables invoke shared audit setup; rendering replaces the generic trigger with `audit_file_row()` (`packages/db/migrations/0005_money.sql:73–78`). Existing-table writes, including the new customer timestamp update, rely on earlier audit triggers absent from the inputs (`packages/db/src/repos/documents.ts:464–473`). No unaudited write can be conclusively identified from the supplied trigger definitions alone.

- **I8 — Repository enforcement is present for the new production writes.** Payments, adjustments, reversals, reminders and stored renderings declare and check allowed roles (`packages/db/src/repos/payments.ts:24–28, 160, 169, 178`; `packages/db/src/repos/reminders.ts:16–24`; `packages/db/src/repos/document-files.ts:29–31, 49`). However, the worker unnecessarily upgrades an accountant job to staff rather than refusing it (`apps/worker/src/bills/jobs.ts:25–30`).

- **I9 — Tap-count coverage exists; full budget compliance is not established.** Real-data paths assert four and three taps (`tests/e2e/bills.spec.ts:46–83`). The new real-data path does not configure Slow 3G/4× CPU or assert total elapsed time to the share call (`tests/e2e/bills.spec.ts:46–65`); the complete pre-existing golden-path test is not supplied.

- **I10 — Violated.** Wiring adds new production markup and controls: download/error UI on done, ledger/write-off/reversal UI on bill view, and duplicate/state sheets on the bill form (`apps/web/screens/bill-done/Screen.tsx:157–175`; `apps/web/screens/bill-view/Screen.tsx:212–253, 368–460`; `apps/web/screens/bill/Screen.tsx:370–386, 448–470`). Keeping fixture branches unchanged does not establish that the wired production screen preserves the approved design. No operator approval for these changes is supplied.

### (b) Action and route tests

All seven additions have browser coverage, but **none has a supplied integration test invoking the action or route handler against Postgres**. Repository tests are not action/handler tests:

| Addition | Supplied browser coverage |
|---|---|
| `issueBill` — `apps/web/actions/bills.ts:123` | `tests/e2e/bills.spec.ts:46–65, 86–108` |
| `cancelBill` — `apps/web/actions/bills.ts:211` | `tests/e2e/bills.spec.ts:165–180` |
| `makeCreditNote` — `apps/web/actions/bills.ts:231` | `tests/e2e/bills.spec.ts:182–198` |
| `recordMoney` — `apps/web/actions/bills.ts:286` | `tests/e2e/bills.spec.ts:68–83, 110–128, 153–158` |
| `reverseMoney` — `apps/web/actions/bills.ts:328` | `tests/e2e/bills.spec.ts:159–163` |
| `reminderOpened` — `apps/web/actions/bills.ts:344` | `tests/e2e/bills.spec.ts:201–221` |
| File `GET` — `apps/web/app/api/documents/[id]/file/route.ts:19` | `tests/e2e/bills.spec.ts:101–108, 224–240` |

The supplied integration lifecycle instead calls repositories directly (`tests/integration/bills.test.ts:29–36, 51–57`), leaving action validation, session handling and refusal mapping without the required integration coverage.

### (c) Authoritative-write auditing

- **Payments and adjustments inserted:** `packages/db/src/repos/payments.ts:130–141`; audit setup: `packages/db/migrations/0005_money.sql:73–74`.
- **Payments reversed:** `packages/db/src/repos/payments.ts:182–186`; same audit setup: `packages/db/migrations/0005_money.sql:73–74`.
- **Reminders inserted:** `packages/db/src/repos/reminders.ts:33–44`; audit setup: `packages/db/migrations/0005_money.sql:75`.
- **Rendered files inserted:** `packages/db/src/repos/document-files.ts:59–72`; explicit audit trigger: `packages/db/migrations/0005_money.sql:77–78`.
- **Customer `lastBilledAt` updated:** `packages/db/src/repos/documents.ts:464–473`; the existing customer audit trigger is not supplied, so auditing cannot be independently confirmed.
- **Seed series counter updated:** `packages/db/src/seed.ts:488–494`; attribution uses `withTenant()`, but the existing series audit trigger is not supplied.
- **Customer creation, draft creation/update, issuance, cancellation and credit-note creation:** invoked at `apps/web/actions/bills.ts:149, 182–185, 217, 262–269`. Their complete underlying write/audit implementations are absent from this diff; blanket audit certification is therefore unsupported.

### (d) Generated documents

- **`docs/FIELD-TRACE.md` would not match the changed ownership source**, assuming the documented ownership overrides are applied:
  - The source gives `issueBillInput.id` an explanatory ownership value, while the generated row still says only `documents.id` (`docs/field-owners.json:17`; `docs/FIELD-TRACE.md:364`).
  - The source describes `issueBillInput.lines` as derived through engine parsing, while the generated row says only `documents.lines` (`docs/field-owners.json:19`; `docs/FIELD-TRACE.md:375`).
  - The reversal ID explanation likewise differs (`docs/field-owners.json:22`; `docs/FIELD-TRACE.md:387`).
- **`docs/SCREEN-FLOW.md`: regeneration cannot be certified.** New guide targets and controls appear without corresponding manifest changes in the supplied diff—for example entries/write-off targets (`apps/web/screens/bill-view/Screen.tsx:213, 238`). The generator and existing manifests are not supplied.
- **`tokens.ts` / `themes.css`: no source or generated-token changes are supplied.** There is no visible token-source change requiring regeneration; reproducibility itself cannot be executed or certified from these inputs (`apps/web/screens/bill/Screen.tsx:453` uses the existing `eb-input` class).

### (e) Themes and tokens

- **No new literal colour, radius, shadow or font is visible in the changed screen code.** New UI uses existing classes/components; added inline styles concern whitespace or strikethrough, not theme values (`apps/web/screens/bill/Screen.tsx:331`; `apps/web/screens/bill-view/Screen.tsx:230, 242`).
- **Both-theme coverage is incomplete for the newly added states.** The owner write-off/reversal/credit journey runs as Sharma, while the Harmony journey covers composition issuance and a reminder (`tests/e2e/bills.spec.ts:134–198, 201–221`); this does not show every touched state in both themes.
- **Printed-document literals are explicit and theme-independent**, including colours, radii and font families (`packages/render/src/template.ts:116–137, 186–187, 213`; `packages/render/src/render.ts:100, 142`). They are outside screen theming, but the referenced token allowlist itself is not supplied (`packages/render/src/index.ts:2–5`).

### (f) Unsupported stage-report claims

- **“number, customer name, GSTIN”** in the generated search vector is false: the expression indexes only number and customer name (`docs/stages/stage-6-report.md:7`; `packages/db/src/schema.ts:339–341`; `packages/db/migrations/0005_money.sql:51`).
- **“render-other-sizes runs after each issue”** is false for credit-note issuance: `makeCreditNote()` issues and returns without rendering or enqueueing (`docs/stages/stage-6-report.md:31`; `apps/web/actions/bills.ts:269–273`).
- **“printed from the issued snapshot”** is incomplete: current profile design/accent affect rendering (`docs/stages/stage-6-report.md:19`; `packages/render/src/print.ts:42–44, 62`).
- **“the file downloads and the chat opens”** is not reliably established by the tests: file fetching occurs before sharing/opening, potentially losing browser transient user activation, and browser tests replace the real share API with an always-successful stub (`docs/stages/stage-6-report.md:28`; `apps/web/screens/share.ts:69–90`; `tests/e2e/bills.spec.ts:25–36`).
- **“every step after it was run by hand and is green”** cannot be reconciled with the visibly inconsistent generated ownership rows without further evidence (`docs/stages/stage-6-report.md:3`; `docs/field-owners.json:17–22`; `docs/FIELD-TRACE.md:364–387`).
- **“Then download the four papers from the bill view”** is unsupported by that screen: its download link uses one configured paper size and exposes no paper selector (`docs/stages/stage-6-report.md:81`; `apps/web/screens/bill-view/Screen.tsx:145–155`).

### Additional code defects

- **Rendering cache looks up the wrong design.** Failing input: a business using `modern`, with a stored modern rendering, calling `printAndKeep()` without an explicit design. Lookup searches `classic`, then renders/stores `modern`; repeated requests miss the existing file. If a classic rendering exists, it is returned instead of the configured modern design (`packages/render/src/print.ts:32–44`).

- **Returned bytes can disagree with returned hash and size.** Failing input: two concurrent first renders of the same combination, or the non-classic cache miss above. `storeRendering()` can return the previously stored row, but `printAndKeep()` returns the newly rendered bytes alongside that old row’s metadata (`packages/db/src/repos/document-files.ts:73–88`; `packages/render/src/print.ts:84–93`). PDF render metadata can make the byte streams differ.

- **Retrying a refused new-customer bill creates another customer.** Failing input: submit a new customer with a phone, receive an issuance blocker, correct the bill and retry with the returned draft ID. The action creates the customer again before updating the draft; the schema has a unique business/phone index, so the retry can fail rather than reuse that customer (`apps/web/actions/bills.ts:149–157, 181–183`; `packages/db/migrations/meta/0005_snapshot.json`, `customers_business_phone` entry). Without a phone, retries create duplicate customer rows.

- **Dues silently omit older bills after 500 rows.** Failing input: 500 newer paid bills plus one older unpaid bill. SQL limits the unfiltered document set before the in-memory due-status filter, so dues, Home and the daily job can omit the unpaid bill (`packages/db/src/repos/documents.ts:631–632, 674–675, 690`).

- **Cancel-and-redo destroys mixed GST rates.** Failing input: cancel a bill containing both 5% and 18% lines, then issue the prefilled replacement unchanged. The loader restores the lines but forces GST mode to `one`, using only the first line’s rate (`apps/web/screens/bill/data.ts:151–157`); submission applies that rate to every line (`apps/web/screens/bill/Screen.tsx:123, 162`).

- **Malformed percent-encoded document identifiers escape route error handling.** Failing input: an authenticated request whose decoded path parameter is `%`, such as `/api/documents/%25/file`. `decodeURIComponent(raw)` throws before the `try`, producing an unhandled server error rather than a controlled invalid-input response (`apps/web/app/api/documents/[id]/file/route.ts:28–30`).

VERDICT: defects found
