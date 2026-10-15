# Stage 1 — Screen flow: report (approval gate)

**Status: built in the build container, every test green; waiting for the operator's answers and approval.** The next stage starts only on the line "Run Stage 2 of docs/MASTER-PROMPT.md — APPROVED". Answers go in `docs/stages/stage-1-answers.md`; "Run Stage 1 again" applies them.

## Where to look

- **`/flow`** — the review screen: 25 screen cards with a thumbnail in the current theme and the taps that leave each one (tap any card to open the real screen); the four golden paths with their counted taps and a "Walk it" button; the role matrix with "open as owner / staff / accountant"; the eight open questions with the answer the prototype builds. Theme switch top right.
- **`/dev/switch`** — become Sharma ji (owner, regular business), Ravi (staff), Meera (CA), Gupta ji (composition business) or the brand-new owner.
- **`docs/SCREEN-FLOW.md`** — the same data as text, generated from the manifests.
- **On the VM**: after `git pull`, `deploy/vm/up.sh` rebuilds the image; `/flow` is then at `https://<name>/flow` behind the gate. (Not done from this container; it has no Docker daemon.)

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

**The guide highlight (rule 17):** every section, field and button the voice can mention carries a `data-guide` id; each manifest lists them and the tour (the spoken Hinglish per id). The "Tour" button and the mic walk them with `GuideHighlight`; Stage 9 hands the same component to the Realtime voice. The e2e suite checks every declared id is in the DOM and that the tour moves from caption to caption.

**Roles (8.3):** `?as=staff|accountant` (or the switch) hides what the matrix forbids; each manifest's `hidden` lists the ids that must be absent, and the suite asserts it. Accountants cannot reach bill-making, remind, photo, credit note, team or help (the routes redirect).

## Golden paths (I9), counted by `tests/e2e/golden-path.spec.ts` on the prototype

| Path                                                    | Budget       | Counted | Sequence                                                                                                                                                                          |
| ------------------------------------------------------- | ------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) Repeat bill to a regular customer, sent on WhatsApp | 4            | **4**   | Home chip → Haan, wahi bharo → Bill banao → WhatsApp pe bhejo                                                                                                                     |
| (b) Money came in, in full                              | 3            | **3**   | Home dues row → Paise aa gaye → Poore                                                                                                                                             |
| (c) Bill from a photo                                   | ≤ 4 + picker | **3**   | Photo se bill → Photo lo (picker) → Bill banao                                                                                                                                    |
| (d) Brand-new owner, welcome → first bill on WhatsApp   | ≤ 14         | **14**  | Shuru karein · phone · Aage · code (auto) · naam · Aage · Nahi · Chalo, shuru karte hain · Pehla bill banao · customer ka naam · Kya kiya · Rate · Bill banao · WhatsApp pe bhejo |

Path (d) meets the budget only with the short setup (question 1), the inline customer name on the first bill (question 2) and Kitna defaulting to 1 (question 3). The full question chain costs 19.

## Tests

| What                                                                                                                                                                                                                  | Where                                                              | Count                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------- |
| Manifest completeness: every screen folder in the registry, every tap resolves to a route or an external door, every tour step a declared guide id, every state URL a declared state, every golden path within budget | `tests/unit/manifests.test.ts`                                     | 7                          |
| GSTIN/PAN checks and money arithmetic copied from the MVP, with their tests                                                                                                                                           | `tests/unit/engine-ids.test.ts`, `tests/unit/engine-money.test.ts` | 19                         |
| Bill draft arithmetic (one rate, per line, composition, junk input, CGST/SGST vs IGST)                                                                                                                                | `tests/unit/bill-compute.test.ts`                                  | 5                          |
| Every screen in both themes: guide ids in the DOM, tap labels on screen, ≤ 1 primary, no sideways scroll, visual baseline (pixelmatch 0.1, max 0.5 %)                                                                 | `tests/e2e/screens.spec.ts`                                        | 50 screens + 44 states + 2 |
| Role-hidden elements absent; the tour moves caption to caption                                                                                                                                                        | `tests/e2e/screens.spec.ts`                                        | in the above               |
| Golden-path tap counts                                                                                                                                                                                                | `tests/e2e/golden-path.spec.ts`                                    | 4                          |
| Kit baseline                                                                                                                                                                                                          | `tests/e2e/kit.spec.ts`                                            | 3                          |
| Watcher once (eslint, prettier, tsc, unit, drizzle, rules, tokens, copy, trace, flow, integration)                                                                                                                    | `npm run watch -- --once`                                          | GREEN                      |

Playwright: **103 passed** in one run. Baselines: `tests/e2e/__screenshots__/screens.spec.ts/` (94 PNG at device scale 2), copied as references to `design/screens/<theme>/v2-<id>.png` (50).

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
8. Poocho and the contract helper have no Home entry; the mic and Aap reach them. Proposal: keep Home to three cards.

## Independent review

`npm run review:stage -- 1` needs `OPENAI_REVIEW_API_KEY`/`OPENAI_REVIEW_MODEL` in `.env`, which this container does not have. Run on the VM after `git pull` (step 6 of the Stage 0 VM steps); the diff is `stage-1-start..HEAD`. The `stage-1-start` tag exists locally at 69e14b7 and is pushed from the VM together with `stage-0-start` (this container's git proxy refuses tag pushes).

## Deferred by design

Nothing persists, no model is called, no file leaves the phone: by the Stage 1 prompt. `docs/KNOWN-GAPS.md` lists each gap with the stage that closes it.
