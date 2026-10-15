# Stage 1 — independent review

- Reviewed commit: 11f3bcb
- Base: stage-1-start
- Head: HEAD
- Model: gpt-6.1-sol
- At: 2026-10-15T15:21:45.901Z
- Verdict: defects

---

## (a) Invariants I1–I10

- **I1 — Not exercised by authoritative tables in this diff.** Fixture customer and bill lookups filter by business; no tables, RLS policies or repositories are added. This is not evidence that database tenancy is implemented (`apps/web/screens/common.ts:4–16`; `docs/stages/stage-1-report.md:113`).
- **I2 — No authoritative issuance added.** “Bill banao” writes browser storage, not an issued document. Fixture papers use current fixture business/customer records; they are not issued snapshots. This remains prototype-only (`apps/web/screens/bill/Screen.tsx:97–108`; `apps/web/screens/paper.ts:13–38`).
- **I3 — No authoritative allocation added.** Proposed numbers come from unchanged fixture series counters; there is no transaction or concurrent allocator to assess (`apps/web/screens/bill/data.ts:49–51`).
- **I4 — Violated.** GST workings read independently hard-coded totals instead of `computeTax()` output (`apps/web/screens/gst/data.ts:18–37`; `scripts/fixtures-v2.mjs:481–493`). Also, intra-state tax truncates half-basis-point rates: input `gstBp=101`, taxable value `100000` paise produces `500` paise per head instead of `505` (`packages/engine/src/tax.ts:59–69`). The advertised cross-consumer agreement test only calls the engine; it does not compare preview, paper and workings (`tests/unit/one-engine.test.ts:12–88`).
- **I5 — Violated.** Item rates remain hard-coded (`apps/web/screens/item/Screen.tsx:14,94–100`). `supplyKind()` neither accepts a document date nor consults the place-of-supply rule entry; document kinds are also selected in code (`packages/engine/src/rules.ts:44–48`; `packages/engine/src/tax.ts:89–95`). The place-of-supply entry’s source is not an official URL, and the checker permits absent verification dates on unverified entries (`packages/engine/rules/gst/rates.json:29–37`; `scripts/rules-check.mjs:44–52`).
- **I6 — Upheld for the added prototype paths.** Photo output is fixture data, not model output; creating its browser draft requires the human Make button. No model execution or authoritative model write is added (`apps/web/screens/photo/data.ts:22–28`; `apps/web/screens/photo/Screen.tsx:65–82,202`).
- **I7 — Partially upheld.** Both route handlers log request IDs, and no authoritative-table writes are added (`apps/web/app/api/health/route.ts:37–52`; `apps/web/app/dev/switch/[person]/route.ts:15–28`). However, product page requests have no corresponding request-ID/logging path in the supplied implementation; for example, Home resolves its viewer and renders without either (`apps/web/app/page.tsx:7–9`; `apps/web/screens/viewer.ts:36–42`).
- **I8 — No repository enforcement surface added; prototype read-only behavior is violated.** An accountant visiting `/items/amc?as=accountant` can change GST through `FilterChips`, unlike the disabled text inputs (`apps/web/screens/item/Screen.tsx:35,94–100`). No authoritative write results.
- **I9 — Tap budgets are tested, but the required endpoint is not measured.** Path (a) times a button changing local state, not a share-sheet call; the test asserts the changed label. It also preloads every destination before enabling throttling (`apps/web/screens/bill-done/Screen.tsx:100–103`; `tests/e2e/golden-path.spec.ts:47–67`). Primary-count assertions cover default and listed URL states, not every interactive state (`tests/e2e/screens.spec.ts:52–54,73–82`).
- **I10 — Production components and both-theme baseline tests are present; approval is pending.** Screens use `packages/ui`, and the suite requests visual snapshots in both themes. Binary baselines and operator approval cannot be certified from this diff (`apps/web/screens/bill/Screen.tsx:8–26`; `tests/e2e/screens.spec.ts:29–68`; `docs/stages/stage-1-report.md:3`).

## (b) Server actions and route-handler tests

- **`GET /dev/switch/[person]` → `tests/integration/switch.test.ts`.** Tests cover cookie attributes, redirects, unknown people and request-ID echo (`apps/web/app/dev/switch/[person]/route.ts:15–29`; `tests/integration/switch.test.ts:8–38`).
- **Modified `GET /api/health` → `tests/integration/health.test.ts`.** Existing tests now pass a `Request` and cover health/schema and backup reporting (`apps/web/app/api/health/route.ts:37–52`; `tests/integration/health.test.ts:16–25,34–41`).
- **No server action is added.** Bill creation uses a client-side browser-draft writer (`apps/web/screens/bill/Screen.tsx:97–108`; `apps/web/screens/draft.ts:46–56`).

## (c) Auditing authoritative writes

- **No authoritative-table write is added.** Bill, photo and new-customer creation write browser drafts; payments update React state. Consequently, no missing authoritative-write audit trigger is demonstrated (`apps/web/screens/bill/Screen.tsx:106`; `apps/web/screens/photo/Screen.tsx:76–81`; `apps/web/screens/customer-new/Screen.tsx:36`; `apps/web/screens/bill-view/Screen.tsx:63–68`; `apps/web/screens/draft.ts:46–56`).

## (d) Generated-document reproducibility

- **`docs/SCREEN-FLOW.md`: no concrete regeneration mismatch found.** The generator reads the registry/manifests and renders the supplied sections and path-array counts (`scripts/flow-dump.ts:3–6`; `scripts/flow-map.mjs:20–32,45–99`; `docs/SCREEN-FLOW.md:5–492`).
- **`tokens.ts` / `themes.css`: added values correspond to the token source.** Exact regeneration cannot be certified because `build.py` is not supplied; the source identifies it as the generator (`design/tokens/tokens.json:2,84–113`; `design/tokens/tokens.ts:77–106`; `design/tokens/themes.css:58–71`).
- **`docs/FIELD-TRACE.md`: not certifiable from these inputs.** Neither that document nor its generator/schema sources are supplied. The visible watcher invocation is not a regeneration result (`scripts/watch.mjs:78`; `docs/stages/stage-1-report.md:115`).

## (e) Both themes and tokens only

- **Both-theme screenshot coverage is implemented for registry screens, listed extra states and `/flow`; actual rendering results are not independently available here** (`tests/e2e/screens.spec.ts:29–93`).
- **Explicitly excepted literal artwork:** the displayed kaccha-bill SVG contains `Comic Sans MS, cursive`, `#2b2b2b`, `#f7f1e3` and `#cfc3a6`. Its exception is documented (`apps/web/public/flow-fixtures/kaccha-bill.svg:1–3`; `apps/web/screens/photo/Screen.tsx:135,142`; `tokens-allow.txt:4`).
- **Inset shadows contain literal geometry**, including `inset 0 0 0 1px`, although their colours are tokens. These fall within CLAUDE.md’s explicit token-coloured-ring exception rather than being wholly token-defined shadows (`packages/ui/src/ui.css:1543–1545,1582–1587`).

## (f) Unsupported or contradicted stage-report claims

- **“Every screen is `apps/web/screens/<id>/{manifest.ts,data.ts,Screen.tsx}` … through one typed boundary per screen.”** Credit-note, import, ask and help routes still shape or pass fixtures directly, without their own typed loader boundary (`docs/stages/stage-1-report.md:14`; `apps/web/app/bills/[number]/credit-note/page.tsx:21–31`; `apps/web/app/customers/import/page.tsx:16`; `apps/web/app/poocho/page.tsx:14`; `apps/web/app/help/page.tsx:12`).
- **“the selectable rates and the place-of-supply rule … selected by the bill’s date … the item screen read[s] it.”** Item rates are a constant, while `supplyKind()` does not read the pack or accept a date (`docs/stages/stage-1-report.md:98`; `apps/web/screens/item/Screen.tsx:14,99`; `packages/engine/src/rules.ts:45–48`).
- **“phone/GSTIN/state from the draft” reach the bill.** The handoff reads name and derived state, but issuance passes `data.customer`, which remains null for a new customer. The entered GSTIN consequently does not reach the paper (`docs/stages/stage-1-report.md:104`; `apps/web/screens/bill/Screen.tsx:53–66,106`; `apps/web/screens/bill-done/Screen.tsx:74`).
- **“the mic and Aap reach them.”** Aap links to Poocho/help, but the mic only starts or stops the current tour (`docs/stages/stage-1-report.md:88`; `apps/web/screens/aap/Screen.tsx:192–194`; `apps/web/screens/shell/AppShell.tsx:100`).
- **“the e2e suite checks every declared id is in the DOM.”** The test explicitly exempts optional IDs and does not perform that completeness check for extra states (`docs/stages/stage-1-report.md:31`; `tests/e2e/screens.spec.ts:33–38,73–82,123–135`).
- **“Bill draft arithmetic … Count 5.”** The named test file contains seven tests (`docs/stages/stage-1-report.md:53`; `tests/unit/bill-compute.test.ts:9–103`).
- **“every test green”, “106 passed”, live deployment and “2.5 s”** are execution claims, not independently established by the supplied diff. Moreover, the timed code establishes only the simulated WhatsApp-label transition, not handoff (`docs/stages/stage-1-report.md:3,10,45,61`; `tests/e2e/golden-path.spec.ts:65–76`).

## Additional code defects

1. **Sheet typing repeatedly loses focus.** `Sheet` refocuses its first button whenever `onClose` changes. Callers pass a new inline callback on every render. Failing input: open partial payment and type a multi-character amount; the first change rerenders the parent and focuses the close button (`packages/ui/src/flow.tsx:29–37`; `apps/web/screens/bill-view/Screen.tsx:158–162,178–185`).

2. **A new regular-GST owner’s first bill starts with GST off.** Initial GST state comes from the business-less viewer’s unregistered fallback; restoring a regular business from setup does not update that draft choice. Failing input: complete regular-GST setup, then create the first bill; no tax is initially charged (`apps/web/screens/bill/data.ts:48,96`; `apps/web/screens/bill/Screen.tsx:47–51,69–72`).

3. **Different newly added customers share one bill-draft key.** The key uses the null fixture customer plus `new-customer` mode, not the entered customer’s identity/name. Failing input: start a bill for Acme, then add Beta in the same tab; Beta’s form retrieves Acme’s stored draft (`apps/web/screens/bill/Screen.tsx:69–72`; `apps/web/screens/customer-new/Screen.tsx:36–37`).

4. **Cancel-and-redo clears the wrong draft.** It deletes key `bill`, while actual bill drafts use person/number/customer-specific keys. The `redo` parameter is not consumed. Failing input: retain a draft for Mehta, then cancel-and-redo an existing Mehta bill; the retained draft reappears instead of a fresh one (`apps/web/screens/bill-view/Screen.tsx:70–73`; `apps/web/screens/bill/Screen.tsx:69–72`; `apps/web/app/bills/new/page.tsx:14–18`).

5. **GST-off invoices have the wrong document title.** Failing input: regular registration with `gstOn=false`; the engine returns `tax-invoice` despite its input contract promising a plain invoice (`packages/engine/src/tax.ts:22–23,89–95`).

6. **UTGST is never produced.** Failing input: an intra-state supply within Chandigarh (`04`). Reference data identifies UTGST, but the tax input cannot express that distinction and the engine always emits SGST (`packages/engine/src/state-codes.ts:33`; `packages/engine/src/tax.ts:19–25,68–69,85`).

7. **`/flow` thumbnails do not follow an in-page theme change.** Thumbnail selection uses the server-provided `p.theme`, with no subscription to theme changes. Failing input: open `/flow` in Narangi, then switch to Harmony; the controls change theme but thumbnails remain Narangi (`apps/web/app/flow/page.tsx:38–46`; `apps/web/screens/flow/Screen.tsx:58,85`).

8. **Import confirmation loses the selected count on reload.** Navigation writes `n` to the URL, but the page ignores it and the screen recomputes the default checkbox count. Failing input: deselect two new customers, add one, then reload the done URL; confirmation reports the default three (`apps/web/screens/import/Screen.tsx:27,34,99,108`; `apps/web/app/customers/import/page.tsx:14–16`).

9. **Internal-redirect validation permits a control-character open redirect.** Failing input: `/dev/switch/new?to=/%09/evil.example`. The decoded tab passes the regex; browser URL parsing removes tabs, turning the Location into `//evil.example` (`apps/web/app/dev/switch/[person]/route.ts:24–26`).

VERDICT: defects found
