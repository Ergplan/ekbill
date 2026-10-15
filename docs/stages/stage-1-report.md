# Stage 1 — Screen flow: report (approval gate)

**Status: built in the build container, every test green; waiting for the operator's answers and approval.** The next stage starts only on the line "Run Stage 2 of docs/MASTER-PROMPT.md — APPROVED". Answers go in `docs/stages/stage-1-answers.md`; "Run Stage 1 again" applies them.

## Where to look

- **`/flow`** — the review screen: 25 screen cards with a thumbnail in the current theme and the taps that leave each one (tap any card to open the real screen); the four golden paths with their counted taps and a "Walk it" button; the role matrix with "open as owner / staff / accountant"; the eight open questions with the answer the prototype builds. Theme switch top right.
- **`/dev/switch`** — become Sharma ji (owner, regular business), Ravi (staff), Meera (CA), Gupta ji (composition business) or the brand-new owner.
- **`docs/SCREEN-FLOW.md`** — the same data as text, generated from the manifests.
- **On the VM**: live at `https://34-93-186-159.sslip.io/flow` (EkBill's own VM `ekbill`, project `teak-inquiry-511711-p2`). No password in front: the gate is off by the operator's decision of 15 Oct 2026 (`EKBILL_GATE=on deploy/vm/up.sh` puts it back); sign-in is off (`AUTH_MODE=switcher`), so anyone with the link sees the seeded test data. Health: `/api/health` reports the schema and the last backup.

## What was built (I10: these are the production screens)

Every screen is `apps/web/screens/<id>/{manifest.ts,data.ts,Screen.tsx}` plus a thin route under `apps/web/app`. The screens render from `tests/fixtures/v2.json` through one typed boundary per screen (`data.ts`); Stages 4–9 re-point those loaders at repositories without touching the component tree. The fixture holds the demo business (Sharma Electricals: 12 customers, two series, 17 bills in every state, a credit note, a cancelled bill, three items), a composition business (Gupta Kirana: bills of supply), a staff member, an accountant, a brand-new owner, one photographed bill in review with per-field confidence, and one bill with a failing GST check (customer without a state).

| Screen                                    | Route                                                                  | Notes                                                                                                                                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| welcome, login, setup                     | `/welcome`, `/login`, `/setup/[step]`                                  | Phone, OTP that moves on by itself at six digits; setup one question per screen with the short path (question 1)                                                                                                   |
| home                                      | `/`                                                                    | Three cards; chips by recency (6 + "Naam dhoondo" when more than 8); staff note; accountant sees cards two and three; new owner sees "Pehla bill banao"                                                            |
| bill-start, bill, bill-done               | `/bills/new`, `/bills/new/done`                                        | Pichle jaisa hi?, KAAM cards, GST strip → sheet (Haan/Nahi, one rate or per line), CheckStrip only when a check fails, MakeBar; done: InvoicePaper, WhatsApp, PDF/Photo, Doosra size, Ghar, Isi customer ka aur ek |
| bill-view, credit-note, remind            | `/bills/[number]`, `…/credit-note`, `…/remind`                         | Paise aa gaye (Poore / Kuch hissa → amount, date, kaise), Galti ho gayi? folded (owner only), tone, language, attachment                                                                                           |
| photo                                     | `/bills/photo`                                                         | pick → reading → review with ConfidenceFields → Bill banao; "saaf nahi aayi" and "bill nahi mila"                                                                                                                  |
| bills, dues                               | `/bills`, `/dues`                                                      | filters, series chips, search; dues oldest first with both actions per row                                                                                                                                         |
| customers, customer, customer-new, import | `/customers`, `/customers/[id]`, `/customers/new`, `/customers/import` | directory, folder with peeks/timeline/details, name-first form, file import with "Pehle se hai"                                                                                                                    |
| items, item                               | `/items`, `/items/[id]`                                                | list; HSN/SAC, unit, rate, GST rate                                                                                                                                                                                |
| gst                                       | `/gst`                                                                 | regular businesses only; period, tiles, rate split, B2B list, B2C note, CA ko bhejo (not for staff)                                                                                                                |
| aap, team                                 | `/aap`, `/aap/team`                                                    | every group of 8.0 with one sticky Save (owner); invite by phone and role                                                                                                                                          |
| ask, help                                 | `/poocho`, `/help`                                                     | question box with example chips and sourced answer; the three contract choices                                                                                                                                     |
| switch, kit, flow                         | `/dev/switch`, `/kit`, `/flow`                                         | the build's door, the parts bin, the review screen                                                                                                                                                                 |

**The guide highlight (rule 17):** every section, field and button the voice can mention carries a `data-guide` id; each manifest lists them and the tour (the spoken Hinglish per id). The "Tour" button walks them with `GuideHighlight`; in Stage 1 the mic button starts or stops that same tour (no voice yet); Stage 9 hands the component to the Realtime voice. The e2e suite checks that every guide id a manifest declares as required is in the DOM on the screen's default state (ids a manifest marks optional may belong to another state) and that the tour moves from caption to caption.

**Roles (8.3):** `?as=staff|accountant` (or the switch) hides what the matrix forbids; each manifest's `hidden` lists the ids that must be absent, and the suite asserts it. Accountants cannot reach bill-making (`/bills/new`, `/bills/new/done`), remind, photo, credit note, team or help: the routes redirect, and the payment sheet never opens for them even with `?paid=1`.

## Golden paths (I9), counted by `tests/e2e/golden-path.spec.ts` on the prototype

| Path                                                    | Budget       | Counted | Sequence                                                                                                                                                                          |
| ------------------------------------------------------- | ------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) Repeat bill to a regular customer, sent on WhatsApp | 4            | **4**   | Home chip → Haan, wahi bharo → Bill banao → WhatsApp pe bhejo                                                                                                                     |
| (b) Money came in, in full                              | 3            | **3**   | Home dues row → Paise aa gaye → Poore                                                                                                                                             |
| (c) Bill from a photo                                   | ≤ 4 + picker | **3**   | Photo se bill → Photo lo (picker) → Bill banao                                                                                                                                    |
| (d) Brand-new owner, welcome → first bill on WhatsApp   | ≤ 14         | **14**  | Shuru karein · phone · Aage · code (auto) · naam · Aage · Nahi · Chalo, shuru karte hain · Pehla bill banao · customer ka naam · Kya kiya · Rate · Bill banao · WhatsApp pe bhejo |

Path (d) meets the budget only with the short setup (question 1), the inline customer name on the first bill (question 2) and Kitna defaulting to 1 (question 3). The full question chain costs 19. Path (a) timed on Playwright's Slow 3G / 4× CPU profile against the production build: **2.5 s** from the Home tap to the WhatsApp tap (budget 20 s; CI runs the timed form with `E2E_PROD=1`, the dev server runs it untimed).

## Tests

| What                                                                                                                                                                                                                  | Where                                                              | Count                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------- |
| Manifest completeness: every screen folder in the registry, every tap resolves to a route or an external door, every tour step a declared guide id, every state URL a declared state, every golden path within budget | `tests/unit/manifests.test.ts`                                     | 7                          |
| GSTIN/PAN checks and money arithmetic copied from the MVP, with their tests                                                                                                                                           | `tests/unit/engine-ids.test.ts`, `tests/unit/engine-money.test.ts` | 19                         |
| Bill draft arithmetic (one rate, per line, composition, junk input, CGST/SGST vs IGST, rates by date, setup business) and the cross-consumer agreement of form, paper and GST workings on one fixture bill            | `tests/unit/bill-compute.test.ts`                                  | 8                          |
| Every screen in both themes: guide ids in the DOM, tap labels on screen, ≤ 1 primary, no sideways scroll, visual baseline (pixelmatch 0.1, max 0.5 %)                                                                 | `tests/e2e/screens.spec.ts`                                        | 50 screens + 44 states + 2 |
| Role-hidden elements absent; the tour moves caption to caption                                                                                                                                                        | `tests/e2e/screens.spec.ts`                                        | in the above               |
| Golden-path tap counts                                                                                                                                                                                                | `tests/e2e/golden-path.spec.ts`                                    | 4                          |
| Kit baseline                                                                                                                                                                                                          | `tests/e2e/kit.spec.ts`                                            | 3                          |
| Watcher once (eslint, prettier, tsc, unit, drizzle, rules, tokens, copy, trace, flow, integration)                                                                                                                    | `npm run watch -- --once`                                          | GREEN                      |

Playwright: **106 passed** twice after the round-3 fixes (once rebuilding the baselines, once against them; golden path (a) now runs to the Web Share call, 4 taps). Baselines: `tests/e2e/__screenshots__/screens.spec.ts/` (94 PNG at device scale 2), copied as references to `design/screens/<theme>/v2-<id>.png` (50).

## Pixel difference against the pack's own PNGs (for the eye, not a gate)

Measured on the overlapping area at 780 px wide (both at device scale 2); the diff images are in `.watch/pack-diff/` on the machine that ran the suite.

| Screen    | Theme   | Pack reference | Differing pixels |
| --------- | ------- | -------------- | ---------------- |
| login     | narangi | 01-login       | 41.8 %           |
| welcome   | harmony | 01-welcome     | 43.6 %           |
| home      | narangi | 02-home        | 57.6 %           |
| home      | harmony | 02-home        | 26.4 %           |
| bill      | narangi | 03-new-bill    | 15.0 %           |
| bill-done | narangi | 04-bill-done   | 35.7 %           |
| remind    | narangi | 05-remind      | 57.0 %           |
| remind    | harmony | 05-remind      | 57.5 %           |
| gst       | narangi | 06-gst         | 43.4 %           |
| aap       | narangi | 07-profile     | 20.0 %           |
| customer  | harmony | 03-customer    | 68.4 %           |

The numbers are high because the content differs on purpose (the pack's screens carry three customers and no mic, series, filters, dues rows or the tour button; the prototype carries the fixture and 8.0's flow) and because vertical rhythm shifts after the first differing block. The components, tokens, textures and type are the pack's; the composition follows 8.0. Look at the pairs side by side on `/flow` rather than at the percentages.

## Open questions for the operator (also on `/flow` → Questions)

1. The short setup path (name → GST? → review) with PAN/UPI/city/signature offered on the review screen and on Aap. Proposal: accept; the signature is asked again before the first bill is sent.
2. The first bill carries the customer's name inline; "Naya customer" keeps its own screen for everyone after. Proposal: keep both.
3. Kitna defaults to 1. Proposal: keep.
4. Inactive tabs show their icon only. Proposal: keep.
5. Harmony's Home shows two folders (latest bills behind Kiska bill, oldest dues behind Kiske paise). Proposal: keep; drop the first folder's peeks if you prefer one.
6. GST rate chips 0/5/12/18/28/40 until Stage 3's rule pack says which apply on the bill's date. Proposal: keep until then.
7. Accountant: Download yes, WhatsApp dobara no. Proposal as stated.
8. Poocho and the contract helper have no Home entry; Aap reaches them (the mic will, from Stage 9). Proposal: keep Home to three cards.

## Independent review

`docs/stages/stage-1-review-1.md` (model `gpt-6.1-sol`, run on the VM against `stage-1-start..225660e`): **defects found**. Every code finding was fixed in the commits after it; the review reruns on the VM (`npm run review:stage -- 1`) until it reports no new code defect.

What was fixed (file in brackets):

- I4: tax is now computed only by `packages/engine/src/tax.ts#computeTax()`; each head from the taxable value at its own rate, never from a rounded sibling (the ₹0.03 case gives 0/0, not 1/0). The form, the done paper and the fixture bills all read it (`apps/web/screens/bill/compute.ts` is a thin wrapper; `paper.ts`; `bill-done`).
- I5: the selectable rates and the place-of-supply rule come from `packages/engine/rules/gst/rates.json`, selected by the bill's date (`selectableRates`, `supplyKind`); the chips on the bill form and the item screen read it. `rules:check` enforces source, effectiveFrom, a verification date on verified entries, and at most 3 unverified (all 3 are unverified until Stage 3).
- I8/roles: the payment sheet never opens for an accountant (`?paid=1` ignored); `/bills/new/done` redirects accountants.
- I9: `/kit`'s duplicates are marked `data-primary="kit"`; the test counts primaries anywhere in the DOM; path (a) is timed on Slow 3G / 4× CPU against the production build (2.5 s).
- I7: `/api/health` and `/dev/switch/[person]` carry a request id (`x-request-id`, echoed when the caller sends one) into a pino log line.
- Lint: the engine's purity rules are no longer overwritten by the model-endpoint rule (`eslint.config.mjs`).
- Drafts: an in-memory map backs sessionStorage, so typing works when storage is refused; keys are namespaced by person, so a bill never leaks across `/dev/switch`.
- Bill form: removing a line removes its own GST rate; a blank line carries no value (paper and total agree); an unsafe product shows a check instead of crashing; the new-customer screen's details reach the bill (name in the URL, phone/GSTIN/state from the draft); a brand-new owner's GST answer, GSTIN and UPI from setup shape the first bill.
- Login and setup: a 10-digit number starting with 91 is accepted (only a 12-digit `91…` loses the country code); OTP completion makes the browser the new owner (`/dev/switch/new?to=/setup/name`); the GSTIN step persists the derived PAN and city.
- Bill view: partial payments accumulate. Dues: role links keep `?as=` correctly (one `withAs` helper everywhere).
- Reminders: the direct tone fills `{days}` and `{business}`. Photo: the corrected date is kept; "Photo lo" opens the real file picker. Fixture bills across states print IGST (`INV-037`).
- `/flow` is in the screenshot suite (both themes, and 1280 px); `/kit` renders the six flow components; literal type sizes in the kit are now tokens (tokens.json 1.3.0) and `tokens:check` fails on a `px` font size; the drawn kaccha-bill SVG is listed in `tokens-allow.txt` with its reason.
- Every page reads through its screen's `data.ts` loader (round 3 added `import`, `ask`, `help` and `credit-note`); Aap reaches Poocho and the contract helper.

Findings that are not code defects of this stage, with the rationale (rule 12):

- I1, I2, I3, I6, I7 (audit rows), I8 (repository `allowedRoles`): "not established" is correct and by design. Stage 1 has no database, no issuing, no numbering allocation and no model call (its prompt forbids them); Stage 2 adds tenancy, RLS, audit and roles at the repository, Stage 3 the allocator and `issueDocument()`, Stage 7 the staging tables. `docs/KNOWN-GAPS.md` lists each with its stage.
- I10 "not established by this diff": the baselines are in `tests/e2e/__screenshots__` and `design/screens/<theme>/v2-*.png` (binary files the review's diff excludes); the operator's approval is what turns them into the gate, which is this report's purpose.
- (d) "cannot be certified without the generators": `scripts/trace.mjs`, `scripts/flow-map.mjs` and `design/tokens/build.py` are in the repository; the watcher's `trace:check`, `flow:check`, `copy:check` and `tokens:check` ran green on the commit (`.watch/status.json`); the review's diff is truncated at 700 k characters, so earlier files fall outside it.
- "every test green / 103 passed" are execution claims: the numbers come from the runs recorded here; CI (`.github/workflows/ci.yml`) reruns them on every push to `main`.
- The mic starts the tour in Stage 1 by design; Stage 9 hands the same highlight to the voice.

Round 3 (after the second review): GST workings are computed by the engine over the quarter's bills (the fixture carries only the period), half-bp rates are exact, `computeTax` takes the date and both state codes and names the state head (SGST or UTGST), document kinds and place of supply come from the rule pack, the item screen offers the pack's rates for today and shows the accountant a disabled field, every request carries a request id through `apps/web/proxy.ts`, a new customer's GSTIN reaches the paper, the draft key includes the new customer's name and the redo, cancel-and-redo starts the new bill from the cancelled one's lines, the import done step reads its count from the URL, `/flow` thumbnails follow the theme switch, `?to=` on the switch route must be a plain in-app path, and the WhatsApp buttons hand the message to the Web Share sheet (or wa.me) and are timed to that call.

## Camera, photo library and files (added 15 Oct 2026 at the operator's ask)

The app reaches the person's own things through the OS's own doors, so the OS asks for the permission and remembers it: "Photo lo" opens the phone's camera app (on a laptop, the live camera with the browser's prompt, with the library as the fallback when it is refused); "Gallery se" opens the photo library; "Files chuno" on the import screen opens the files folder (PDF, CSV, Excel, images, several at once); the logo row on Aap takes a picture from either. The picked photo is downscaled in the browser and kept in the draft, so the review shows the photo the person took; files over 10 MB are refused with the words. `packages/ui/src/files.tsx` (`FileDoor`, `CameraSheet`, `readPicked`); `tests/e2e/files.spec.ts` sets the doors' files the way the pickers would and walks the laptop camera against Chromium's fake device (5 tests, both projects). Nothing leaves the device in Stage 1 (`docs/KNOWN-GAPS.md`).

## Deferred by design

Nothing persists, no model is called, no file leaves the phone: by the Stage 1 prompt. `docs/KNOWN-GAPS.md` lists each gap with the stage that closes it.
