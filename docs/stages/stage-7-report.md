# Stage 7 — Photo → bill

**Status: built and tested in the build container with a stand-in model. The real model, the real photos and the independent review run on the VM.** An owner or staff member photographs a kaccha bill and the worker reads it into an extraction. The reading is staging only (I6). The owner reviews the fields, coloured by confidence, corrects what is wrong and taps "Bill banao". That goes through Stage 6's issue path, and the corrections become rows.

Two things could not be done here, so they are stated first:

- No model was called. The build has no key and must not call one.
- `tests/fixtures/bills/real/` is empty. The eval below is the harness run on 30 synthetic bills with the fake model. It proves the pipeline and the scoring work. It says nothing about a model's accuracy.

## What exists

**Data model** (`migrations/0006_photo.sql`):

- `uploads` holds the photo as picked, up to 8 MB, and never changes.
- `extractions` holds the reading. Its status moves pending → ready | failed → reviewed → committed | discarded. It also holds the error code, model, prompt version, whether Docling was used, the normalised image, the checked result, warnings, the matched customer with its score, the ai_calls row, cost, latency and the committed document.
- `extraction_corrections` holds field, model value and human value, and is append-only.
- `apply_tenancy` runs on all three. The audit leaves the image bytes out.

**packages/ai**: `callVision` does one call:

- It loads the versioned prompt `prompts/read-bill/v1.md` and checks the answer against `readBillAnswer`; a malformed answer becomes an `invalid` reading.
- It has a timeout and retries on 429 or 5xx.
- It writes one `ai_calls` row per call through the caller's recorder, with cost from the configured prices.
- Transports: OpenAI chat completions with the image, and a fake one for tests (`AI_TRANSPORT=fake`).

**Engine** (`read-bill.ts`): `checkReading` reads amounts, quantities and Indian dates loosely. It flags quantity × rate that is not the amount and derives a missing rate. A date in the future or more than a year back is lit. It matches the customer by phone, else by name (Dice ≥ 0.6). The total is the engine's `computeTax` over the lines; the image's figure is only compared and warned.

**Worker** (`read-bill`): normalise with sharp (EXIF upright, ≤ 2000 px, JPEG q85, EXIF dropped). Docling's text is a hint where it runs. The model gets the business's customer and item names as spelling hints. The reading is checked and written as the model.

**Web**: `POST /api/photos` (owner, staff) queues the read. `GET /api/extractions/[id]/image` serves the photo. `makeBillFromPhoto` issues, then records corrections and commits. The photo screen polls while reading. The review shows each field with its confidence, the customer match, and a note when the photo's total differs from the lines. The failure states are unclear, no bill, and unavailable with "Bill khud likh lo".

**Eval** is `npm run eval:read-bill [-- --fake]`. It reports field accuracy, line recall, total-match rate and abstention rate separately, with failures, latency and cost per read.

## Invariants, file:line

- **I6 staging only**:
  - `0006_photo.sql:102-145` (`guard_extraction`): a model may only turn a pending reading into ready or failed, once. It never starts a reading, changes a recorded one, or commits or points it at a document. A commit needs an issued bill, written by a person.
  - `refuse_model_actor` (`apply_tenancy`) still keeps a model off documents, customers and every other table.
  - The worker writes as the model: `apps/worker/src/read-bill/job.ts:36`.
  - The only path from a reading to a bill is `apps/web/actions/bills.ts:377` `makeBillFromPhoto`, which calls Stage 6's `issueDocument` path, then `photos.ts:225` `commitReading`.
  - Test: `tests/integration/photos.test.ts` ("I6 at the database"). It checks that a model cannot write documents or customers, cannot start, rewrite or commit a reading, and that the audit trail reads `user:pending`, `model:ready`, `user:committed` without the image.
- **I4 the engine's totals**: `packages/engine/src/read-bill.ts:244`. The total written on the photo is never used. Test: "never trusts the total written on the photo" in `tests/unit/engine-read-bill.test.ts`.
- **Rule 9**: `packages/ai/src/client.ts:172` is the only model call. Tests in `tests/unit/ai-client.test.ts` cover the versioned prompt, the schema, a retry, no retry on a plain failure, the timeout, unavailable with no row, and the cost.
- **I8 roles**: owner and staff upload and review (`photos.ts:29`); the accountant is refused. The generated roles and tenancy tests include `photos` and `ai-calls`.
- **I9 golden path (c) on real data**: 3 taps plus the picker (`tests/e2e/photo.spec.ts`).

## Eval (npm run eval:read-bill -- --fake)

The run used real 0 and synthetic 30, with prompt read-bill/v1. The model is `fake-reader`: it answers the ground truth with doubtful and unreadable fields on purpose.

| Measure        | Result  |
| -------------- | ------- |
| Field accuracy | 99.0 %  |
| Line recall    | 100.0 % |
| Total match    | 100.0 % |
| Abstention     | 1.0 %   |
| Failures       | 0       |

These numbers check the harness and are not a model's score. The model's numbers come from the VM run on the operator's photos (see below).

**Cost per read from ai_calls**: the integration test prices the fake call (1,200 tokens in, 300 out) at the configured $2.5 and $10 per million tokens, which gives 6,000 micro-USD, read back from `ai_calls.cost_micros`. The real figure is the VM run's `ai_calls` with the real prices in `.env`.

## Tests

| What                                                                                                 | Where                                 | Count |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------- | ----- |
| Loose readers, the checks, totals never trusted, unreadable, no bill, matching                       | `tests/unit/engine-read-bill.test.ts` | 11    |
| The model client                                                                                     | `tests/unit/ai-client.test.ts`        | 7     |
| Normalisation: EXIF upright and dropped, ≤ 2000 px never enlarged, PNG to JPEG, not an image refused | `tests/unit/worker-normalise.test.ts` | 4     |
| The job end to end with the fake model (see the list below)                                          | `tests/integration/photos.test.ts`    | 8     |
| The default series (the bug found by path (c))                                                       | `tests/integration/bills.test.ts`     | +1    |
| Playwright (see the list below)                                                                      | `tests/e2e/photo.spec.ts`             | 3     |

The integration file covers:

- A ready reading with its match and a costed `ai_calls` row.
- Unreadable and no bill.
- Malformed and unavailable answers.
- Files that are not photos.
- The accountant refused.
- Corrections, the commit and finality.
- I6.

The Playwright file covers:

- Golden path (c) on real data.
- Staff review with confidences shown, a doubtful rate corrected and kept as a correction row.
- An unreadable date lit, a blurred photo, and a photo of no bill.

Totals:

| Suite      | Passed                            |
| ---------- | --------------------------------- |
| vitest     | 648                               |
| Playwright | 136 (Stage 1 baselines unchanged) |

## Found and fixed on the way

- A draft with no series named went into the oldest bill series (AMC-) instead of the business's default. `seriesFor` now takes `businesses.default_series_id` first.
- A dev server killed mid-compile left Turbopack's cache unusable, so pages never hydrated. Playwright now starts its server on a clean `.next/dev`.

## For the operator

1. On the VM, run `git pull`, then `deploy/vm/up.sh`. Migration `0006` applies, and the worker gets sharp and `@ekbill/ai`.
2. In `.env`, set:
   - `OPENAI_API_KEY` and `OPENAI_VISION_MODEL`, the exact ID from the models list.
   - `OPENAI_VISION_PRICE_IN` and `OPENAI_VISION_PRICE_OUT`, in USD per million tokens, for that model.
3. Put the real photos with their ground truth in `tests/fixtures/bills/real/`, as `<name>.jpg` plus `<name>.json`. The JSON is `{ "name", "customer", "date": "YYYY-MM-DD", "lines": [{ "what", "qty", "rate", "amount" }], "total" }`.
4. Run `npm run eval:read-bill` without `--fake` and paste the summary into this report. It states how many real and synthetic photos were used.
5. Run `npm run review:stage -- 7`, then push the tags: `git tag stage-7-start 67717f7 && git push origin --tags`.
