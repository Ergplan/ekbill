# Stage 11 — Audit pack and handover

**Status: the pack is complete. A clean clone passes the CI profile from the README alone: every check but one, which is red until the rule pack is verified (below), and 165 of 165 journeys against a production build. Tagged `v2.0.0-rc1` locally; the tag is yours to push.** Sign-in is still switched off; the VM holds test data only.

What is done:

- `docs/audit/`, every page the master prompt lists:
  - written by hand: the auditor's brief, the threat model, performance, and how to run it
  - generated and checked on every run: the data model, the test inventory, dependencies, reviews
  - copied in: the field trace, the screen flow, the known gaps, the GST rules
- coverage of the unit and integration runs
- dependency upgrades: no high or critical advisory left
- CI that runs everything and reports everything (it had been stopping early since Stage 3)
- thirty-three real defects, fixed with tests that fail without the fix:
  - The coverage runs, the clean-clone run and CI found four, one of which broke every bill link for a new business.
  - A review of what the seed never exercises found eleven: money, numbering and GST.
  - A review of the boundaries and the money's states found nine, among them credit notes past the bill and cancelled bills that kept their money.
  - A review of the worker, model output and the commits found nine, among them the voice able to record a payment and one photo made into two bills.
- the README: what EkBill is, how to run and deploy it, the design pack
- `mvp-final` resolves in Ergplan/easybills (`7173c46`)

What is not done, stated first:

- **The stage reviews for Stages 2–11 have not run.** The reviewer's key is on the VM. `REVIEWS.md` lists Stages 0 and 1 (three rounds each) and shows the rest as not reviewed. Run them before the audit: they are cheaper than the audit, and their findings are better fixed first.
- **`rules:check` is red until the rule pack is verified.** All 23 entries are `verified: false` because the build container cannot reach `*.gov.in`. `npm run rules:verify` on the VM, committed, turns it green. The auditor's README says to expect this one red.
- **Coverage leaves out the browser journeys.** They run against a separate server process. The server actions (0 %) and screens (7 %) read low for that reason; the journeys that walk them are listed in `TEST-INVENTORY.md`.

## What CI was hiding

The `checks` job on main had failed since Stage 3, at the unit step, on two tests that passed here:

- **The rate-limit proxy test** inherited CI's `RATE_WRITES_PER_MIN=0` (limits off) and expected a 429.
- **The seed's refusal test** inherited `AUTH_MODE=switcher`, which allows seeding any database, so the seed tried to connect instead of refusing.

Both now pin what they test.

The watcher stopped at its first red, so nothing after the unit step ran in CI: not the integration suite, not the build, not Playwright. That hid both problems for eight stages. The one-shot watcher now runs every check and reports every red. CI builds and walks the journeys even when a check is red, so the rule pack waiting on `rules:verify` no longer hides the rest. Two smaller changes to the CI job:

- Chromium is installed before the checks, since the integration tests render PDFs.
- The journeys get the stand-in model, as the local config gives its servers.
- The journeys get their own database. They had been set to run on the one the integration suite had just filled, where the oldest due on Home was a test's bill.

## The defect that mattered most: bill links for every new business

A bill number that carries the financial year has a slash in it: `INV-2026-27/001`. Every business made through setup gets exactly that by default (`createBusiness`: prefix `INV-`, year included). The links to a bill put the number in the path raw, so `/bills/INV-2026-27/001` matched no route. Every bill of such a business answered "Yeh mila nahi" from all of these:

- Home
- Bills
- Dues
- a customer's page
- the GST drill-down
- Poocho's citations

The voice did not recognise the bill page either. The seeded businesses number without the year, so no journey met it. The clean-clone CI run did, on a bill the numbering test had left behind.

The fix:

- `billPath()` puts the number in one encoded segment (the route already decoded it), and every link uses it.
- `billFileName()` names shared and saved files, so the reminder's attachment no longer carries a slash either.
- A unit test refuses a raw `` `/bills/${…}` `` anywhere in the product source.
- A new journey sets up a business, makes its first bill (`INV-2026-27/001`) and opens it from the list, its reminder and back. It also checks the PDF's file name.

## Found while measuring coverage

1. **Order-dependent GST test.** `gst.test.ts` hand-computes Sharma Electricals' April–June 2026. `numbering.test.ts` (the financial-year rollover) and `bills.test.ts` (an old due) issued Sharma bills in that quarter. When vitest happened to run them first, the quarter's figures changed and three GST tests failed. Reproduced by importing the files in that order. The other two now date their bills outside the quarter. The GST test refuses to start on a quarter that is not empty, naming the bills it found.
2. **Rows ordered by a column that ties.** Series, payments and a bill's credit notes were ordered by `created_at` alone. Rows made in one transaction share it (a business's first series are made together), and a tie comes back in whatever order the scan returns. That order changes when a row is rewritten. The one that matters is `documents.ts`: when a document names no series, issuing takes "the first active series of its kind", which could change from one issue to the next. `id` now breaks every such tie. The new test makes two series at the same moment and renames whichever is listed first, forcing a non-HOT update. It fails without the fix and passes with it.

## A review of what the seed never exercises

The bill-link defect had one cause: the seeded businesses never number with the year, so no test met a slash. A separate review pass (a second agent, reading and running the engine, never the databases) looked for more of that kind. It reported ten findings. Each one was verified here, reproduced, and fixed with a test that fails without the fix:

| Finding                                                                                      | Before                                                                                                                 | Now                                                                                   |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| A bill dated in an earlier year than its series had reached (a paper bill photographed late) | Restarted at 1 and moved the series back a year. Every later bill then failed on the unique number, for good           | Continues that year's numbers; the series stays put                                   |
| A series without the year restarts each April, but links named a bill by number alone        | Last year's INV-001 opened this year's: Paise aa gaye and reminders went to the wrong bill                             | Links carry `?fy=`; a prefix belongs to one series                                    |
| A tax-inclusive figure (every credit note)                                                   | 21 % of whole-bill credit notes came to a paisa more or less than the bill (60,000 measured)                           | The line total is what was entered; a full credit gives back exactly what was charged |
| gstr1.json credit notes                                                                      | At the seller's own state: an inter-State note read as intra-State                                                     | At the note's own place of supply                                                     |
| Table 13                                                                                     | One range across every series; credit notes left out                                                                   | One row per series and document type (1 and 5)                                        |
| Names in Devanagari or Tamil                                                                 | Compared as "", so equal to every other: an import kept one and silently dropped the rest; walk-ins read as duplicates | Compared in every script                                                              |
| Poocho's question in Hindi or Tamil                                                          | Vowel signs stripped: "शर्मा किराना" asked for "शर"                                                                    | Whole words                                                                           |
| "+91 098765 43210"                                                                           | Stored as `+9109876543210`, a number that does not exist                                                               | `+919876543210`; 0091 read as +91                                                     |
| The 10,000th bill of a year on the default series                                            | `INV-2026-27/10000`, 17 characters (rule 46 allows 16)                                                                 | Refused in words, nothing spent                                                       |
| "28 Dec" read off a photo on 5 January                                                       | Next December, then dropped as implausible                                                                             | Last December                                                                         |

Two more came out of the same work:

- the bills search took what was typed as an `ilike` pattern (`%` found every bill)
- the CA pack could give two documents one file name

Not changed: a link with no year (a Poocho answer quoting a bare number) still opens the newest bill with that number.

## A second review: boundaries and the money's states

A second agent read the route handlers, the actions, the uploads, the sessions and the payment and credit-note states (read only; nothing run against the databases). It reported ten findings. Each was verified here, and each fix has a test:

| Finding                             | Before                                                                                                                                                                                                       | Now                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Credit-note limit                   | Checked before the transaction, on an unlocked bill: two full notes at once both issued (200 % credited, both in GSTR-1); a credit note could be credited; staff could rewrite and issue a credit-note draft | The bill is locked while a note issues and the limit is counted under the lock; a credit note is never the "bill"; owner only, draft or not |
| Cancelling a bill with money on it  | Allowed: the money vanished with the bill (nothing due, no reversal, the redo at the full amount)                                                                                                            | Refused in words: reverse the entries first                                                                                                 |
| A cancelled bill's PDF              | Downloaded, and went into the CA pack, as the clean tax invoice with a live UPI QR                                                                                                                           | Printed afresh with CANCELLED across it and no QR, never from or into the kept files                                                        |
| Sign-in with an accepted invite     | Landed in whichever business the scan returned                                                                                                                                                               | The business the person owns, else the first joined (consent and a switcher are gaps)                                                       |
| Signing out                         | Impossible; sessions lived 30 days                                                                                                                                                                           | `POST /api/auth/logout`, and `?everywhere=1` for a lost phone (the button is a gap)                                                         |
| Imports over 10 MB                  | The proxy buffered 10 MB and cut the rest: every big import failed as "form.invalid"                                                                                                                         | Proxy buffer 40 MB; an import is 36 MB at most, refused in words on the screen and unread at the door (413)                                 |
| Chromium on GET                     | Unlimited; an accountant's prints were never kept, so each started Chromium again                                                                                                                            | 30 renders a minute per session; the accountant's prints are kept                                                                           |
| `/api/metrics` and `/api/health`    | Metrics open to anyone through Caddy; health returned the database's error text and called an unset `AUTH_MODE` "switcher"                                                                                   | Metrics on the VM itself or with `METRICS_TOKEN`; health logs the error and reports the mode the doors use                                  |
| 30 February, and "%" in a bill path | 500                                                                                                                                                                                                          | Refused at the schema; taken as written                                                                                                     |
| Model spend                         | No daily cap                                                                                                                                                                                                 | A gap                                                                                                                                       |

## A third review: the worker, model output and the commits

A third agent read the worker and its jobs, every path a model's answer takes, and the photo and import commits (read only; pure code run with the stand-in model). It reported nine findings. Each was verified here and fixed, with a test:

| Finding                       | Before                                                                                                                                                  | Now                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The voice and money           | On the open "Paise aa gaye" sheet the voice's fill could choose "Poore", which records the whole balance on the tap: a payment nobody pressed (rule 17) | A choice that commits is in the owner's region: listed OWNER-ONLY to the model, refused by the fill                                                                          |
| One photo, two bills          | Two taps (or a reload and a tap) on "Bill banao" issued two bills; corrections and commit were separate, so a failure left the reading billable again   | The reading is claimed first (one claim wins; a repeat gets the bill already made); corrections and commit in one transaction; migration `0009` adds the `committing` status |
| The photo's matched customer  | A phone match whose written name differed was dropped, and the bill went to a new customer                                                              | The match stands unless the owner types another name                                                                                                                         |
| An absurd figure in a reading | A bank account read as an amount overflowed the money: the job threw, the reading stayed pending, the screen waited for ever                            | Amounts above ₹999 crore are not amounts; an answer the engine cannot take is recorded as failed; a reading pending ten minutes shows as unavailable                         |
| One bad file in an import     | A corrupt PDF or workbook threw, and the other files' customers were lost; the first error made the import final                                        | That file is "unrecognised"; the import fails only on its last attempt                                                                                                       |
| Job expiry                    | Shorter than the longest run, so a slow run was retried while it still ran                                                                              | Above the longest run (a gap remains: handlers do not stop on expiry)                                                                                                        |
| The nightly jobs              | Walked load-test and archived businesses (embedding calls for synthetic bills)                                                                          | Real, active businesses only                                                                                                                                                 |
| Queue options                 | Whoever created a queue first set them for good                                                                                                         | The worker applies its own on every start                                                                                                                                    |
| Photo corrections             | Whatever the screen sent                                                                                                                                | Worked out on the server from the reading and the bill                                                                                                                       |

## Dependencies

| Package        | Was               | Now               | Why                                                                              |
| -------------- | ----------------- | ----------------- | -------------------------------------------------------------------------------- |
| sharp          | 0.34.5            | 0.35.5            | libvips advisories; it reads uploaded photos                                     |
| fflate         | 0.8.2             | 0.8.3             | the ZIP64 infinite loop; it reads uploaded zips                                  |
| firebase-admin | 13.5              | 14.5              | drops node-forge (signature verification advisory)                               |
| @grpc/grpc-js  | 1.9.16            | 1.14.6 (override) | two advisories, under the Firebase client's Firestore, which the app never loads |
| fflate (root)  | hoisted by chance | declared          | the tests import it                                                              |

`npm audit` now reports four moderate findings: drizzle-kit's esbuild, a development-server issue in a migration tool that never starts one. The only fix offered is a drizzle-kit downgrade, so it stays, recorded.

## Tests

| What                                                                                       | Where                                  | Count |
| ------------------------------------------------------------------------------------------ | -------------------------------------- | ----- |
| DATA-MODEL.md matches the migrated database (tables, column counts, RLS, audit)            | `tests/integration/audit-pack.test.ts` | 1     |
| Series keep their order through an update when they tie on `created_at`                    | `tests/integration/numbering.test.ts`  | +1    |
| The GST quarter is the test's own (a guard, not a case)                                    | `tests/integration/gst.test.ts`        | —     |
| Bill links and file names: encoded, slash-free, and never built raw                        | `tests/unit/bill-links.test.ts`        | 3     |
| A new business's first bill (`INV-2026-27/001`) opens from the list, its reminder and back | `tests/e2e/bills.spec.ts`              | +1    |

Totals: vitest 775 (unit 512, integration 263), Playwright 165 (Stage 1 baselines unchanged).

## The clean-clone run

The CI `checks` job, step by step, from `git clone` of `de3ea24` (the last code change), in a temporary directory:

- no `node_modules`, no `.next`, no `.env`
- Postgres 16 with pgvector on 5440, nothing else
- CI's environment, and no secret

| Step                                                                          | Result                                                                                             |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `npm ci`                                                                      | ok                                                                                                 |
| `npm run watch -- --once`                                                     | 13 of 14 checks green; integration 263 of 263. Red: `rules:check` (the 23 unverified rule entries) |
| `npm run build`                                                               | ok                                                                                                 |
| Migrate and seed a fresh journeys database, start `next start` and the worker | ok                                                                                                 |
| `npx playwright test` against the production build                            | 165 of 165                                                                                         |

The run was repeated after every batch of fixes. Each earlier round found something:

1. **Round 1** found the bill links: 162 of 163, the one failing on a slashed number.
2. **Round 2** found that the new journey left Naya owner with a business before golden path (d).
3. **Round 3** was green, before the two reviews.
4. **Round 4**, after the first review's link changes, found two journeys still expecting a link without the year.
5. **Rounds 5 and 6**, after each review's fixes, were green. Round 6 is the table above.

The script that ran it mirrors `.github/workflows/ci.yml`. The VM run the master prompt asks for is the same commands, in a temporary directory on the VM: `docs/audit/README.md` steps 1–3.

## What to tell the auditor

Send them the repository at `v2.0.0-rc1` and this, in your words or these:

> EkBill v2 is a GST billing app for very small Indian businesses, phone first, in Hinglish. Start with `docs/audit/AUDIT-PROMPT.md`: it says what we want assessed (security, correctness, GST compliance against our rule pack, tenancy, data integrity, operability, code quality, and the UI against the design pack), lists the ten invariants and where each is enforced, and says what to send back: each finding with severity, `file:line`, a reproduction and a fix, then what you did not cover. `docs/audit/README.md` runs everything from a clean clone with a throwaway Postgres and no secrets. Expect one red check, `rules:check`: the rule pack's sources have not been re-fetched from the official sites yet. We know about everything in `docs/audit/KNOWN-GAPS.md` and `THREAT-MODEL.md`'s weak points; tell us if any of them is worse than we say. Sign-in in the build is a switcher that signs anyone in, on purpose, on test data; phone OTP is built and tested against the Firebase emulator and is off. We care most about tenancy (can one business ever see or change another's books), the money and tax on an issued bill, and anything an unauthenticated person can do.

Before you send it:

1. Run the stage reviews for 2–11 on the VM (`npm run review:stage -- N`) and fix what they find. `npm run audit:pack` then refreshes `REVIEWS.md`.
2. Run `npm run rules:verify` on the VM and commit, so `rules:check` is green.
3. Push the tag: `git push origin v2.0.0-rc1`. The build container cannot push tags.

## For the operator

1. On the VM, run `git pull` and `deploy/vm/up.sh`. It applies `0009_extraction_committing.sql`. The image picks up sharp 0.35.5 and firebase-admin 14.
2. On the VM, run `npm run review:stage -- 2` through `-- 11`. Then run `npm run rules:verify`, `npm run audit:pack`, and commit.
3. From the VM or any clone, run `git push origin v2.0.0-rc1`. Then hand the auditor the brief above.
4. Carried over from Stage 10: the restore drill, the load run at 1/10 (and the full run on "go"), and phone OTP when you want sign-in on. The steps are in `stage-10-report.md`.
