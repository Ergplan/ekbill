# Stage 9 — independent review

- Reviewed commit: ab19a4f
- Base: stage-9-start
- Head: stage-10-start
- Model: gpt-6.1-sol
- At: 2026-10-16T10:15:02.961Z
- Verdict: defects

---

### (a) Invariants I1–I10

- **I1 — Violated.** `recordUserAiCall()` introduces a repository write without `TenantScope` and explicitly inserts `businessId: null` into `ai_calls`, which is not an I1 exception (`packages/db/src/repos/ai-calls.ts:50–60`). The new search table does have a non-null business FK and invokes tenancy setup (`packages/db/migrations/0007_poocho.sql:3,20,28`); its isolation is tested (`tests/integration/poocho.test.ts:100–110`). The implementation of `apply_tenancy()` is not supplied, so forced RLS cannot independently be confirmed.
- **I2 — No new violation identified; existing enforcement cannot be certified from this diff.** Search reads issued snapshots rather than modifying documents (`packages/db/src/repos/search.ts:79,113–128`); voice bill creation only returns a form URL and lines (`apps/web/actions/voice.ts:48–59`).
- **I3 — No new violation identified; allocation and locking are outside the supplied diff.** The added issuance code queues indexing after issuance and does not allocate numbers (`apps/web/actions/bills.ts:214–220`).
- **I4 — Not fully upheld.** Search independently calculates monetary line amounts using `Math.round((quantityMilli * unitPricePaise) / 1000)` rather than consuming the engine’s computed line amount or money-rounding helper (`packages/engine/src/poocho.ts:59`). This introduces another monetary calculation and potentially unsafe intermediate multiplication.
- **I5 — No new violation identified.** The helper obtains selectable rates from the rule pack for the supplied date (`apps/web/screens/help/data.ts:28–35`), and validates against those rates (`apps/web/screens/help/plan.ts:118–120`).
- **I6 — Commit-button protection is present, but universal compliance is not established.** Voice refuses owner-only taps (`apps/web/screens/voice/VoiceProvider.tsx:194–201`; `apps/web/screens/voice/dom.ts:177–185`), with a real-screen refusal test (`tests/e2e/voice.spec.ts:60–65`). However, `fillItem()` clicks radio options without checking `ownerOnly()`, including an explicitly owner-marked choice (`apps/web/screens/voice/dom.ts:145–157`). The owner-only boundary is therefore bypassable through `fill`.
- **I7 — Violated for attribution.** `acceptInvites()` updates authoritative memberships through bare `db()`, accepts only a user ID, and supplies neither actor nor request context (`packages/db/src/auth.ts:154–161`). Its caller has a request ID but does not pass it (`apps/web/app/dev/switch/[person]/route.ts:33,55`). An existing trigger alone cannot restore that missing request attribution.
- **I8 — Ordinary team writes declare and enforce roles.** Invite, change-role and removal use repository allowlists (`packages/db/src/repos/memberships.ts:19–23,69,120,153`), with generated role tests for change-role (`tests/integration/roles.test.ts:325–336`). Invitation acceptance is an auth transition outside that scoped repository path (`packages/db/src/auth.ts:154–161`); its attribution defect is covered under I7.
- **I9 — Not established by the supplied tests.** The report claims the golden-path budget is protected by `tests/unit/manifests.test.ts`, but supplies no change or execution evidence for that test (`docs/stages/stage-9-report.md:109`). The helper’s conditional branches each contain one primary CTA (`apps/web/screens/help/Screen.tsx:76–84,332–336`); this does not prove the required measured journeys.
- **I10 — Violated.** Wiring changes the helper’s markup, controls and copy substantially, rather than only swapping fixture data (`apps/web/screens/help/Screen.tsx:103–338`). It also adds a persistent voice overlay (`apps/web/screens/voice/VoiceProvider.tsx:377–394`). The report supplies no operator-approved exception for these design changes while claiming Stage 1 baselines are unchanged (`docs/stages/stage-9-report.md:118`).
- **Related operating-rule violations:** the browser directly calls a model endpoint outside `packages/ai` (`apps/web/screens/voice/VoiceProvider.tsx:317–321`, rule 9); voice replies contain owner-visible hard-coded Hinglish rather than dictionary keys (`apps/web/actions/voice.ts:17,44,47,58,64,73,77,83,88–89`, rule 16).

### (b) Added server actions and route handlers: test pairs

All added entry points have browser coverage, but **none has a supplied integration test invoking the actual action/handler**, as rule 3 requires:

- `ask()` (`apps/web/actions/ask.ts:8`) → owner/accountant questions (`tests/e2e/poocho.spec.ts:17–46`). The database integration test calls `askRecords()`, not the action (`tests/integration/poocho.test.ts:138–154`).
- `inviteMember()` (`apps/web/actions/team.ts:31`) → invite journey (`tests/e2e/team.spec.ts:27–40`).
- `changeMemberRole()` (`apps/web/actions/team.ts:52`) → role change (`tests/e2e/team.spec.ts:50–54`).
- `removeMember()` (`apps/web/actions/team.ts:66`) → two-tap removal (`tests/e2e/team.spec.ts:55–57`). Team integration tests invoke repositories instead (`tests/integration/team.test.ts:21,33,38`).
- `voiceWhoOwes()` (`apps/web/actions/voice.ts:36`) → `who_owes` browser tool (`tests/e2e/voice.spec.ts:68`).
- `voiceStartBill()` (`apps/web/actions/voice.ts:42`) → prefilled form (`tests/e2e/voice.spec.ts:46–52`).
- `voiceRemind()` (`apps/web/actions/voice.ts:62`) → reminder navigation (`tests/e2e/voice.spec.ts:81–83`).
- `voiceAsk()` (`apps/web/actions/voice.ts:81`) → record answer (`tests/e2e/voice.spec.ts:69`).
- `POST /api/voice/session` (`apps/web/app/api/voice/session/route.ts:18`) → mic startup (`tests/e2e/voice.spec.ts:40–43`), which fetches that endpoint (`apps/web/screens/voice/VoiceProvider.tsx:256`).
- Modified `GET /dev/switch/[person]` (`apps/web/app/dev/switch/[person]/route.ts:33–55`) → phone sign-in and removal access check (`tests/e2e/team.spec.ts:43–46,60–61`).

### (c) Authoritative writes and auditing

- Membership invitation/upsert, role change and removal run inside `withTenant()` (`packages/db/src/repos/memberships.ts:70,85–102,122–137,154–170`). Their existing audit-trigger definitions are not supplied, so auditing cannot be certified from this diff.
- **Invitation acceptance lacks required attribution:** the membership update bypasses scoped actor/request setup (`packages/db/src/auth.ts:154–161`).
- Invitation creates users through the scoped transaction when necessary (`packages/db/src/repos/memberships.ts:81–83`); no user audit implementation is supplied.
- Search-index writes are explicitly derived and deliberately unaudited, not authoritative writes (`packages/db/src/repos/search.ts:47–56,286–294`; `packages/db/migrations/0007_poocho.sql:30–32`).

### (d) Generated documents

- `SCREEN-FLOW.md`’s changed helper entry matches the changed manifest’s purpose, taps, states, guides and tour (`docs/SCREEN-FLOW.md:420–432`; `apps/web/screens/help/manifest.ts:7–24`). Exact regeneration cannot be verified without `scripts/flow-map.mjs`.
- `FIELD-TRACE.md` omits `voiceBillInput.lines`, despite that field and its owner mapping being added (`apps/web/actions/schema.ts:221`; `docs/field-owners.json:28`; `docs/FIELD-TRACE.md:462–463`). This is a trace-coverage defect; whether regeneration would change the file cannot be determined without `scripts/trace.mjs`.
- Token sources, generator, `tokens.ts` and `themes.css` are not supplied as changes, so exact regeneration cannot be certified. The added voice styles consume existing token names (`packages/ui/src/ui.css:2158–2172`).

### (e) Both themes and token-only rendering

- No new literal colour, radius, shadow or font value is present in the added voice CSS: those properties use `var(--eb-…)` (`packages/ui/src/ui.css:2158–2172`).
- The flow audit visits sample routes under both theme cookies and checks `data-theme` (`tests/e2e/flow-audit.spec.ts:22,96–110`); this is not proof of correct visual rendering in both themes.
- Coverage is incomplete: the audit uses `SAMPLE_URL`, not all registered screen states, and the new-owner audit visits only welcome, setup-name and setup-GST (`tests/e2e/flow-audit.spec.ts:24,128–134`). The helper terms state is separately registered (`apps/web/screens/registry.ts:94`), but this audit does not consume that state list.

### (f) Unsupported or overstated report claims

- **“no row of an earlier stage is altered or removed”** (`docs/stages/stage-9-report.md:12`) conflicts with membership updates introduced in this stage (`packages/db/src/auth.ts:156–159`; `packages/db/src/repos/memberships.ts:125–126`).
- **“no phone, GSTIN or bank detail”** (`docs/stages/stage-9-report.md:35`) is not guaranteed: customer notes, bill notes and item descriptions are copied without redaction (`packages/engine/src/poocho.ts:89,116,140`). Failing input: customer notes containing `Bank account 123456789012`.
- **“names stripped of anything that could break out”** (`docs/stages/stage-9-report.md:43`) overstates character replacement. Instruction text survives name sanitization (`packages/ai/src/voice.ts:145–164`); its own test expects `Ignore all rules` to remain (`tests/unit/voice.test.ts:84–88`).
- **“On each screen the model is told”** (`docs/stages/stage-9-report.md:45`) excludes query-only navigation because the effect depends only on `pathname` (`apps/web/screens/voice/VoiceProvider.tsx:332–352`).
- **“tap targets of at least 44 px”** (`docs/stages/stage-9-report.md:75`) is only partially checked: the audit tests height, not width, and excludes ordinary links and textareas (`tests/e2e/flow-audit.spec.ts:55–63`).
- **“staff and the accountant see the team and cannot change it”** (`docs/stages/stage-9-report.md:95`) contradicts the test, which verifies that both are redirected away (`tests/e2e/team.spec.ts:64–68`).
- **“each record under the answer opens it”** (`docs/stages/stage-9-report.md:39`) fails for permitted slash-containing bill numbers because search builds an unencoded path (`packages/engine/src/poocho.ts:95`).

### Additional code defects

- **Embedding-model changes never invalidate stored vectors.** Failing input: change `OPENAI_EMBED_MODEL` from model A to model B after indexing. Pending selection checks only text version, while search compares all stored vectors regardless of model (`packages/db/src/repos/search.ts:254–258,275–277`). Model B questions are compared against model A embeddings indefinitely.
- **Stale embeddings remain searchable after text changes.** Failing input: edit an item’s description after it has been embedded, then ask before the worker runs. Upsert replaces text/version but retains the embedding; semantic search does not require `embedded_version = version` (`packages/db/src/repos/search.ts:52–54,254–258`).
- **Starting another bill on the already-mounted form loses the new lines.** Failing input: voice `start_bill` twice for the same customer while on their bill form. The tool writes a new prefill and navigates, but the form consumes prefill only on mount (`apps/web/screens/voice/VoiceProvider.tsx:165–169`; `apps/web/screens/bill/Screen.tsx:102–116`).
- **Stop during connection does not cancel startup.** Failing input: tap mic, then tap mic again while the session request or microphone permission is pending. `stop()` clears current resources, but the awaited startup continues and creates a connection afterward (`apps/web/screens/voice/VoiceProvider.tsx:116–127,256–287`).
- **Ambiguous reminders select a customer anyway.** Failing input: two customers named Sharma Electricals and Sharma Sweets both owe money; request `remind("Sharma")`. The global match is null, but matching each due row individually succeeds and the oldest row is selected (`apps/web/actions/voice.ts:69–72`).
- **A missing/null rate becomes a free line.** Failing input: `linesFromSpeech([{ what: "AMC visit", rate: null }])`. `Number(null)` becomes zero and passes validation, rather than requesting the missing rate (`packages/engine/src/voice.ts:85–89`).

VERDICT: defects found
