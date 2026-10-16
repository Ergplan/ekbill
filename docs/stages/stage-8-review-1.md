# Stage 8 — independent review

- Reviewed commit: 30ed7e6
- Base: stage-8-start
- Head: stage-9-start
- Model: gpt-6.1-sol
- At: 2026-10-16T10:13:51.947Z
- Verdict: defects

---

### (a) Invariants I1–I10

- **I1 — Upheld in the new production reads.** GST queries take `TenantScope`, use `withTenant()`, and constrain `business_id`; `sellerNow()` also uses `withTenant()` (`packages/db/src/repos/gst.ts:57–84,146–154`; `packages/db/src/repos/documents.ts:757–760`). The generated tenancy test covers `workingsFor` (`tests/integration/tenancy.test.ts:108–114`). Existing RLS definitions are outside the supplied diff.
- **I2 — Violation: workings are not entirely snapshot-derived.** The Documents worksheet uses live relational customer names, GSTINs and totals selected alongside the snapshot (`packages/db/src/repos/gst.ts:70–73,92–95`; `packages/render/src/ca-pack.ts:155–167`). Export JSON also receives the current business GSTIN and state rather than snapshot identity (`packages/render/src/ca-pack.ts:29,179`). Changing that profile can change an export of already-issued documents.
- **I3 — No new allocation or issuance path.** The new repository only reads documents; pack generation renders them (`packages/db/src/repos/gst.ts:57–98`; `packages/render/src/ca-pack.ts:195–198`). Existing gaplessness and concurrency enforcement cannot be reverified from this diff.
- **I4 — Violation.** `rateOf()` reconstructs a tax rate using floating-point division and an approximate nearest-rate selection instead of retaining the engine’s calculated basis points (`packages/engine/src/gstr1-json.ts:250–258`). For a tiny credit-note line whose tax rounds to zero, it exports rate zero despite a nonzero original rate. Money aggregation and credit-note netting are also newly implemented outside the engine (`packages/db/src/repos/gst.ts:116–134`; `apps/web/screens/gst/data.ts:204–223`).
- **I5 — Not upheld.** All 23 entries remain unverified, exceeding the cap of three; the report explicitly acknowledges the failing check (`docs/stages/stage-8-report.md:14`). The exporter additionally embeds a selectable-rate list in code (`packages/engine/src/gstr1-json.ts:255`).
- **I6 — No new model-to-authoritative-data path.** The added production repository is read-only, and pack generation reads workings and renders PDFs; it makes no model call (`packages/db/src/repos/gst.ts:53–55,101–115`; `packages/render/src/ca-pack.ts:27–29,195–198`).
- **I7 — No direct production write to the listed authoritative tables is added.** The pack invokes the existing `printAndKeep()` path, whose implementation and audit behaviour are not supplied (`packages/render/src/ca-pack.ts:195–197`). Its transitive writes therefore cannot be certified here.
- **I8 — No new authoritative repository write requiring an `allowedRoles` declaration.** The GST repository declares itself read-only; pack access rejects staff server-side, independently of the hidden button (`packages/db/src/repos/gst.ts:53–55`; `apps/web/app/api/gst/pack/route.ts:18–20`; `apps/web/screens/gst/Screen.tsx:29,156–162`). Existing renderer write permissions are not supplied.
- **I9 — Not established.** The form adds blockers to the condition enabling issuance, but the supplied tests do not measure the golden-path tap or latency budgets (`apps/web/screens/bill/Screen.tsx:166–181`; `tests/e2e/gst.spec.ts:28–87`). One primary send CTA is present on the changed GST screen (`apps/web/screens/gst/Screen.tsx:156–162`).
- **I10 — Violation of the literal wiring-only restriction.** The stage changes production markup by adding period chips and a rule-explanation sheet, and adds a new drill screen, without supplied operator approval or new reference PNGs (`apps/web/screens/gst/Screen.tsx:74–84`; `apps/web/screens/bill/Screen.tsx:531–550`; `apps/web/screens/gst/Drill.tsx:11–54`). “Stage 1 baselines unchanged” does not establish approval of these additions (`docs/stages/stage-8-report.md:97`).

### (b) Server-action and route-handler tests

- **`GET /api/gst/pack` → E2E coverage exists**, for successful ZIP retrieval and staff rejection (`apps/web/app/api/gst/pack/route.ts:17–43`; `tests/e2e/gst.spec.ts:59–67`). **The required Postgres integration test of the handler is missing:** the integration suite calls `buildCaPack()` directly, bypassing authentication, query validation and HTTP response handling (`tests/integration/gst.test.ts:143–147`).
- **No server action is added.** The other new app entry is a page component, not a route handler (`apps/web/app/gst/docs/page.tsx:10–21`).

### (c) Authoritative-write auditing

- **No direct production write to `documents`, `payments`, `adjustments`, `customers`, `items`, `businesses`, `memberships` or `series` is added.** The production GST repository executes selects (`packages/db/src/repos/gst.ts:63–86,148–153`).
- **Transitive writes cannot be certified:** `printAndKeep()` may persist newly generated files, and the tenancy probe invokes the existing bill-creation helper; neither implementation nor its audit triggers is supplied (`packages/render/src/ca-pack.ts:195–197`; `packages/db/src/repos/gst.ts:163–167`).

### (d) Generated-document regeneration

- **`docs/FIELD-TRACE.md`: unverified.** Its generator and generated contents are not supplied; the report claims it was updated, but no corresponding diff appears (`docs/stages/stage-8-report.md:102`).
- **`docs/SCREEN-FLOW.md`: regeneration cannot be certified.** No changed manifest, generator or generated document is supplied. Independently, the new `/gst/docs` screen lacks a manifest addition in this diff, so regenerating existing manifests would not document it (`apps/web/app/gst/docs/page.tsx:9–21`; `apps/web/screens/gst/Drill.tsx:11–14`).
- **`tokens.ts` / `themes.css`: unverified, with no visible token-source change.** The added screen uses existing components and classes, but neither token sources nor outputs are supplied (`apps/web/screens/gst/Drill.tsx:4,14–51`).
- **`docs/GST-RULES.md`: the visible template matches the generated document’s structure and prose, but exact regeneration cannot be certified without the rule JSON sources.** A freshness check is added to the watcher (`scripts/rules-update.mjs:25–28,43–87`; `docs/GST-RULES.md:1–77`; `scripts/watch.mjs:81`).

### (e) Themes and tokens

- **No literal screen colour, radius, shadow or font is introduced in the shown changes.** Bill explanations, the GST screen additions and the drill screen use UI components and existing classes (`apps/web/screens/bill/Screen.tsx:531–550`; `apps/web/screens/gst/Screen.tsx:74–84,156–168`; `apps/web/screens/gst/Drill.tsx:14–51`).
- **Both-theme rendering is not demonstrated by the supplied evidence.** The new Playwright tests contain no explicit theme or viewport selection, and project configuration and screenshots are absent (`tests/e2e/gst.spec.ts:28–87`).
- **Dictionary violation:** new user-visible drill titles are literal English, including `"Credit notes"` and `"All"` (`apps/web/screens/gst/data.ts:224–230`).

### (f) Unsupported stage-report claims

- **“Every figure carries its documents.”** The drill implementation supports rate, B2B, B2C and credit-note filters only; it cannot select documents behind a particular HSN or GSTR-3B figure (`docs/stages/stage-8-report.md:19`; `apps/web/screens/gst/data.ts:167,190–201`).
- **“The checks shown are: … the credit-note date limit … reverse charge.”** The form always assesses `kind: 'bill'` with `flags: []` and supplies no original-invoice information, so those checks cannot be exercised through this assessment (`docs/stages/stage-8-report.md:39–50`; `apps/web/screens/bill/Screen.tsx:136–155`).
- **“Each check with a rule entry has ‘Kyun?’”** The assessment’s place-of-supply check is explicitly excluded from the items receiving `whyButton()`; this diff does not attach that action to the existing state strip (`docs/stages/stage-8-report.md:37`; `apps/web/screens/bill/Screen.tsx:160–174`).
- **“gstr1.json’s figures, with every key path and type found in the offline tool’s structure.”** Validation uses a locally transcribed fixture and inspects only the first element of each array, not every emitted element (`docs/stages/stage-8-report.md:84`; `tests/fixtures/gstn/gstr1-sample.json:2`; `tests/integration/gst.test.ts:132–138,179–186`).
- **“... and `docs/FIELD-TRACE.md`.”** The claimed document update is absent from the supplied diff (`docs/stages/stage-8-report.md:102`).

### Additional code defects

- **Silently truncated export and misleading drill range.** Input `from=2025-01&to=2026-02` returns only the first twelve months rather than rejecting the range. The drill response nevertheless retains the requested end month (`apps/web/app/api/gst/pack/route.ts:24–28`; `apps/web/screens/gst/data.ts:185–189,231–235`).
- **Noncontiguous month selections include unrequested documents.** Calling `workingsFor(scope, ['2026-04', '2026-06'])` selects May documents because the repository queries the continuous bounding range rather than membership in the supplied months (`packages/db/src/repos/gst.ts:59–61,81–82,101–103`).
- **Valid high-value B2C customers are blocked in the form.** An existing unregistered customer with a saved address and a bill of at least ₹50,000 is assessed with `address: null`, causing the recipient-details blocker even though the customer has an address (`apps/web/screens/bill/Screen.tsx:129–134,174–181`).
- **Per-line GST assessment uses the wrong index after filtering.** With a blank first row and an 18% second row, `.filter(...).map((l, i) => ...)` reads `perLine[0]` for the second row. Assessment can therefore disagree with preview and issue-time checks (`apps/web/screens/bill/Screen.tsx:140–147`).
- **Interstate credit notes export the wrong place of supply.** For a Maharashtra seller issuing a credit note for a Madhya Pradesh supply, registered notes get `pos: '27'`; unregistered notes are netted into an intra-state Maharashtra B2CS bucket despite their IGST (`packages/engine/src/gstr1-json.ts:203–219`).
- **ZIP filenames can overwrite distinct documents.** Document numbers `INV/001` and `INV-001` both become `bills/INV-001.pdf`; the second assignment overwrites the first, violating the promise to include every PDF (`packages/render/src/ca-pack.ts:195–198`).

VERDICT: defects found
