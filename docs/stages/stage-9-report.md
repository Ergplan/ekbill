# Stage 9 — Wire: the rest of the front desk

**Status: built and tested in the build container with the stand-in model. The voice's first real conversation, Poocho's first real answer, "every journey green on the VM" and the independent review run on the VM.** Everything else the approved flow has is now wired:

- the team: invite by phone with a role, change a role, remove
- Poocho: an answer from the business's own records, with the records it came from
- the voice: one Realtime conversation across screens that lights, fills and opens, and never commits
- the guide tour, which the voice now drives
- the contract helper
- the flow audit, for every role and both themes

Nothing permanent changed: the one migration (`0007_poocho.sql`) adds a derived, rebuildable index; no row of an earlier stage is altered or removed.

Three done-conditions could not be met here, so they are stated first:

- No model was called. The build has no key and must not call one. Poocho's answer, its embeddings and the voice's session ran against the stand-in (`AI_TRANSPORT=fake`).
- "Every journey green on the VM" is the operator's run (below).
- The independent review (`npm run review:stage -- 9`) runs on the VM.

## What exists

### Team and invites

`repos/memberships.ts`:

- `invite` writes an `invited` membership for the phone; a person new to EkBill is created by phone; an active member keeps their row.
- `changeRole` is the owner's; the owner's own role never changes.
- `remove` takes an active or invited member, never the owner.
- Refusals are `TeamError` (`owner`, `self`).

`auth.ts`: `acceptInvites(userId)` turns a person's invitations active when they sign in; `userByPhone`. `/dev/switch/<phone>` signs in by number (as the OTP will) and accepts the invitations first, so the invitee lands in the business. The team screen shows each member's status and role, writes the WhatsApp invite text, and removes in two taps.

### Poocho

- **Index** (`migrations/0007_poocho.sql`, `search_records`): one row per issued bill or credit note, customer and item, holding the engine's plain sentences (`packages/engine/src/poocho.ts`; no phone, GSTIN or bank detail). A generated `simple` tsvector (GIN) and a 256-dimension pgvector embedding (HNSW). A fingerprint `version` of what the text was written from. Rewritten in place, never deleted; not audited (derived).
- **Search** (`repos/search.ts`): `refreshIndex` rewrites only the records whose fingerprint moved (a payment a minute ago is in the next answer); `search` by words always and by meaning above a similarity floor, fused by reciprocal rank.
- **Answer** (`apps/web/server/ask.ts`): refresh, embed the question, search, then `callText` with `prompts/ask/v1.md` (answer only from the numbered records, cite them, "Records mein yeh nahi mila" otherwise). The citations are renumbered to the records shown. Without a model, the matching records are the answer.
- **Worker**: `index-search` after each issue and nightly at 02:30 IST fills the embeddings in batches, one ai_calls row per batch.
- **Screen**: for a session the examples name the business's own customers and items; each record under the answer opens it.

### Voice

- **Session** (`packages/ai/src/voice.ts`, `POST /api/voice/session`): a ten-minute Realtime client secret minted on the server with the instructions (`prompts/voice/v1.md`, the business's name and customers filled in, names stripped of anything that could break out) and the tools baked in. The key never reaches the browser. One ai_calls row per session; a brand-new owner in setup gets a null-business row.
- **Tools**: start_bill, who_owes, remind, ask_records, go_to, show, fill, tap, guide_steps. None makes, saves, sends or pays.
- **In the browser** (`screens/voice/VoiceProvider.tsx` in the root layout): one WebRTC conversation that survives navigation. On each screen the model is told the manifest's purpose and the data-guide items, with fields inside a section as `<section>/<field>` and OWNER-ONLY marked.
- **Rule 17, deny by default** (`screens/voice/dom.ts`): the voice presses only an in-app link, a choice, or an item marked `data-voice="safe"`. Every other button, a link out of the app (WhatsApp) and a download are lit with "Yeh aap khud dabao." and refused.
- **Mic and "Bolke"**: the mic in the tab bar (and in the top bar of setup and the photo review) starts the voice where a session can be minted, else the tour. "Bolke" on Aap starts it on arrival for an owner who has used it on that phone.
- **Walk-throughs**: setup (each question shown, filled, Aage tapped; "Chalo, shuru karte hain" is the owner's) and the photo review (the fields read back, a doubtful one corrected; Bill banao is the owner's).
- **Bill form**: opens with the lines start_bill heard, placed once.

### Guide tour

Per screen from the manifests since Stage 1 ("Tour" in the top bar). The voice moves the same highlight and answers guide_steps from the manifest's tour.

### Contract helper

The MVP's helper, on the engine salvaged in Stage 3 (`contract.ts`):

- three choices (a percentage of a contract, instalments, a running bill), then the contract's terms for one customer
- the terms are typed, or read from the contract's pasted text (`parseContractText`)
- the working for this one bill (`planMilestoneBill`, `planProgressBill`), with GST on top, included or none, and retention
- "Is hisaab se bill banao" opens the bill form for the customer with the line and the contract's GST rate

Nothing is stored: the contract is typed each time (Stage 9 changes nothing permanent).

### Flow audit and copy

`tests/e2e/flow-audit.spec.ts` (the MVP's `scripts/e2e-flow.mjs`, ported) audits every screen as the owner, staff, the accountant, the composition business and the signed-out demo, in both themes, plus the new owner's door. It checks for:

- sideways scroll
- a way out (back or tabs) that leads somewhere else
- tap targets of at least 44 px
- junk text
- broken pictures
- English-only buttons on a Hinglish screen

A link to nothing has its own themed page with the way home. `tests/unit/copy-dictionary.test.ts`: every key in both registers with the same placeholders.

## Documents

- `docs/ARCHITECTURE.md` ("What changed in Stage 9"), `docs/DECISIONS.md` (thirteen entries), `docs/KNOWN-GAPS.md`, `docs/FIELD-TRACE.md`, `docs/SCREEN-FLOW.md`.

Sign-in is switched off; do not put a real business's books here yet.

## Invariants, file:line

- **I6 and rule 17 (the voice never commits)**: no tool makes, saves, sends or pays (`packages/ai/src/voice.ts`, the tool list; `tests/unit/voice.test.ts` pins it). In the browser, `apps/web/screens/voice/dom.ts:48` (`ownerOnly`, deny by default) and `:178` (`tapItem`); the tool lights and refuses at `apps/web/screens/voice/VoiceProvider.tsx:196`. The voice's record tools only read (`apps/web/actions/voice.ts`); start_bill opens the form, it does not issue, and refuses the accountant (`:47`).
- **Rule 9 (one ai_calls row per call)**: Poocho's answer and embeddings through `callText` and `embedTexts` (`apps/web/server/ask.ts:43`); the voice's mint at `packages/ai/src/voice.ts:276` (and the error row); a person without a business through `recordUserAiCall` (`apps/web/app/api/voice/session/route.ts:31`). Prompts are files: `prompts/ask/v1.md`, `prompts/voice/v1.md`, `prompts/voice-transcribe/v1.md`.
- **I1 (tenancy)**: `search_records` has forced RLS (`migrations/0007_poocho.sql:28`); the generated tenancy test adds "search finds nothing of another business's records"; `tests/integration/poocho.test.ts` checks that another business's hits never appear.
- **I8 (roles)**: team writes are the owner's (`packages/db/src/repos/memberships.ts:65`, `:118`, `:153`, generated roles test); Poocho is every member's (ai_calls allows the accountant); the helper and start_bill are not the accountant's.
- **8.3 (nothing deleted)**: the index is rewritten in place and hides archived records (`packages/db/src/repos/search.ts:243`); `refuse_delete` stays on it. It is not audited (`0007_poocho.sql:32`, a decision in DECISIONS.md).
- **Invitations**: accepted only when that phone signs in (`apps/web/app/dev/switch/[person]/route.ts:55`).

## Tests

| What                                                                                                                                                                                                                             | Where                                                | Count       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------- |
| The invite lifecycle: invite, sign in by that phone and land in the business, change role, remove; refusals                                                                                                                      | `tests/integration/team.test.ts`                     | 3           |
| Roles in the UI: the owner invites and removes; staff and the accountant see the team and cannot change it                                                                                                                       | `tests/e2e/team.spec.ts`                             | 2           |
| The flow audit: every screen, five personas × two themes, the new owner's door, a link to nothing                                                                                                                                | `tests/e2e/flow-audit.spec.ts`                       | 12          |
| The copy dictionary: both registers, the same placeholders                                                                                                                                                                       | `tests/unit/copy-dictionary.test.ts`                 | +1 file     |
| Poocho's record texts, query, fusion and citations                                                                                                                                                                               | `tests/unit/engine-poocho.test.ts`                   | 7           |
| `callText`, `embedTexts` and their stand-ins; pricing by call kind                                                                                                                                                               | `tests/unit/ai-client.test.ts`                       | +5          |
| Poocho on the database: the index follows money, archived records hidden, I1, embeddings and meaning, the cited answer and its ai_calls rows, nothing found asks no model, no model gives the records, the worker's job          | `tests/integration/poocho.test.ts`                   | 9           |
| Poocho in the browser: the owner's cited answer opens its record; the accountant asks; nothing found                                                                                                                             | `tests/e2e/poocho.spec.ts`                           | 2           |
| The voice: intents, the instructions (no break-out), the session body, no committing tool, one ai_calls row per mint, off without a model                                                                                        | `tests/unit/voice.test.ts`                           | 10          |
| The voice on real screens: screen description with OWNER-ONLY, a bill opened by voice with its line, show and safe taps, Bill banao lit and refused, records; screens and the reminder; the setup and photo-review walk-throughs | `tests/e2e/voice.spec.ts`                            | 4           |
| The contract helper's working: percentages, the last instalment, sums, GST on top / included / none, equal instalments, running bills, refusals, a pasted contract                                                               | `tests/unit/help-plan.test.ts`                       | 10          |
| The contract helper in the browser: pasted contract → working → the bill form with its line; a running bill with nothing new; back to the choices                                                                                | `tests/e2e/help.spec.ts`                             | 2           |
| The generated roles and tenancy tests                                                                                                                                                                                            | `tests/integration/roles.test.ts`, `tenancy.test.ts` | regenerated |

Golden path (d), the brand-new owner to the first bill on WhatsApp, stays within its budget (`tests/unit/manifests.test.ts`).

Totals:

| Suite      | Passed                                                                      |
| ---------- | --------------------------------------------------------------------------- |
| vitest     | 718                                                                         |
| Playwright | 163 (Stage 1 baselines unchanged; two new: the helper's terms, both themes) |

## For the operator

1. On the VM, run `git pull`, then `deploy/vm/up.sh` (it applies migration `0007_poocho.sql`).
2. Add to `.env` on the VM, typed in nano (never on a command line): `OPENAI_TEXT_MODEL`, `OPENAI_EMBED_MODEL` (a model that accepts `dimensions: 256`) and `OPENAI_REALTIME_MODEL`; optionally `OPENAI_REALTIME_VOICE` and the `OPENAI_*_PRICE_*` prices. Then `deploy/vm/up.sh` again.
3. On a phone, as Sharma: tap the mic, say "Mehta Traders ka bill banao, AMC visit teen hazaar paanch sau", and check the form opens filled, the ring moves, and "Bill banao" is lit but not pressed. On Poocho ask "Mehta ka pichla bill kitne ka tha?" and check the cited record opens.
4. Run the whole Playwright suite on the VM ("every journey green on the VM"), then `npm run review:stage -- 9`, and push the tags.
5. **For Stage 10 (sign-in), the one IAM ask**: Firebase phone OTP's Admin calls run as the VM's service account. Please grant that account the role **Firebase Authentication Admin** (`roles/firebaseauth.admin`) on project `teak-inquiry-511711-p2`, from your own login. The build agent never changes IAM. Until then sign-in stays `AUTH_MODE=switcher`.
