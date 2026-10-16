# Stage 4 — independent review

- Reviewed commit: 31d690f
- Base: stage-4-start
- Head: stage-5-start
- Model: gpt-6.1-sol
- At: 2026-10-16T10:09:15.678Z
- Verdict: defects

---

## (a) Invariants I1–I10

- **I1 — Supported for the new file repository, not fully verifiable globally.** `business_files.business_id` is non-null with a foreign key, and the migration invokes `apply_tenancy`; file reads use `withTenant(scope)`. The new cross-tenant tests exercise the repository. The implementation of the inherited tenancy helper is not supplied. (`packages/db/migrations/0003_profile.sql:3,36,57`; `packages/db/src/repos/files.ts:76–81`; `tests/integration/tenancy.test.ts:50–66`)
- **I2 — No new issuance writer shown.** The new bill preview deliberately reads live business branding and fixture/sample data; it cannot establish snapshot-only rendering of actual issued documents. Treat it as the documented sample stub, not evidence that I2 is fully implemented. (`apps/web/screens/bill-done/data.ts:32–58`; `docs/stages/stage-4-report.md:17`)
- **I3 — Not fully verifiable.** This diff exposes series changes through an action but does not supply the existing `updateSeries` implementation or allocation/concurrency tests. The new action delegates rather than allocating numbers itself. (`apps/web/actions/business.ts:133–147`)
- **I4 — Supported for the new profile checks; money/tax paths are not newly duplicated.** The browser and repository call `checkProfile`, whose inputs determine its result. However, their surrounding validation does differ, contrary to the report; see (f). (`apps/web/screens/aap/Screen.tsx:181–188`; `packages/db/src/repos/businesses.ts:137–154`; `packages/engine/src/profile.ts:169–289`)
- **I5 — Threshold changes have fixture updates, but the rule gate remains failing.** The report expressly says `rules:check` remains red on unverified entries; therefore full I5 compliance cannot be certified. (`packages/engine/rules/gst/e-invoice.json:11,39`; `packages/engine/rules/gst/hsn.json:13`; `tests/unit/engine-rules.test.ts:160–185`; `docs/stages/stage-4-report.md:3,42`)
- **I6 — Supported for the new table only through the inherited helper.** The migration invokes the tenancy toolkit identified as installing model-write refusal. No new model call or model-authored authoritative write is shown; the helper’s implementation is absent. (`packages/db/migrations/0003_profile.sql:54–57`; `packages/db/src/repos/files.ts:53–70`)
- **I7 — New file writes have an explicit audit trigger.** Business, membership and series writes rely on existing triggers that are not supplied; full audit coverage and request-ID propagation therefore cannot be independently certified. (`packages/db/migrations/0003_profile.sql:58–72`; `packages/db/src/repos/businesses.ts:148–166,312–350`)
- **I8 — Owner checks are enforced for the new scoped writes.** Profile/look/file/default-series methods declare owner-only roles and call `allow`; file insertion does likewise. Generated role tests cover those repository methods, not the new action boundary. (`packages/db/src/repos/businesses.ts:53–61,149,170,198,215`; `packages/db/src/repos/files.ts:37–40,53–54`; `tests/integration/roles.test.ts:40–87,148–159`)
- **I9 — Violation: multiple primary committing controls in one visible screen state.** Opening an editable Aap sheet leaves the sticky Save `PrimaryCTA` rendered while the sheet supplies another Done `PrimaryCTA`; there is no `editing` condition around the sticky control. (`apps/web/screens/aap/Screen.tsx:504–530,533–702`)
- **I10 — Violation of the supplied wiring-only restriction.** The diff adds sheets, fields and controls and changes setup review markup. The report acknowledges re-recorded setup-review baselines, but supplies no operator’s written approval, and no baseline changes appear in this diff. (`apps/web/screens/aap/Screen.tsx:533–1040`; `apps/web/screens/setup/Screen.tsx:446–464,538–577`; `docs/stages/stage-4-report.md:27`)

## (b) Tests for every new action and handler

- `finishSetup` → full setup journeys. (`apps/web/actions/business.ts:45–66`; `tests/e2e/setup.spec.ts:36–102`)
- `saveProfile` → Aap edit-and-save journey. (`apps/web/actions/business.ts:69–82`; `tests/e2e/setup.spec.ts:104–129`)
- `setBusinessFile` → setup signature and Aap logo/signature journeys. (`apps/web/actions/business.ts:105–123`; `tests/e2e/setup.spec.ts:55–71,130–145`)
- **`saveLook`: no action test supplied.** The generated test calls the repository probe, bypassing the action. (`apps/web/actions/business.ts:84–102`; `tests/integration/roles.test.ts:52–63`)
- **`addSeries`: no action test supplied.** (`apps/web/actions/business.ts:125–139`)
- **`changeSeries`: no action test supplied.** (`apps/web/actions/business.ts:141–155`)
- **`chooseDefaultSeries`: no action test supplied.** The repository role test is not an action test. (`apps/web/actions/business.ts:157–165`; `tests/integration/roles.test.ts:76–87`)
- `GET /api/files/[id]` → incidental browser requests from sample images, but **no handler integration test** covering authentication, tenant isolation, malformed IDs or response bytes/headers. Image visibility alone does not verify successful image decoding. (`apps/web/app/api/files/[id]/route.ts:14–35`; `tests/e2e/setup.spec.ts:140–145`)

The supplied new journeys do not satisfy the separate requirement for real-Postgres integration tests of **each action and handler**; the new integration cases invoke repository probes. (`tests/integration/roles.test.ts:40–87,148–159`; `tests/integration/tenancy.test.ts:50–66`)

## (c) Audit coverage of authoritative writes

- **`business_files` insert:** explicitly audited, with bytes omitted and actor/request settings recorded. (`packages/db/src/repos/files.ts:59–70`; `packages/db/migrations/0003_profile.sql:58–72`)
- **`businesses` profile, look, file-pointer and default-series updates:** depend on the existing business audit trigger; that trigger is not supplied. (`packages/db/src/repos/businesses.ts:148–166,169–188,192–211,214–234`)
- **Business creation, owner membership insertion, two series insertions and default-series update:** likewise depend on inherited triggers not supplied here. (`packages/db/src/repos/businesses.ts:312–350`)
- **Series add/change actions:** delegate to existing repository writers; their SQL and audit triggers are absent. (`apps/web/actions/business.ts:125–155`)
- **Seed business/series/membership changes and new-owner cleanup:** use direct database writes and inherited audit machinery. Cleanup removes memberships before setting each returned business’s transaction context, so attribution/context correctness is not demonstrated by this diff. (`packages/db/src/seed.ts:290–321,345–358`)

No explicitly unaudited authoritative insert is established from the supplied code, but “every write is audited and attributed” is **not fully verifiable** without the inherited triggers and scope implementation. (`packages/db/migrations/0003_profile.sql:54–72`; `packages/db/src/repos/businesses.ts:312–350`)

## (d) Generated-document regeneration

- **`docs/FIELD-TRACE.md`: cannot certify a clean regeneration.** The diff shows the new nearest-table parser and generated rows, but omits the generator’s unchanged ownership-resolution/output logic. The supplied ownership overrides and output use different spellings, which may be intentional precedence rather than proven drift. (`scripts/trace.mjs:67–76,89–96`; `docs/field-owners.json:2–12`; `docs/FIELD-TRACE.md:177–217`)
- **`docs/SCREEN-FLOW.md`: no manifest-source change is shown, so no regeneration drift is demonstrated.** However, newly added sheet controls are code changes, not evidence that the flow documentation describes them. (`apps/web/screens/aap/Screen.tsx:533–1040`)
- **`tokens.ts` / `themes.css`: no token-source or generated-token changes are shown.** No regeneration mismatch can be established, but the newly displayed accent palette bypasses these generated tokens. (`packages/engine/src/profile.ts:56–58`; `apps/web/screens/aap/Screen.tsx:790–820`)

## (e) Both themes and tokens only

- **Token-only violation:** Aap swatches use inline `background` values from stored hex accents and the literal palette `'#2f4a9e', '#0f766e', '#b45309', '#be123c', '#6d28d9', '#1f2937'`, not `var(--eb-…)`. No corresponding token addition or exemption is supplied. (`apps/web/screens/aap/Screen.tsx:410–438,790–820`; `packages/engine/src/profile.ts:56–58`)
- No new literal radius, shadow or font is shown in the added paper CSS; its pixel dimensions are layout values. (`packages/ui/src/ui.css:2114–2134`)
- Both-theme evidence exists for the regular setup journey only. Composition runs in Narangi, “Pata nahi” in Harmony, and the editable Aap/sample journey in Narangi; these do not prove every touched screen/state in both themes. (`tests/e2e/setup.spec.ts:36–73,75–108,146–150`)
- Home’s touched rendering changes data selection, not styling; no new styling violation is shown there. (`apps/web/screens/home/Screen.tsx:34–37`)

## (f) Unsupported or contradicted stage-report claims

- **“the two can never disagree.”** Browser `checkProfile` accepts a syntactically valid email longer than 120 characters, while the action schema rejects it with generic `form.invalid`. For example, `email = 'a'.repeat(110) + '@example.com'`. (`docs/stages/stage-4-report.md:26`; `packages/engine/src/profile.ts:235–236`; `apps/web/actions/schema.ts:36`; `apps/web/actions/business.ts:69–71`)
- **“size ≤ 300 KB by constraint” / “a file is written once.”** The size constraint checks caller-supplied metadata, not `octet_length(bytes)`; the immutability trigger permits changing `size`, `id`, `created_by` and `created_at`. (`docs/stages/stage-4-report.md:7`; `packages/db/migrations/0003_profile.sql:6–14,75–84`)
- **“the brand-new owner's golden path (d) through the real setup … existing, re-pointed.”** The supplied diff re-points `files.spec.ts`, but contains no corresponding golden-path test change. This claimed change is unsupported by the supplied diff. (`docs/stages/stage-4-report.md:40`; `tests/e2e/files.spec.ts:69–72`)
- **“Staff and the accountant see the business read-only.”** Their loaded profile still supplies an interactive voice toggle whose callback patches local business-profile state without an owner check. Repository enforcement prevents persistence, but the screen is not read-only as claimed. (`docs/stages/stage-4-report.md:17`; `apps/web/screens/aap/Screen.tsx:473–480`)

## Additional code defects

- **Saving an ordinary profile resets the saved bill look.** Failing sequence: choose Modern/A5/JPG/custom accent, then edit an email and press sticky Save. Aap’s profile payload omits `look`; `checkProfile` supplies `DEFAULT_LOOK`; `saveProfile` writes those defaults through `columnsOf`, silently discarding the chosen look. (`apps/web/screens/aap/Screen.tsx:120–155`; `apps/web/actions/schema.ts:24–49`; `packages/engine/src/profile.ts:255–260`; `packages/db/src/repos/businesses.ts:110–166`)
- **Malformed file IDs produce a database error instead of 404.** Failing request: authenticated `GET /api/files/------------------------------------`. The 36-character regex accepts it, PostgreSQL rejects it as UUID syntax, and the catch only handles `NotFoundError`. (`apps/web/app/api/files/[id]/route.ts:15–20,31–33`; `packages/db/src/repos/files.ts:76–80`)
- **Setup silently loses a refused signature.** Failing input: a valid profile with a persisted signature draft that the server refuses, such as an oversized PNG. The setup ignores the failed `setBusinessFile` result, clears the draft and navigates Home as though everything succeeded. (`apps/web/screens/setup/Screen.tsx:201–215`)
- **Signature removal reports local success even when refused.** Failing sequence: open the signature sheet, lose authorization/session, then remove the signature. The promise resolves to `{ ok: false }`, but the callback unconditionally removes the preview and closes the sheet. (`apps/web/screens/aap/Screen.tsx:825–865`)
- **New file bytes can exceed the advertised database cap.** Failing database input: an otherwise valid `business_files` insert with 307,201 bytes and `size = 1`. The constraint accepts it because it does not compare actual byte length with either `size` or the cap. (`packages/db/migrations/0003_profile.sql:6–14`)
- **The credit-note series cannot be retired/restored through Aap.** Failing sequence: create a `credit_note` series and attempt to retire it. Retirement controls are generated only for rows whose kind is `bill`; the edit form has no active-state control. (`apps/web/screens/aap/Screen.tsx:930–984,1015–1035`)

VERDICT: defects found
