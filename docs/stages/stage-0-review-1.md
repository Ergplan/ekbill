# Stage 0 — independent review

- Reviewed commit: 225660e
- Base: stage-0-start
- Model: gpt-6.1-sol
- At: 2026-10-15T14:33:20.290Z
- Verdict: defects

---

### (a) Invariants I1–I10

- **I1 — Not yet exercised by authoritative business tables.** The Drizzle schema is empty; fixture lookups filter by business but do not establish database tenancy or RLS. Stage 2 enforcement remains unimplemented (`packages/db/src/schema.ts:1–7`; `apps/web/screens/common.ts:4–16`).
- **I2 — Not established.** There is no database issuance implementation. Moreover, displayed fixture documents are assembled from current business/customer records rather than an issued snapshot. This must remain explicitly prototype-only (`docs/ARCHITECTURE.md:30`; `apps/web/screens/paper.ts:8–46`).
- **I3 — Not established.** Prototype numbers come from a fixture series without allocation, financial-year partitioning or incrementing. Repeating bill creation reuses that number (`apps/web/screens/bill/data.ts:49–51`; `apps/web/screens/bill/Screen.tsx:79–83`).
- **I4 — Violated.** Tax is calculated in the web layer, outside the sole engine calculation required by I4; tax heads are subsequently split from the rounded combined tax, contrary to the money module’s documented independent-head rounding policy (`apps/web/screens/bill/compute.ts:45–85`; `packages/engine/src/money.ts:25–31`). For taxable value ₹0.03 at 18%, the implementation produces combined tax of one paise and splits it 1/0 instead of calculating each head independently.
- **I5 — Violated.** Selectable rates and place-of-supply tax decisions are code, not date-selected, sourced rule-pack data (`apps/web/screens/bill/Screen.tsx:34`; `apps/web/screens/item/Screen.tsx:13`; `apps/web/screens/bill/compute.ts:71–85`).
- **I6 — Not yet exercised by real model output.** The photo review uses fixture output and requires a human button press before storing the simulated issued document; staging tables, provenance enforcement and model-actor triggers are not implemented (`apps/web/app/bills/photo/page.tsx:18–21`; `apps/web/screens/photo/Screen.tsx:63–80`; `packages/db/src/schema.ts:1–7`).
- **I7 — Partially inapplicable, otherwise missing.** No authoritative-table writes are visible, but the new health request has neither request-id generation nor request logging. Consequently the invariant’s “every request” requirement is not upheld (`apps/web/app/api/health/route.ts:34–48`).
- **I8 — Not yet exercised by repository writes.** Role checks currently operate in pages and screens; there are no repository `allowedRoles` declarations in the empty database implementation (`apps/web/app/bills/new/page.tsx:13–19`; `apps/web/screens/bill-view/Screen.tsx:55–56`; `packages/db/src/schema.ts:1–7`).
- **I9 — Violated.** `/kit` renders a `MakeBar` containing `PrimaryCTA` and a separate `WhatsAppButton` simultaneously; both are marked primary (`apps/web/app/kit/KitInteractive.tsx:99`; `apps/web/app/kit/page.tsx:182–185`; `packages/ui/src/bill.tsx:207–211`; `packages/ui/src/primitives.tsx:87–104`). Actual handoff/timing is also not demonstrated: the done button only sets local state (`apps/web/screens/bill-done/Screen.tsx:91–94`).
- **I10 — Approval/regression protection cannot be established from this input.** The supplied diff already contains production-screen prototypes and a report awaiting Stage 1 approval; it does not provide an approved baseline against which preservation can be assessed (`docs/stages/stage-1-report.md:3`; `apps/web/screens/registry.ts:28–54`).

### (b) Server actions and route-handler tests

- **`GET /api/health` → claimed `tests/integration/health.test.ts`.** The report names two tests, but their source is beyond the truncated diff, so the pairing cannot be independently verified (`apps/web/app/api/health/route.ts:34`; `docs/stages/stage-0-report.md:23`).
- **`GET /dev/switch/[person]` → no test demonstrated in the supplied excerpt.** Its implementation is visible, but no inspectable test covers its redirect/cookie behavior (`apps/web/app/dev/switch/[person]/route.ts:13–21`). This is an evidence limitation, not proof that the omitted files contain no test.
- **No server actions are visible.** Simulated bill creation writes browser storage rather than calling a server action (`apps/web/screens/bill/Screen.tsx:68–83`).

### (c) Auditing authoritative writes

- **No writes to the I7 authoritative tables are visible.** The database write shown records migration bookkeeping; simulated bill issuance writes sessionStorage, not `documents` (`packages/db/migrate.mjs:23–35`; `apps/web/screens/bill/Screen.tsx:81`; `apps/web/screens/draft.ts:44–48`). No unaudited authoritative-table write is established by the visible excerpt.

### (d) Generated-file regeneration

- **`docs/FIELD-TRACE.md`: cannot certify regeneration.** Its empty-table output agrees with the visible empty schema, but the generator and its tests are omitted by truncation (`docs/FIELD-TRACE.md:6–12`; `packages/db/src/schema.ts:1–7`).
- **`docs/SCREEN-FLOW.md`: visible content agrees with representative manifest/path sources, but exact regeneration cannot be certified without the omitted generator.** For example, the four-tap repeat path matches its source (`docs/SCREEN-FLOW.md:441–450`; `apps/web/screens/golden-paths.ts:20–29`).
- **`tokens.ts` / `themes.css`: visible additions correspond to `tokens.json`, but exact regeneration cannot be certified because `build.py` is not supplied.** Guide colors/shadows and added radii are represented in source and outputs (`design/tokens/tokens.json:18–25,127–146,191–210`; `design/tokens/themes.css:12–15,92,104,145,157`; `design/tokens/tokens.ts:14–17,124,140,184,199`).

### (e) Both themes; tokens only

- **Not tokens-only.** Literal font sizes include `11px` for pills, `14px`/`13px`/`20px` for avatars, `18px` for the logo name, and `30px` for hero titles (`packages/ui/src/ui.css:319,357,362,367,507,665`). These contradict the requirement that type sizes come from tokens.
- **Literal colors and font exist in a displayed fixture asset:** `#2b2b2b`, `#f7f1e3`, `#cfc3a6`, and `Comic Sans MS, cursive` (`apps/web/public/flow-fixtures/kaccha-bill.svg:1–3`). They are fixed photographed-paper artwork rather than themed controls, but no explicit exception is supplied.
- **Both-theme rendering is not independently verified.** Theme styles and imports exist, but screenshot tests/results are not inspectable in the truncated diff (`apps/web/app/layout.tsx:4–7`; `packages/ui/src/ui.css:697–804`; `docs/stages/stage-0-report.md:24`).

### (f) Unsupported or contradicted stage-report claims

- **“No product feature and no screen flow were built”** is contradicted by the 25-screen registry and implemented Home/bill flow (`docs/stages/stage-0-report.md:3`; `apps/web/screens/registry.ts:28–54`; `apps/web/screens/bill/Screen.tsx:36–83`).
- **“tokens only”** is contradicted by literal type sizes (`docs/stages/stage-0-report.md:9`; `packages/ui/src/ui.css:319,507,665`).
- **“`/kit` renders them all”** is unsupported for the added flow components: its imports/render tree do not include `Sheet`, `ChoiceList`, `OtpInput`, `SearchInput`, `SettingRow` or `ProgressLine` (`docs/stages/stage-0-report.md:9`; `apps/web/app/kit/page.tsx:1–30`; `apps/web/app/kit/KitInteractive.tsx:6–30`; `packages/ui/src/index.ts:56–66`).
- **“empty until Stage 1”** no longer describes the supplied generated screen-flow document (`docs/stages/stage-0-report.md:12`; `docs/SCREEN-FLOW.md:5–7`).
- **“`/kit` behind the gate”** is contradicted by deployment’s default gate-off behavior (`docs/stages/stage-0-report.md:87`; `deploy/vm/up.sh:30–42`; `deploy/docker-compose.yml:105`).

### Additional code defects

- **Purity lint rules are overwritten.** The later matching `no-restricted-syntax` configuration replaces the engine’s Date/Math restrictions instead of merging them. Failing input: add `Date.now()` or `Math.random()` to an engine module; this configuration no longer prohibits it (`eslint.config.mjs:55–68,72–89`).
- **Storage failure makes draft inputs unusable.** `writeDraft()` swallows sessionStorage errors without maintaining an in-memory value, despite its comment promising React-state fallback. Failing input: block sessionStorage and type a setup name; subsequent reads return the original empty value (`apps/web/screens/draft.ts:44–51,58–77`).
- **Valid phone numbers beginning with 91 are rejected.** Country-code stripping is unconditional. Failing input: `9123456789` becomes `23456789` and fails validation (`apps/web/screens/login/Screen.tsx:39–42`).
- **Removing a line shifts its GST rate onto another line.** Removal updates `lines` but not the parallel `gst.perLine` array. Failing input: two lines taxed at 5% and 18%; remove the first; the remaining line uses 5% (`apps/web/screens/bill/Screen.tsx:162–173`; `apps/web/screens/bill/compute.ts:52–55`).
- **Successive partial payments overwrite rather than accumulate.** Failing input: bill due ₹100; record ₹20, then ₹30 without leaving the screen. Displayed due becomes ₹70 instead of ₹50 (`apps/web/screens/bill-view/Screen.tsx:52–62`).
- **Direct reminders leave `{days}` unfilled.** Failing input: open a reminder and select the direct tone; its substitution parameters omit `days` (`apps/web/screens/remind/data.ts:25–37`; `design/copy/en.json:110`; `packages/copy/src/index.ts:23–26`).
- **Derived setup PAN/city are discarded.** `advance()` modifies a temporary `next` object but only persists `override`, which is absent when advancing the GSTIN field. Failing input: enter a valid GSTIN and advance; review does not retain its derived PAN/state-prefilled city (`apps/web/screens/setup/Screen.tsx:125–145`).
- **New-customer handoff loses entered details.** The customer screen stores `new-customer` and passes `name`, but the bill page reads neither; its loader initializes an empty customer name. Failing input: add customer “Acme”, then land on their bill (`apps/web/screens/customer-new/Screen.tsx:36–37`; `apps/web/app/bills/new/page.tsx:14–18`; `apps/web/screens/bill/data.ts:91–94`).
- **Corrected photo date is ignored.** Failing input: edit the reviewed date to an earlier date and press Bill banao; the resulting draft still uses `today` (`apps/web/screens/photo/Screen.tsx:63–72,153–159`).

VERDICT: defects found
