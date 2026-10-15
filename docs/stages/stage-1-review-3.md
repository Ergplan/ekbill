# Stage 1 — independent review

- Reviewed commit: fe0e170
- Base: stage-1-start
- Head: HEAD
- Model: gpt-6.1-sol
- At: 2026-10-15T17:18:14.593Z
- Verdict: defects

---

## (a) Invariants I1–I10

- **I1 — Not exercised by authoritative tables.** No business-table schema or repository is added. Fixture customer and bill lookups are business-filtered; this does not establish RLS or `TenantScope` enforcement (`apps/web/screens/common.ts:4–16`).
- **I2 — Not exercised by authoritative issuance.** “Bill banao” writes a browser draft, not an issued database document. Fixture paper is assembled from current fixture business/customer data, so snapshot-based rendering remains unimplemented, not demonstrated (`apps/web/screens/bill/Screen.tsx:112–120`; `apps/web/screens/paper.ts:13–51`).
- **I3 — Not exercised by an allocator.** Proposed numbers come from fixture counters; there is no transactional allocation or concurrency protection to assess (`apps/web/screens/bill/data.ts:58–60`).
- **I4 — Violated by a second tax calculation.** The fixture generator computes GST independently using `Math.round()` on the full rate, whereas the engine independently rounds each intra-state head. Failing input: a generated intra-state line with quantity 1, price 3 paise and rate 18% gets 1 paise GST from the generator but 0 from the engine. Fixture totals used by lists/payments can therefore disagree with paper/workings (`scripts/fixtures-v2.mjs:183–204`; `packages/engine/src/tax.ts:68–83`; `apps/web/screens/common.ts:43–45`). The actual form, paper and workings do call the engine, and their current-fixture agreement has a test (`apps/web/screens/bill/compute.ts:71–75`; `apps/web/screens/paper.ts:14–26`; `apps/web/screens/gst/data.ts:30–42`; `tests/unit/bill-compute.test.ts:114–140`).
- **I5 — Violated.**
  - Three entries have no verification date or verifier, and the checker requires a date only for entries marked verified. I5 explicitly requires `rules:check` to reject a missing verification date (`packages/engine/rules/gst/rates.json:13–15,24–26,35–37`; `scripts/rules-check.mjs:44–52`).
  - The place-of-supply decision remains code. The dated JSON entry is selected, but its `rule` value is never interpreted; changing that value cannot change the outcome. Failing input: supply a custom pack whose place-of-supply entry changes the same-state decision—the engine still uses its hard-coded comparison (`packages/engine/rules/gst/rates.json:29–34`; `packages/engine/src/rules.ts:74–79`).
- **I6 — Upheld for the added prototype execution paths.** Photo interpretation is fixture data; promotion to the browser-issued draft requires the human Make button. No model execution or authoritative model write is introduced (`apps/web/screens/photo/data.ts:22–28`; `apps/web/screens/photo/Screen.tsx:89–106,254`).
- **I7 — Request attribution implemented; authoritative auditing not exercised.** The proxy forwards, returns and logs a request ID; both handlers also log attributed requests. Browser drafts and React payment state are not authoritative-table writes (`apps/web/proxy.ts:9–27`; `apps/web/app/api/health/route.ts:37–53`; `apps/web/app/dev/switch/[person]/route.ts:31–44`; `apps/web/screens/draft.ts:47–57`; `apps/web/screens/bill-view/Screen.tsx:63–68`).
- **I8 — Repository enforcement not exercised.** No repository write surface exists. Prototype restrictions include owner-only team access, accountant bill-making redirects and a role-gated payment sheet; these are UI/prototype behavior, not repository enforcement (`apps/web/app/aap/team/page.tsx:9–12`; `apps/web/app/bills/new/page.tsx:12–13`; `apps/web/screens/bill-view/Screen.tsx:47–49`).
- **I9 — Implemented for the tested paths/states, not exhaustively established.** Path (a) counts taps, applies throttling in production and measures through a stubbed Web Share call with a 20-second assertion. Other paths count taps. Primary-count assertions cover default and enumerated URL states, not every interactive state (`tests/e2e/golden-path.spec.ts:41–92,95–158`; `tests/e2e/screens.spec.ts:52–54,73–82`). Path (d) merely clicks WhatsApp without asserting a share handoff (`tests/e2e/golden-path.spec.ts:153–157`).
- **I10 — Production component structure and baseline tests exist; approval remains pending.** Screens use `packages/ui`; both-theme snapshots are requested. However, the tab bar is masked in product-screen snapshots, so those baselines cannot protect its approved visual design. Binary baseline contents and operator approval cannot be certified from these inputs (`apps/web/screens/bill/Screen.tsx:8–26`; `tests/e2e/screens.spec.ts:29–68,73–82`; `docs/stages/stage-1-report.md:3`).

## (b) Tests for added server actions and route handlers

- **`GET /dev/switch/[person]` → `tests/integration/switch.test.ts`.** Tests cover redirects, cookie attributes, invalid destinations, unknown people and request-ID echo (`apps/web/app/dev/switch/[person]/route.ts:31–45`; `tests/integration/switch.test.ts:8–41`).
- **Modified `GET /api/health` → `tests/integration/health.test.ts`.** Tests invoke the modified handler and cover successful health/schema and backup reporting (`apps/web/app/api/health/route.ts:37–53`; `tests/integration/health.test.ts:16–25,34–41`).
- **No server action is added.** Bill creation remains a client callback writing browser storage (`apps/web/screens/bill/Screen.tsx:104–120`; `apps/web/screens/draft.ts:47–57`).

## (c) Audit coverage of authoritative writes

- **No authoritative-table write is added.** Bill creation, photo creation and customer creation write browser drafts; recording payments changes local React state. Consequently, no unaudited authoritative-table write is demonstrated, but audit-trigger enforcement is not established (`apps/web/screens/bill/Screen.tsx:119`; `apps/web/screens/photo/Screen.tsx:100–105`; `apps/web/screens/customer-new/Screen.tsx:36`; `apps/web/screens/bill-view/Screen.tsx:63–68`; `apps/web/screens/draft.ts:47–57`).

## (d) Generated-document reproducibility

- **`docs/SCREEN-FLOW.md`: no concrete regeneration mismatch found.** The generator reads the registry/manifests and golden-path arrays; the supplied document agrees with their screen order and path counts. Counts are array lengths, not imported runtime measurements (`scripts/flow-dump.ts:3–6`; `scripts/flow-map.mjs:20–32,45–99`; `apps/web/screens/golden-paths.ts:18–71`; `docs/SCREEN-FLOW.md:441–491`).
- **`docs/FIELD-TRACE.md`: cannot certify.** Neither the document nor its generator/schema sources are supplied. The watcher invokes its checker, but that is not a regeneration result (`scripts/watch.mjs:79`; `docs/stages/stage-1-report.md:115`).
- **`tokens.ts` / `themes.css`: additions correspond to `tokens.json`; exact regeneration cannot be certified.** The identified generator, `build.py`, is not supplied, and the visible token-check change is a lint pattern rather than regeneration comparison (`design/tokens/tokens.json:2,84–115`; `design/tokens/tokens.ts:77–108`; `design/tokens/themes.css:58–73`; `scripts/tokens-check.mjs:16–20`).

## (e) Both themes and token-only rendering

- **Both-theme screenshot coverage exists** for registry screens, enumerated states and `/flow`; execution and pixel results cannot independently be verified here (`tests/e2e/screens.spec.ts:29–93`).
- **Literal font weights remain in newly added UI styles**, including `font-weight: 500` on choice labels, setting labels and OTP boxes. Thus typography is not entirely token-derived (`packages/ui/src/ui.css:1604–1608,1674–1676,1702–1711`).
- **Literal artwork is explicitly excepted:** `Comic Sans MS, cursive`, `#2b2b2b`, `#f7f1e3` and `#cfc3a6` appear in the displayed handwritten-bill SVG; its exception is documented (`apps/web/public/flow-fixtures/kaccha-bill.svg:1–3`; `tokens-allow.txt:4`; `apps/web/screens/photo/Screen.tsx:62,190`).
- **Literal inset-shadow geometry exists**, such as `inset 0 0 0 1px` and `inset 0 0 0 2px`, with token colours. These fit the explicit token-coloured-ring exception rather than being wholly token-defined shadows (`packages/ui/src/ui.css:1543–1545,1582–1587,1619–1624`).

## (f) Stage-report claims unsupported or contradicted by the diff

- **“Every screen is `apps/web/screens/<id>/{manifest.ts,data.ts,Screen.tsx}` … through one typed boundary per screen.”** Bill-done still selects and shapes fixture data in its route, with no bill-done loader. Customer-new also performs fixture lookup/shaping in its route (`docs/stages/stage-1-report.md:14`; `apps/web/app/bills/new/done/page.tsx:18–36`; `apps/web/app/customers/new/page.tsx:13–18`).
- **“cancel-and-redo starts the new bill from the cancelled one's lines.”** The actual cancellation action only navigates with the current bill number. The loader accepts that number only if the fixture bill is already cancelled. Failing input: cancel-and-redo due bill `INV-042`; the replacement starts blank because the fixture remains due (`docs/stages/stage-1-report.md:119`; `apps/web/screens/bill-view/Screen.tsx:70–72`; `apps/web/screens/bill/data.ts:77,104–106`).
- **“phone/GSTIN/state from the draft” reach the bill.** Name and GSTIN/state are consumed, but phone is not used in constructing the issued customer; it is discarded from that handoff (`docs/stages/stage-1-report.md:104`; `apps/web/screens/bill/Screen.tsx:53–69,112–119`).
- **“GST rate chips 0/5/12/18/28/40 until Stage 3…”** The current-date pack already offers only 0/5/18/40, and the form reads it (`docs/stages/stage-1-report.md:87`; `packages/engine/rules/gst/rates.json:18–22`; `apps/web/screens/bill/compute.ts:79–81`; `apps/web/screens/bill/Screen.tsx:86,304`).
- **“The ‘Tour’ button walks them” on every screen.** `/flow` has a theme switch and view controls but no Tour button or `GuideHighlight` (`docs/stages/stage-1-report.md:31`; `apps/web/screens/flow/Screen.tsx:48–82,221–225`).
- **“every test green”, “106 passed”, “2.5 s” and the live VM claim** are execution/deployment claims that cannot be established from this diff alone. The corresponding tests and deployment code exist, but no independently inspectable run output is supplied (`docs/stages/stage-1-report.md:3,10,45,61`; `tests/e2e/golden-path.spec.ts:58–92`; `deploy/vm/up.sh:63–78`).

## Additional code defects

1. **WhatsApp fallback reports cancellation after successfully opening the link.**  
   Failing input: browser without `navigator.share`; click WhatsApp. `window.open(..., 'noopener')` returns `null` with opener isolation, so the helper returns `cancelled` even when the tab opens. The caller consequently never updates its handoff state (`apps/web/screens/share.ts:22–24`; `apps/web/screens/bill-done/Screen.tsx:114–116`).

2. **A photo date before the rule pack crashes rendering instead of producing validation feedback.**  
   Failing input: edit photo-review date to `2016-01-01`. `compute()` catches the first missing-rule exception, then calls the engine again with the same date outside any protective catch; the second exception escapes rendering (`apps/web/screens/photo/Screen.tsx:88,206–211`; `apps/web/screens/bill/compute.ts:71–75`; `packages/engine/src/rules.ts:74–75`).

3. **Payment date is accepted and then discarded.**  
   Failing input: record a partial payment dated `2026-10-01`. The date input updates state, but `record()` stores only amount and method, leaving no representation of the selected date even in prototype memory (`apps/web/screens/bill-view/Screen.tsx:52–55,63–68,189–190`).

4. **GST period selection changes the control but not the displayed period or workings.**  
   Failing input: open `/gst` and choose “Mahina”. Only local `mode` changes; the title, totals and rows continue reading the unchanged quarter data (`apps/web/screens/gst/Screen.tsx:18,27–38,49–77`; `apps/web/screens/gst/data.ts:25–27,67–74`).

5. **Rule provenance records a nonexistent entry ID.**  
   Failing input: any successful `computeTax()` call. `rulesApplied` contains the literal `"document-kinds"` rather than the selected entry’s `"document-kinds-2017"` ID. A custom dated document-kind entry is likewise not recorded correctly (`packages/engine/src/tax.ts:116–117`; `packages/engine/src/rules.ts:101–106`; `packages/engine/rules/gst/rates.json:40–41`).

6. **Manifest-completeness tests do not check the completeness they claim.**  
   Failing input: add a screen folder/route without a manifest, or declare a hidden ID absent from `guides`. The folder test filters out manifest-less folders before comparing, and the “every tour step and hidden id” test never inspects hidden IDs (`tests/unit/manifests.test.ts:13–17,31–35`).

7. **Visible owner-facing copy bypasses the dictionary.**  
   Failing input: render Home using the English register. “Namaste,”, “Chalo,”, “bill banate hain” and “8 hafte” remain literal Hinglish. The bill’s “IGST lagega” explanatory text is also literal rather than a copy key (`apps/web/screens/home/Screen.tsx:47,77,90–91,121`; `apps/web/screens/bill/Screen.tsx:330`).

VERDICT: defects found
