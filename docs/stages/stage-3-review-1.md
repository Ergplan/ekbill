# Stage 3 — independent review

- Reviewed commit: 3552e4b
- Base: stage-3-start
- Head: stage-4-start
- Model: gpt-6.1-sol
- At: 2026-10-16T10:07:25.499Z
- Verdict: defects

---

## (a) Invariants I1–I10

- **I1 — Supported for the new tables, not independently proven end-to-end.** Both tables have non-null tenant IDs and business foreign keys; the migration invokes `apply_tenancy` for both (`packages/db/migrations/0002_documents.sql:3,45,71–75,89–90`). Repository operations use `withTenant`; cross-tenant document reads and issuance have tests (`packages/db/src/repos/documents.ts:343–350,379–385`; `tests/integration/documents.test.ts:303–306`). The implementation of `apply_tenancy` and `withTenant` is not supplied, so their actual policies cannot be independently checked.

- **I2 — Violated: the issue gate is caller-controlled.** Any application-role SQL caller can execute `select set_config('app.issuing','1',true)` and then issue a row with fabricated totals and snapshot. The trigger checks only that writable setting, not execution through `issueDocument` (`packages/db/migrations/0002_documents.sql:96–106`; `packages/db/src/repos/documents.ts:384`). The raw-SQL tests omit setting it first (`tests/integration/documents.test.ts:241–265`). Also, inserting a complete row directly as `cancelled` bypasses the issue gate entirely: the completeness constraint permits cancelled rows, while the gate checks only `new.status = 'issued'` (`packages/db/migrations/0002_documents.sql:36–38,98–99`).

- **I3 — Violated despite the concurrency test.**
  - After issuing sequences 1 and 2, the owner can set `nextNumber:100`; the next issue leaves 3–99 unused. This is expressly tested as success, contradicting “gapless” (`packages/db/src/repos/series.ts:158–162`; `tests/integration/numbering.test.ts:89–96`).
  - Only one FY counter is retained. Issue in FY A, then FY B, then backdate another issue into A: any FY difference resets to 1 instead of resuming A’s counter. An existing A/001 causes a uniqueness failure (`packages/engine/src/numbering.ts:64–66`; `packages/db/migrations/0002_documents.sql:76`). The rollover test covers forward movement only (`tests/integration/numbering.test.ts:47–73`).

- **I4 — Violated: there are additional tax calculators.** `gstByRate` calculates GST independently using floating-point multiplication and `Math.round`; the contract helper separately computes exclusive and inclusive GST (`packages/engine/src/bill-form.ts:130–148`; `packages/engine/src/contract.ts:239–250`). These do not consume `computeTax` output. For example, two lines of 3 paise at 18% produce 1 paise in `gstByRate`, but zero tax through per-line intra-state `computeTax` (`packages/engine/src/tax.ts:158–163`). The purity test checks forbidden dependencies, not this single-calculator invariant (`tests/unit/engine-purity.test.ts:25–35,43–56`).

- **I5 — Not complete, and partially violated.** All 23 entries remain unverified; the report explicitly records the failing gate (`docs/stages/stage-3-report.md:61–63`). The checker correctly rejects more than three (`scripts/rules-check.mjs:69–72`). However, statutory number length and fallback HSN digits/due days remain embedded in code rather than exclusively selected from data (`packages/engine/src/numbering.ts:26–27`; `packages/engine/src/rules.ts:241–242,297–300`). More importantly, several rule values are incorrect; see additional defects below.

- **I6 — Supported for the new tables, subject to the unavailable tenancy implementation.** Both tables receive the shared model-write protection through `apply_tenancy`; issuing with `actorKind:'model'` is tested to fail (`packages/db/migrations/0002_documents.sql:88–90`; `tests/integration/documents.test.ts:300–302`). No model-call implementation is added; that remains deferred (`docs/KNOWN-GAPS.md:17`).

- **I7 — Supported for the new document/series writes, subject to the unavailable audit implementation.** Both receive the shared audit trigger, and an integration test asserts document INSERT, series UPDATE and document UPDATE under one request ID (`packages/db/migrations/0002_documents.sql:88–90`; `tests/integration/documents.test.ts:267–289`). Existing business-trigger behavior and seed attribution cannot be fully checked from the supplied changes (`packages/db/src/seed.ts:245–290`).

- **I8 — Repository checks exist, but credit-note issuance contradicts the declared restriction.** The code says only the owner issues a credit note, yet staff can issue any draft, including an owner-created credit-note draft: `issueDocument` never applies a kind-specific role check (`packages/db/src/repos/documents.ts:127–134,379–394`). Failing input: staff calls `issueDocument` with a credit-note draft ID. Generated tests exercise staff issuance only with ordinary bill drafts (`packages/db/src/repos/documents.ts:566–569`; `tests/integration/roles.test.ts:68–71`).

- **I9 — Unchanged, not verified by this diff.** No golden-path implementation or measurement is supplied; the report states that issuance and sharing screens remain future work (`docs/stages/stage-3-report.md:94`). The existing budgets therefore cannot be certified from these inputs.

- **I10 — No screen-design change identified.** This stage adds engine/database functionality and dictionary entries, not screen markup or baselines; screen wiring is explicitly deferred (`docs/stages/stage-3-report.md:94`; `design/copy/strings.json:1868–2147`). Existing visual-baseline enforcement is not supplied and cannot be certified.

## (b) Added server actions and route handlers

- **None added.** The added callable surface consists of repositories, not server actions or route handlers; the report defers their screen/action wiring (`packages/db/src/index.ts:25–27`; `docs/stages/stage-3-report.md:94`).
- Repository behavior has integration coverage in `tests/integration/documents.test.ts:50–308` and `tests/integration/numbering.test.ts:28–129`; this does not establish tests for future actions.

## (c) Auditing authoritative writes

- **`documents`:** `createDraft` INSERT, `updateDraft` UPDATE, `issueDocument` UPDATE, `cancelDocument` UPDATE and `createCreditNote` INSERT are covered by the table’s shared audit installation (`packages/db/src/repos/documents.ts:250–275,312–339,435–454,478–489,525–551`; `packages/db/migrations/0002_documents.sql:90`).
- **`series`:** creation, configuration updates, issue-time allocation, and seed upserts are covered by the shared audit installation (`packages/db/src/repos/series.ts:124–135,164–169`; `packages/db/src/repos/documents.ts:430–433`; `packages/db/src/seed.ts:271–295`; `packages/db/migrations/0002_documents.sql:89`).
- **`businesses`:** seed INSERT/upsert now includes seller fields (`packages/db/src/seed.ts:260–267`). The architecture describes its pre-existing audit trigger, but that trigger’s implementation is absent from these inputs; no new unaudited path is demonstrated (`docs/ARCHITECTURE.md:25,33`).
- **Evidence limit:** the issue audit is directly asserted, but the shared trigger’s payload and append-only protection cannot be inspected here (`tests/integration/documents.test.ts:267–289`; `docs/ARCHITECTURE.md:30,33`).

## (d) Generated artifacts

- **`docs/FIELD-TRACE.md`: not independently certifiable.** Its added business, series and document columns correspond to the changed Drizzle schema, and the rule schema explicitly opts out as non-user-input (`docs/FIELD-TRACE.md:24–32,89–137`; `packages/db/src/schema.ts:65–81,203–316`; `packages/engine/rules/schema.ts:1`; `scripts/trace.mjs:85–89`). The full generator and ownership inputs are not supplied, so exact regeneration cannot be established.
- **`docs/SCREEN-FLOW.md`, `tokens.ts`, `themes.css`: no relevant source changes identified.** No manifests or token sources are changed; the report claims the respective checks passed, but execution evidence and complete generators are unavailable (`docs/stages/stage-3-report.md:3`). No specific regeneration mismatch is demonstrated.

## (e) Themes and tokens

- **No screen or styling file is touched; no new literal colour, radius, shadow or font is identified.** The changed owner-facing presentation material consists of dictionary strings, while screen wiring is deferred (`design/copy/strings.json:1868–2147`; `docs/stages/stage-3-report.md:94`). Rendering both themes cannot be revalidated from these inputs.

## (f) Unsupported stage-report claims

- **“`computeTax` is the only tax arithmetic”** is false: bill-form and contract helpers calculate tax independently (`docs/stages/stage-3-report.md:18`; `packages/engine/src/bill-form.ts:130–148`; `packages/engine/src/contract.ts:239–250`).
- **“The database holds it”**, referring to one-writer enforcement, is overstated: callers can set the same custom setting checked by the gate; direct cancelled inserts bypass it (`docs/stages/stage-3-report.md:16`; `packages/db/migrations/0002_documents.sql:36–38,98–106`).
- **“the next number only goes up”** is not universally true: before first issuance, `highestIssued` is zero and `canSetNextNumber` permits decreasing a configured next number (`docs/stages/stage-3-report.md:11`; `packages/db/src/repos/series.ts:158–162`; `packages/engine/src/numbering.ts:78–85`). Failing input: create a series with `nextNumber:100`, then update it to 1.
- **“20 fixtures through `computeTax`, then `prepareIssue`, then `buildGstr1`”** overstates coverage. One fixture is deliberately refused, and non-tax-invoice results return before GSTR-1 construction (`docs/stages/stage-3-report.md:18`; `tests/unit/one-engine.test.ts:424–437`).
- **“every unsupported flag”** is not supported by the assessment test’s parameter list: it omits `deemed-export`, which is a declared flag (`docs/stages/stage-3-report.md:29`; `tests/unit/engine-assess.test.ts:94–101`; `packages/engine/src/assess.ts:26`).

## Additional code defects

- **E-invoice and HSN turnover thresholds are ten times too high.** ₹5 crore is **5,000,000,000 paise**, not 50,000,000,000; ₹10 crore is **10,000,000,000 paise**, not 100,000,000,000 (`packages/engine/rules/gst/e-invoice.json:11,38`; `packages/engine/rules/gst/hsn.json:13`). Failing input: a ₹6 crore regular B2B seller with a four-digit HSN passes both checks when it should require e-invoicing and six HSN digits (`packages/engine/src/assess.ts:159–165,187–188`).

- **E-invoice blocking incorrectly applies to B2C bills.** The rule declares B2B scope, but assessment never checks whether the customer is registered (`packages/engine/rules/gst/e-invoice.json:13`; `packages/engine/src/assess.ts:177–188`). Failing input: a regular seller above the configured threshold issuing an ordinary domestic bill to an unregistered customer is blocked as `e-invoicing-applicable`.

- **Tax-inclusive prices need not remain inclusive after rounding.** The implementation backs out taxable value, then independently rounds both heads without reconciling to the entered inclusive amount (`packages/engine/src/tax.ts:154–173`). Failing input: one intra-state line, quantity 1000, inclusive price 100 paise, GST 1800 bp. Taxable value becomes 85 paise; CGST and SGST become 8 paise each; the customer is charged **101 paise**, not 100.

- **Mandatory recipient name is never checked.** The B2C threshold check tests address and state only, while draft creation accepts an empty trimmed name (`packages/engine/src/assess.ts:170–175`; `packages/db/src/repos/documents.ts:260`). Failing input: a ₹50,000 B2C invoice with `name:''`, valid address and state can issue.

- **Required HSN can be omitted to bypass rejection.** A short code blocks, but removing it produces only a notice, permitting issuance without legally required digits (`packages/engine/src/assess.ts:159–165`). Failing input: a registered B2B customer and `hsnCode:null`, where a four-digit code is required.

- **Nil-only supplies can issue under the wrong document title.** All deliberately zero-rated lines merely add a notice; the document remains a tax invoice and `canIssue` remains true (`packages/engine/src/assess.ts:147–149,211–215`). Failing input: a regular seller’s bill containing only nil-rated vegetables with GST enabled.

- **Number length is not checked at allocation.** A valid configuration can later grow beyond 16 characters; `nextNumberFor` formats without validating the actual result (`packages/engine/src/numbering.ts:40–45,59–66`; `packages/db/src/repos/documents.ts:427–438`). Failing input: prefix `ABCDE`, FY enabled, padding 3, next number 999. After issuing sequence 999, sequence 1000 produces `ABCDE2026-27/1000`, a 17-character number.

- **Credit-note issuance races invoice cancellation.** Credit-note issuance reads the linked invoice without locking it, while cancellation separately checks for issued notes (`packages/db/src/repos/documents.ts:397–405,464–477`). Failing interleaving: cancellation sees no issued credit note; credit-note issuance sees the invoice still issued; both commit. The result is an issued credit note against a cancelled invoice.

- **A credit note can correct another credit note.** Creation checks only issued status and snapshot presence, not that the target is an invoice; issuance repeats that omission (`packages/db/src/repos/documents.ts:510–514,397–405`). Failing input: pass an issued credit note’s ID as `invoiceId`.

- **GSTR-1 document summary loses cancelled-only periods and excludes cancelled numbers from its range and total.** It constructs ranges solely from issued invoice numbers (`packages/engine/src/workings.ts:316–330`). Failing input: no issued invoices and `cancelledNumbers:['INV-001']` yields no summary; issued `INV-001` plus cancelled `INV-002` yields a range ending at `INV-001` and total 1.

- **GSTR-1 merges distinct documents sharing a number.** B2B and B2CL grouping uses displayed number rather than document identity; the database permits the same displayed number in different series (`packages/engine/src/workings.ts:230,255`; `packages/db/migrations/0002_documents.sql:76`). Failing input: two series issue `INV-001` to the same GSTIN in one month. Their lines merge while invoice value and source document ID remain those of the first document.

- **GSTR-3B interstate-unregistered figures do not net credit notes.** The taxable total subtracts notes, but Table 3.2 accumulation explicitly accepts invoices only (`packages/engine/src/workings.ts:389–415`). Failing input: an interstate B2C invoice and a full credit note in the same period produce zero net taxable outward supplies but leave the original positive Table 3.2 amount.

- **IFF exclusion can remove a third-month document that cannot have been furnished through IFF.** The function trusts arbitrary furnished months and has no first-two-month guard (`packages/engine/src/workings.ts:482–497`). Failing input: September invoice `INV-004` with a September furnished record excludes it from the July–September quarterly set. The corresponding MVP protection was explicitly dropped (`docs/stages/stage-3-report.md:53`).

- **Rule verification can certify incorrect numeric data.** Verification checks phrase presence, not correspondence between the source and configured figures (`scripts/rules-verify.mjs:55–62`). Failing input: the current erroneous 50,000,000,000-paise threshold can become `verified:true` merely because its source contains “10/2023” and “five crore” (`packages/engine/rules/gst/e-invoice.json:11,24`).

VERDICT: defects found
