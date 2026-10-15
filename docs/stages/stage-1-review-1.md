# Stage 1 — independent review

- Reviewed commit: 225660e
- Base: stage-1-start
- Model: gpt-6.1-sol
- At: 2026-10-15T14:34:55.953Z
- Verdict: defects

---

## (a) Invariants I1–I10

- **I1 — No new database surface to assess.** The diff introduces fixture reads, not tables or repositories; customer and bill lookups filter by business (`apps/web/screens/common.ts:4–16`). This does not establish database tenancy or RLS, which remain outside this stage.
- **I2 — Authoritative issuing is not implemented.** “Issue” writes a browser draft and navigates; it does not update a document table (`apps/web/screens/bill/Screen.tsx:69–82`). Fixture documents are rendered using live fixture business/customer data, so this is not evidence of snapshot-based production rendering (`apps/web/screens/paper.ts:24–44`).
- **I3 — No authoritative allocation to assess.** The prototype derives a proposed number from a fixture series; no transactional allocator or concurrency test is added (`apps/web/screens/bill/data.ts:49–51`).
- **I4 — Violated.** Tax is calculated outside the engine in `apps/web/screens/bill/compute.ts:45–67`. `taxLines()` derives SGST from a rounded CGST sibling rather than computing each head separately (`apps/web/screens/bill/compute.ts:80–83`), contrary to the rounding contract added in `packages/engine/src/money.ts:25–32`.
- **I5 — Violated.** Selectable tax rates and tax/document decisions are hard-coded rather than selected from dated rule-pack data (`apps/web/screens/bill/Screen.tsx:34`, `apps/web/screens/item/Screen.tsx:13`, `apps/web/screens/bill/compute.ts:46–55`, `apps/web/screens/bill-done/Screen.tsx:62–69`). Deferring rule verification does not uphold the invariant.
- **I6 — Upheld for the prototype’s added execution paths.** No model call is added; photo interpretation comes from fixtures, and creating the browser-issued draft requires the Make button (`apps/web/app/bills/photo/page.tsx:19–21`, `apps/web/screens/photo/Screen.tsx:63–80,199`).
- **I7 — No authoritative writes to audit.** Added persistence is sessionStorage, not authoritative tables (`apps/web/screens/draft.ts:44–51`).
- **I8 — Repository enforcement is not implemented; the UI restriction also has a bypass.** An accountant can open `/bills/INV-042?as=accountant&paid=1`: the payment sheet initializes from `openPaid` without checking `canMoney`, and its choices call `record()` (`apps/web/screens/bill-view/Screen.tsx:47–63,153–166`). The page forwards `paid=1` without a role check (`apps/web/app/bills/[number]/page.tsx:17–22`). This only changes prototype state, but contradicts the read-only role view.
- **I9 — Incompletely upheld.** Tests count the four prototype paths, but path (a) has no Slow 3G/4× CPU setup, elapsed-time assertion, or share-sheet call assertion (`tests/e2e/golden-path.spec.ts:27–40`). The WhatsApp button merely changes local state (`apps/web/screens/bill-done/Screen.tsx:94–96`). Primary-button assertions count only visible elements, not all instances in the DOM (`tests/e2e/screens.spec.ts:52–54,77`).
- **I10 — Not established by this diff.** Screens use production UI components (`apps/web/screens/bill/Screen.tsx:7–25`), but the regression screenshots are referenced and copied by tests rather than supplied in the diff (`tests/e2e/screens.spec.ts:58–68`). The review screen is also excluded from `SCREENS`, hence from the generated screen-baseline loop (`apps/web/screens/registry.ts:29–55`, `tests/e2e/screens.spec.ts:29–31`). Token violations are listed in (e).

## (b) Server actions and route-handler tests

- **No server action is added.** Bill creation remains a client handler writing sessionStorage (`apps/web/screens/bill/Screen.tsx:69–82`).
- **Added handler:** `GET /dev/switch/[person]` (`apps/web/app/dev/switch/[person]/route.ts:13–22`).
  - **Test pair:** the new-owner golden-path test requests `/dev/switch/new` and checks its redirect (`tests/e2e/golden-path.spec.ts:71–74`).
  - **Missing:** the required integration test against real Postgres; only this browser happy path is supplied. Invalid-person handling and the cookie attributes are not asserted by that test (`apps/web/app/dev/switch/[person]/route.ts:17–20`, `tests/e2e/golden-path.spec.ts:71–74`).

## (c) Auditing authoritative writes

- **None are added.** Bill creation, photo creation and customer creation write browser drafts (`apps/web/screens/bill/Screen.tsx:80`, `apps/web/screens/photo/Screen.tsx:74–79`, `apps/web/screens/customer-new/Screen.tsx:36`). The shared writer persists only to sessionStorage (`apps/web/screens/draft.ts:44–51`). Payment recording changes React state only (`apps/web/screens/bill-view/Screen.tsx:60–64`).

## (d) Generated-document reproducibility

- **`docs/SCREEN-FLOW.md`: statically consistent with the supplied generator and manifest sources.** Registry order drives output, and tap counts are generated from array lengths—not runtime measurements (`scripts/flow-dump.ts:3–6`, `scripts/flow-map.mjs:20–32,86–99`). No concrete regeneration mismatch is demonstrated.
- **`docs/FIELD-TRACE.md`: not verifiable from the supplied diff.** Neither its contents nor its generator/source schemas are supplied; the diff only retains a watcher invocation (`scripts/watch.mjs:78`).
- **`tokens.ts` / `themes.css`: not verifiable from the supplied diff.** Their generator and token sources are not supplied or changed; importing the generated stylesheet does not prove reproducibility (`apps/web/app/layout.tsx:5–7`).
- No execution result establishing clean regeneration is included; adding checker commands alone is not such evidence (`scripts/watch.mjs:76–79`).

## (e) Both themes and tokens only

- **Both-theme coverage exists for registry screens and listed extra states**, but not `/flow`: it is absent from the registry loop (`tests/e2e/screens.spec.ts:29–31,73–84`, `apps/web/screens/registry.ts:29–55`).
- **Literal font and colours:** the photo asset uses `Comic Sans MS, cursive`, `#2b2b2b`, `#f7f1e3` and `#cfc3a6` (`apps/web/public/flow-fixtures/kaccha-bill.svg:1–3`). This is a fixture image, not theme UI styling, but it is an explicit non-token asset rendered on the photo screen (`apps/web/screens/photo/Screen.tsx:138`).
- **Literal type size:** `.eb-question .eb-display` sets `font-size: 30px`, rather than a type token (`packages/ui/src/ui.css:1837–1839`).
- **Literal shadow geometry:** new inset rings contain hard-coded geometry, although their colours are tokens (`packages/ui/src/ui.css:1544–1546,1583–1588`). These fit the stated checker’s token-coloured-ring exception, but are not wholly token-defined shadows.
- The root layout imports shared theme tokens, but that alone does not demonstrate that every touched screen renders correctly in both themes (`apps/web/app/layout.tsx:5–7`).

## (f) Unsupported stage-report claims

- **“Every screen is `apps/web/screens/<id>/{manifest.ts,data.ts,Screen.tsx}` … through one typed boundary per screen (`data.ts`)”** (`docs/stages/stage-1-report.md:14`). Several pages read and shape fixtures directly instead: Aap, team, items and photo (`apps/web/app/aap/page.tsx:11–19`, `apps/web/app/aap/team/page.tsx:11–13`, `apps/web/app/items/page.tsx:10–13`, `apps/web/app/bills/photo/page.tsx:13–33`).
- **“Accountants cannot reach bill-making … (the routes redirect)”** (`docs/stages/stage-1-report.md:33`). The done route has no accountant guard and renders its WhatsApp control (`apps/web/app/bills/new/done/page.tsx:13–35`, `apps/web/screens/bill-done/Screen.tsx:93–97`). The payment-sheet bypass is documented in (a).
- **“Photo lo (picker)”** in the counted photo path (`docs/stages/stage-1-report.md:41`). The visible choice navigates directly to simulated reading; it does not open the file input (`apps/web/screens/photo/Screen.tsx:107–123`). The test verifies navigation, not a picker (`tests/e2e/golden-path.spec.ts:60–63`).
- **“Poocho and the contract helper … the mic and Aap reach them”** (`docs/stages/stage-1-report.md:88`). The mic only starts/stops the tour (`apps/web/screens/shell/AppShell.tsx:95–100`); Aap has neither destination (`apps/web/screens/aap/Screen.tsx:181–200`).
- **“Every screen in both themes”** in the visual-test table (`docs/stages/stage-1-report.md:54`) is too broad: `/flow` is not in the registry-based screenshot loop (`apps/web/screens/registry.ts:29–55`, `tests/e2e/screens.spec.ts:29–31`).
- **“behind the gate”** after running `deploy/vm/up.sh` (`docs/stages/stage-1-report.md:10`) contradicts the new default: the gate is off unless explicitly enabled (`deploy/vm/up.sh:32–46`).
- **“every test green” / “103 passed”** are execution claims that this diff cannot establish (`docs/stages/stage-1-report.md:3,60`). Likewise, the report explicitly says VM deployment was not performed, so it does not establish the stage’s live-VM completion condition (`docs/stages/stage-1-report.md:10`).

## Additional code defects

1. **New-customer details disappear at the next screen.**  
   Failing input: add customer “Rathi Agro” with phone/GSTIN, then continue to its bill. The form writes `new-customer` and passes `name` in the URL (`apps/web/screens/customer-new/Screen.tsx:36–37`), but the receiving page reads neither (`apps/web/app/bills/new/page.tsx:14–17`); the loader initializes `customerName` to empty (`apps/web/screens/bill/data.ts:90–93`).

2. **Welcome-to-setup does not select the new-owner persona.**  
   Failing input: fresh browser, open `/welcome`, complete login/setup. OTP completion only navigates to setup (`apps/web/screens/login/Screen.tsx:35–37`); review navigates to `/` (`apps/web/screens/setup/Screen.tsx:466–468`), whose viewer defaults to Sharma (`apps/web/screens/viewer.ts:39–42`). The golden-path test conceals this prerequisite by first calling `/dev/switch/new` (`tests/e2e/golden-path.spec.ts:71–72`).

3. **Derived GSTIN fields are not saved.**  
   Failing input: valid GSTIN during setup, then inspect review PAN. `advance()` derives normalized GSTIN, PAN and city into `next`, but only persists `override`; normal GSTIN advancement supplies no override (`apps/web/screens/setup/Screen.tsx:123–145,248–250`).

4. **New-owner GST/UPI setup is ignored when making the first bill.**  
   Failing input: new persona completes regular-GST setup and enters UPI. The loader still defaults a business-less viewer to unregistered with null GSTIN/UPI (`apps/web/screens/bill/data.ts:47–49,72–78`); the component reads only the setup name (`apps/web/screens/bill/Screen.tsx:44–45,78–80`).

5. **Drafts leak across switched businesses and roles.**  
   Failing input: make a Sharma bill, switch to Gupta in the same tab, open `/bills/new/done`. The issued key is global and overrides the new viewer’s fallback (`apps/web/screens/bill-done/Screen.tsx:53,60–61`); storage keys have no tenant/person namespace (`apps/web/screens/draft.ts:27–29,44–47`).

6. **Removing a line changes the remaining line’s GST rate.**  
   Failing input: two per-line-taxed lines at 5% and 18%; remove the first. Removal updates `lines` but not `gst.perLine` (`apps/web/screens/bill/Screen.tsx:163–174`), while computation selects rates by array index (`apps/web/screens/bill/compute.ts:47–55`).

7. **Invoice total can include an invisible line.**  
   Failing input: one named ₹100 line plus a blank-description ₹200 line. Computation includes both (`apps/web/screens/bill/compute.ts:47–67`), creation accepts any one valid named line (`apps/web/screens/bill/Screen.tsx:66–67`), but the done paper filters out blank descriptions while retaining the full total (`apps/web/screens/bill-done/Screen.tsx:73–78`).

8. **Successive partial payments replace rather than accumulate.**  
   Failing input: record ₹100, then another ₹100 on the same mounted due bill. `record()` replaces `recorded`, and due subtracts only that latest amount from the original bill due (`apps/web/screens/bill-view/Screen.tsx:52,57–63`).

9. **Dues payment links break under role preview.**  
   Failing input: `/dues?as=staff`, tap “Paise aa gaye”. The helper appends another `?`, producing `...?paid=1?as=staff` (`apps/web/screens/dues/Screen.tsx:15,49`); the destination therefore does not receive `paid === '1'` (`apps/web/app/bills/[number]/page.tsx:22`).

10. **Valid Indian numbers starting with 91 are rejected.**  
    Failing input: ten-digit phone `9123456789`. Normalization strips its initial `91` as though it were a country prefix, leaving eight digits (`apps/web/screens/login/Screen.tsx:40–42`).

11. **Direct reminders omit the overdue-day substitution.**  
    Failing input: open a reminder and choose “Seedha”. The template requires `{days}`, but the interpolation parameters omit it (`apps/web/screens/remind/data.ts:25–36`, `design/copy/en.json:110`).

12. **Existing interstate invoice renders CGST/SGST.**  
    Failing input: `/bills/INV-037`, whose customer Bansal is in state 23 while Sharma is in state 27. `paperOfBill()` defaults every taxed fixture bill to CGST/SGST without examining customer state (`apps/web/screens/paper.ts:14–21`); its caller supplies no override (`apps/web/screens/bill-view/data.ts:30`).

13. **Large but individually valid numeric inputs crash bill rendering.**  
    Failing input: quantity `1000000`, rate `1000000`. Parsing is caught, but multiplication is not (`apps/web/screens/bill/compute.ts:48–50`); the resulting unsafe product throws through `lineGross()`/`divRound()` (`packages/engine/src/money.ts:64–66,101–104`).

14. **Corrected photo date is discarded.**  
    Failing input: edit the review date to `2026-10-14`, then make the bill. The field updates state (`apps/web/screens/photo/Screen.tsx:153–159`), but creation always sets `date: today` (`apps/web/screens/photo/Screen.tsx:64–72`).

15. **Storage-denied environments cannot edit drafts.**  
    Failing input: browser denies sessionStorage writes; type a bill line. `writeDraft()` catches the exception but retains no in-memory value (`apps/web/screens/draft.ts:44–51`); `useDraft()` continues reading storage and returns its unchanged initial value (`apps/web/screens/draft.ts:58–76`). The comment claiming a React-state fallback is unsupported.

VERDICT: defects found
