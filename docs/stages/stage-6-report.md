# Stage 6 — Wire: bills, money, sharing

**Status: built and tested in the build container; the independent review runs on the VM.** The bill-start, bill, bill-done, bill-view, credit-note, remind, bills and dues screens (and Home, the customer folder and the directory) read and write documents for a signed-in person. A `?as=` look stays on the fixtures, and every Stage 1 baseline is unchanged. The watcher is green through `rules:check`, which stays red on the unverified count until `npm run rules:verify` runs on the VM (Stage 3's item); every step after it was run by hand and is green.

## What exists

**Data model** (`packages/db/src/schema.ts` → `migrations/0005_money.sql`): `documents.customer_id` references `customers`; `documents.search` is a generated tsvector (number, customer name, GSTIN) with a GIN index. New tables: `payments` (payment | adjustment, amount in paise, date, method, note; reversed once with who and why), `document_files` (one kept PDF or JPEG per bill, kind, paper and design, with its size, sha256 and render time) and `reminders_sent` (tone, language, the text opened). `apply_tenancy` on all three.

**Engine (pure)**: `ledger.ts`. `balanceOf` is the one balance every screen and report asks: payments and adjustments that still count, credit notes against the bill, a cancelled bill owing nothing. `checkEntry` refuses an amount above what is due, a date in the future or before the bill, and an unknown method, each as a dictionary key. `ageInDays` and `suggestedTone` serve the dues and the reminder.

**Repositories**:

- `payments.ts` records a payment (owner, staff), writes an amount off (owner) and reverses an entry (owner); the bill row is locked while the check runs.
- `reminders.ts` keeps the reminder opened (owner, staff).
- `document-files.ts` keeps a file once (owner, staff).
- `documents.ts` adds `listBills` (the chips, search, each row's balance and last payment), `billView`, `findBill` (by id or number), `lastBillFor` and `duesToday`; `issueDocument` stamps `customers.last_billed_at`.
- `system.ts` lists the businesses with bills (ids only) for the daily job.

**Render** (`packages/render`): the MVP's three designs on four papers as PDF and JPEG, printed from the issued snapshot. The logo and signature are the files the snapshot names, and the UPI QR is added. Chromium runs with JavaScript off and every request refused except `data:`. `printAndKeep` serves a kept file or prints and keeps it. The accountant's file is printed and not kept. `printTheRest` is the worker's job.

**Web**:

- `actions/bills.ts`: `issueBill` creates the customer when the form names a new one. It drafts, or reuses the draft a refused try left, then calls `issueDocument`. It prints the shared format at once and queues the other sizes.
- The same file holds `cancelBill`, `makeCreditNote` (the amount split over the bill's rates in its proportion), `recordMoney`, `reverseMoney` and `reminderOpened`.
- `GET /api/documents/<id or number>/file?kind&paper[&download=1]` serves any member of the business.
- `screens/live.ts` maps documents into the fixture shapes the screens draw.
- The bill form gains the duplicate guard (same customer, same total, within 7 days: asked) and the rate-oddity notice (four times off last time: shown). It also gains a full state list under "Doosra state".
- The done screen and "WhatsApp dobara" hand the real PDF or JPEG to the share sheet; where a browser cannot share files, the file downloads and the chat opens.
- The bill view lists the money with reversal, "Kam karo", the credit note and the reminder count.

**Worker**: `render-other-sizes` runs after each issue and `dues-today` runs daily at 08:00 IST; it logs and never sends.

**Seed**: the twenty fixture bills are issued through `issueDocument` with their payments, the cancelled INV-034 and CN-001 against INV-038. The seed's series and Sharma's GSTIN now match the fixtures.

## Invariants, file:line

- **I2 issue once, never changed**: `apps/web/actions/bills.ts:124` issues only through `documents.issueDocument`. A refused issue leaves a draft and spends no number. `0005_money.sql:86` keeps a printed file unchanged, and `:104` and `:119` make money against a bill immutable and only against an issued bill. Tests: `tests/integration/render.test.ts` ("never changes a kept file") and `bills.test.ts` ("a recorded entry is never changed or deleted").
- **I4 one engine**: the form's running total is `computeTax` through `screens/bill/compute.ts`. `tests/unit/one-engine.test.ts` now checks the form preview against the issued figures for every plain fixture. The balance is `packages/engine/src/ledger.ts:34` everywhere.
- **I8 roles**: `allowedRoles` sits in `payments.ts:24`, `reminders.ts:16`, `document-files.ts:29` and `documents.ts:130`. The generated roles test holds 99 cases. The screens hide what a role cannot do, and the repository refuses it anyway.
- **I1 tenancy**: `0005_money.sql:74-76`. The generated tenancy test adds the payments, reminders and files probes (23 in all). Another business's bill file answers 404 (`tests/e2e/bills.spec.ts`).
- **I9 golden paths on real data**: (a) takes 4 taps and hands the PDF to the share sheet; (b) takes 3 taps and the dues move (`tests/e2e/bills.spec.ts`).

## Tests

| What                                                                                                                                                 | Where                                                | Count  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------ |
| The balance, the entry checks, ageing and tone                                                                                                       | `tests/unit/engine-ledger.test.ts`                   | 7      |
| The form preview equals the issued bill, for every plain fixture                                                                                     | `tests/unit/one-engine.test.ts`                      | +14    |
| The payment lifecycle (issue, part, write-off, full, reversal, pay again), immutability, money on issued bills only, credit note against the balance | `tests/integration/bills.test.ts`                    | 3      |
| The bills list (fixture bills, chips, search, `findBill`), reminders, the daily dues listing                                                         | `tests/integration/bills.test.ts`                    | 4      |
| Key strings on paper, the PDF page per paper and the JPEG, the 3 s budget, the kept file never changing, the accountant's unkept print               | `tests/integration/render.test.ts`                   | 4      |
| Roles and tenancy, generated                                                                                                                         | `tests/integration/roles.test.ts`, `tenancy.test.ts` | 99, 23 |
| Playwright journeys (see the list below)                                                                                                             | `tests/e2e/bills.spec.ts`                            | 7      |

The seven Playwright journeys are:

- Golden path (a) on real data.
- Golden path (b) on real data.
- Staff make a bill for a new customer, download the PDF and photo, and record part of the money; more than is due is refused.
- The owner writes off, reverses, cancels and redoes, then credit-notes the new bill.
- A composition business (the harmony theme) issues a bill of supply and opens a reminder.
- The accountant reads and downloads.
- Another business is refused.

Totals:

| Suite      | Passed                            |
| ---------- | --------------------------------- |
| vitest     | 594 (unit 415, integration 179)   |
| Playwright | 133 (Stage 1 baselines unchanged) |

## Documents

`docs/ARCHITECTURE.md` (Stage 6), `docs/FIELD-TRACE.md` (17 tables, 98 input fields, all owned), `docs/DECISIONS.md` (eleven entries) and `docs/KNOWN-GAPS.md` (ten rows).

## For the operator

1. On the VM, run `git pull`, then `deploy/vm/up.sh`. Migration `0005` applies on start. The image now carries `tests/fixtures/v2.json` for the seed, and the seed runs with `--conditions=react-server`, which issues the fixture bills.
2. Then run `npm run review:stage -- 6` with the earlier ones still pending, and report the VERDICT lines.
3. Push the tags: `git tag stage-6-start 0d71b3c && git push origin --tags`.
4. Try one bill on a phone: make it, tap "WhatsApp pe bhejo" and check the PDF arrives as an attachment. Then download the four papers from the bill view.
