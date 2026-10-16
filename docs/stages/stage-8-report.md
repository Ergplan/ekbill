# Stage 8 — GST compliance

**Status: built and tested in the build container; the rule verification and the independent review run on the VM.** These now run on the issued documents:

- the GST tab's workings and their drill-down
- the CA pack (workings.xlsx, gstr1.json, every bill as PDF) on "CA ko bhejo"
- the bill form's checks, each with "Kyun?"
- `rules:update` and the generated `docs/GST-RULES.md`

Nothing files anything.

Two done-conditions could not be met here, so they are stated first:

- All 23 rule entries are still unverified. The build container cannot reach the official sites, so `npm run rules:verify` must run on the VM. `rules:check` stays red until then.
- gstr1.json is checked against the offline tool's structure as transcribed. GSTN's own sample file could not be downloaded here.

## What exists

**Workings** (`packages/db/src/repos/gst.ts`) are read-only. `periodDocuments` and `workingsFor` turn the period's issued snapshots into GSTR-1 tables (4A, 5, 7, 9B, 12, 13), GSTR-3B 3.1(a), 3.1(c) and 3.2, and the rate split. These come from the engine's salvaged `buildGstr1` and `buildGstr3bOutward`. Every figure carries its documents.

**The GST tab** shows:

- the periods with bills as chips, by month or quarter
- the sales and GST tiles
- the rate table, where a row opens its documents (`/gst/docs?table=rate&rate=1800`)
- the B2B list (`table=b2b`) and the B2C note (`table=b2c`)

The drill page sums its rows, and the sum is the figure. "CA ko bhejo" hands the zip to the share sheet for the owner and the accountant. Staff neither see the button nor get the pack (403).

**The CA pack** comes from `packages/render/src/ca-pack.ts` and `GET /api/gst/pack`. It contains:

- **workings.xlsx**: Summary, B2B, B2C Large, B2C Small, credit notes, HSN, GSTR-3B and Documents.
- **gstr1.json**: written by `packages/engine/src/gstr1-json.ts`. It has b2b, b2cl, b2cs (registered credit notes go to cdnr, unregistered ones are netted into b2cs), hsn and doc_issue. Amounts are in rupees, dates dd-mm-yyyy, the period as MMYYYY.
- **bills/**: every document as its PDF.
- **README.txt**.

**Per-bill checks**: the bill form runs the same `assessDocument` the issue runs. Blockers stop "Bill banao". Notices are shown. Each check with a rule entry has "Kyun?", which shows the entry's Hinglish explanation and its source.

The checks shown are:

- place of supply
- the customer's GSTIN state against the place of supply (new, asked, not refused)
- HSN digits for the turnover band
- the B2C recipient details at ₹50,000
- the composition legend
- e-invoicing applicability, the self-declaration (now said only where it matters) and the IRN window
- the credit-note date limit
- a bill dated within a month of a rate change (new)
- reverse charge (not issued in this release)
- nil-rated lines on a tax invoice

**The rule workflow**: `npm run rules:update` lists every entry with its window, whether it is verified, when, and the source. `npm run rules:doc` writes `docs/GST-RULES.md`; it covers every entry with its explanation and source, plus prose for the CA on IMS, e-way bills, registration thresholds and the purchase side. The watcher runs `rules:doc:check`.

## Invariants, file:line

- **I2 and I4**: `packages/db/src/repos/gst.ts:101` reads only `issued_snapshot`. The tables are the engine's. `packages/engine/src/gstr1-json.ts:131` only reshapes them.
- **I5**: the form's checks are `assessDocument` (`apps/web/screens/bill/Screen.tsx:126`), the same function `issueDocument` calls. The new notices are at `packages/engine/src/assess.ts:162` and `:178`. "Kyun?" reads `explain(ruleId)` from the pack.
- **I8**: the pack is the owner's and the accountant's (`apps/web/app/api/gst/pack/route.ts:20`). The workings are readable by every member.
- **I1**: the generated tenancy test adds "workingsFor counts nothing of another business's bills".

## Tests

| What                                                                                                                  | Where                              | Count |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----- |
| A hand-computed quarter (see below)                                                                                   | `tests/integration/gst.test.ts`    | 1     |
| Every rate row drills to documents that add up to it, as do the B2B, B2C and credit-note tables                       | `tests/integration/gst.test.ts`    | 1     |
| The pack (see below)                                                                                                  | `tests/integration/gst.test.ts`    | 1     |
| Pass and fail for every check the form shows that had none, and "Kyun?" in both registers for every check with a rule | `tests/unit/engine-assess.test.ts` | +6    |
| Playwright (see below)                                                                                                | `tests/e2e/gst.spec.ts`            | 3     |

The hand-computed quarter, Apr–Jun 2026, has:

- mixed rates: 18 %, 12 % and 5 %
- an inter-State B2C bill
- a credit note to a registered customer
- a cancelled bill

The arithmetic is in the test's header. Net taxable is ₹12,500, CGST and SGST are ₹905 each, IGST is ₹120, and the cancelled bill is counted in table 13 only.

The pack test checks one zip with:

- a PDF for every document
- gstr1.json's figures, with every key path and type found in the offline tool's structure
- workings.xlsx read back by the importer's own xlsx reader, with Summary, B2B and Documents matching the workings

The Playwright tests cover:

- a quarter opened, the 18 % row drilled and adding up, B2B listed, and the pack shared as a zip with the right files
- staff refused the pack
- a ₹70,800 bill to a walk-in showing the B2C recipient check, with "Kyun?" opened

Totals:

| Suite      | Passed                            |
| ---------- | --------------------------------- |
| vitest     | 659                               |
| Playwright | 139 (Stage 1 baselines unchanged) |

## Documents

- `docs/GST-RULES.md`, which is new and generated.
- `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (five entries), `docs/KNOWN-GAPS.md` (seven rows) and `docs/FIELD-TRACE.md`.

## For the operator

1. On the VM, run `git pull`, then `deploy/vm/up.sh`.
2. Run `npm run rules:verify`, then `npm run rules:doc`, and commit the pack and the document. This closes the rule-verification condition of Stages 3 and 8.
3. Drop GSTN's own GSTR-1 offline-tool sample JSON over `tests/fixtures/gstn/gstr1-sample.json`, keeping a `_source` line. Then run `npm run test:integration -- tests/integration/gst.test.ts`.
4. Import one pack's gstr1.json into the GSTN offline tool once and note what it says.
5. Run `npm run review:stage -- 8`, then push the tags: `git tag stage-8-start 25c1f71 && git push origin --tags`.
