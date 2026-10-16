# Stage 10 — 500 businesses

**Status: built and tested in the build container (parts 1–3). The full load run, the restore drill on real backups and turning phone OTP on are the VM's and the operator's.** Sign-in is switched off; do not put a real business's books here yet.

What is done:

- the load seed and its removal
- the five slowest queries checked on 60,000 documents
- two fixes the load seed found
- `/api/metrics`, and the queue in `/api/health`
- rate limits with Hinglish messages
- the restore drill and the weekly disk log
- pool sizing and worker concurrency
- the k6 script and its workflow_dispatch job
- phone OTP sign-in, built and tested on the Firebase Auth emulator, off until you turn it on

What is not done, stated first:

- **Phone OTP is built but not on.** Turning it on is yours (below): the Firebase project's web config in `.env`, the **Firebase Authentication Admin** role for the VM's service account (asked in the Stage 9 report), and `AUTH_MODE=otp`. The rollback is one line: `AUTH_MODE=switcher` in `.env`, then `deploy/vm/up.sh`.
- **The k6 run is not done.** k6 cannot be installed in the build container (the download is refused). The figures below are `tests/load/measure.mjs`, run against a production build at 1/10 scale. The full run waits for the operator to say "go".
- **The restore drill has not run on a real backup.** The build has no bucket. The check it runs (`scripts/restore-check.mjs`) passed on a dump of the build's database, restored in 8 s.

## What exists

**Load seed** (`packages/db/src/load.ts`, migration `0008_scale.sql`):

- Businesses are tagged `load_test`. Each has 40 customers and 30 bills per customer.
- Bills go through `issueDocument`, so their snapshots, numbering and audit trail are real. Most bills older than a month are paid.
- The seed is idempotent and carries on from a half-done business.
- Before it starts, it estimates the disk it needs (10 KB per document, measured) and refuses if that would leave less than 8 GB free.
- `removeLoad` deletes only load-test businesses and the rows that name them. The no-delete and audit triggers are off for that one transaction.
- Run it as the worker's `load-seed` and `load-remove` jobs, or by hand: `apps/worker/src/load/cli.ts plan | seed | remove | send`.

Here, the 1/10 seed took 15 minutes for 60,003 documents (685 MB). The removal took 6.5 s and left nothing behind.

**Five slowest queries** (`node scripts/explain.mjs <url>`, on the load-test business with 1,203 documents, among 60,000):

| Query                                 | Execution |
| ------------------------------------- | --------- |
| The balances of a page of 500 bills   | 13.6 ms   |
| The dues, outstanding filtered in SQL | 10.7 ms   |
| The bills list, newest 500            | 6.9 ms    |
| Poocho's change scan                  | 0.8 ms    |
| A GST quarter                         | 0.5 ms    |

The customer directory takes 0.2 ms. The existing indexes serve every query: `documents (business_id, status, issue_date)`, `documents (business_id, customer_id)`, `payments (document_id)`, `documents (linked_document_id)`. No index was added.

**Found by the load seed, fixed:**

- **Dues past the list's limit.** Dues, Home's "paise aane hain" and the directory took the newest 500 bills, then filtered for dues. A business with 1,200 bills lost its oldest unpaid bills. Dues are now chosen in SQL before the limit. A regression test is in `tests/integration/bills.test.ts`.
- **Home and the bill form read the whole book.** They now read nine weeks and a fortnight. The balances read each bill's total, not its JSON.

**Operations:**

- `GET /api/metrics` serves Prometheus text with totals only: the process, the pool, the queue per kind, installation totals, model calls and cost, and the backup's age.
- `/api/health` adds the queue.
- `proxy.ts` limits writes to 60 a minute per session and sign-in attempts to 30 a minute per address. Over the limit it answers 429 in Hinglish with Retry-After.
- The pool is sized by `DB_POOL_MAX` (web 10, worker 5).
- The worker runs photo reads and renders two at a time.
- `deploy/vm/restore-drill.sh` and `deploy/vm/disk-log.sh` (weekly, logs only) are scheduled by `schedule-backup.sh`.
- `docker-compose.yml` passes the Stage 9 model variables to the app and the worker: the embed model, the realtime voice and the prices.

**Phone OTP** (part 3):

- The browser does Firebase's SMS code (`screens/login/firebase.ts`) and posts the ID token once to `POST /api/auth/otp`.
- The server (`server/otp.ts`, `server/firebase-admin.ts`) verifies the token as the VM's service account, with no key file. It refuses a token older than five minutes or without a phone.
- The person with that phone is found or made, their invitations are accepted, and EkBill's own session row and cookie follow: the same sessions the switcher makes. Firebase's token is not kept.
- With `AUTH_MODE=otp`, `/dev/switch` answers 404. With `switcher`, `/api/auth/otp` answers 404. The variable is the one switch.
- CI's `otp` job runs the journeys against the Auth emulator (firebase-tools and Java), never on the VM. They also ran here, against the same emulator.

## Measured here (1/10 scale, production build, 4 shared cores)

These are `tests/load/measure.mjs` figures. Each owner walks Home, the bill form, the dues and the bills list with no pause.

| Owners at once | Home p95 | Bill form p95     | Dues p95 | Bills p95 |
| -------------- | -------- | ----------------- | -------- | --------- |
| 1              | 127 ms   | 66 ms             | 123 ms   | 104 ms    |
| 5              | 372 ms   | 321 ms (over 300) | 329 ms   | 320 ms    |

The budgets are Home 400 ms and the bill form 300 ms at p95.

**The gap, with its cause.** The database is not the limit; every query is under 15 ms. The pages are rendered by one Node process, so latency grows with requests in flight. The k6 scenario at full scale (260 virtual users, one-second pauses) asks for far more rendering than one process gives on a small VM.

Options, for the operator's VM run to decide:

- a second web process, if the VM has the cores
- leaner pages for the busiest routes

## Tests

| What                                                                                                                                  | Where                               | Count |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----- |
| The plan at full scale, the 8 GB refusal, the seed idempotent through `issueDocument`, the removal touching only load-test businesses | `tests/integration/load.test.ts`    | 3     |
| Dues past the list's limit                                                                                                            | `tests/integration/bills.test.ts`   | +1    |
| `/api/metrics` gauges, no names or phones; a waiting job in metrics and health                                                        | `tests/integration/metrics.test.ts` | 2     |
| The limiter (window, bound, environment) and the proxy's 429s for sign-in and writes                                                  | `tests/unit/rate-limit.test.ts`     | 6     |

The restore check and EXPLAIN are scripts, run as above.

Totals at this commit: vitest 730, Playwright 163 (Stage 1 baselines unchanged).

## For the operator

1. On the VM, run `git pull` and `deploy/vm/up.sh` (it applies `0008_scale.sql`). Then run `deploy/vm/schedule-backup.sh` once to add the weekly disk log.
2. **Restore drill:** run `deploy/vm/restore-drill.sh`. The time is written to `deploy/vm/state/last-restore-drill.json`.
3. **Load at 1/10, whenever:** run `docker compose -p ekbill2 exec worker npx tsx --conditions=react-server apps/worker/src/load/cli.ts send seed 0.1`. When it finishes, run k6 from a machine with it installed: `k6 run -e BASE=https://34-93-186-159.sslip.io -e SCALE=0.1 tests/load/routes.k6.js`. Or run `node tests/load/measure.mjs --base … --businesses 50` on the VM. Then run `node scripts/explain.mjs` against the database. Remove the seed with `… cli.ts send remove`.
4. **The full run** (500 businesses, about 6 GB and 2.5 hours of seeding) only when you say "go".
5. **Phone OTP, when you want sign-in on:**
   1. In the Firebase console for `teak-inquiry-511711-p2`, enable Phone sign-in. Add `34-93-186-159.sslip.io` to the authorised domains. Copy the web app's config.
   2. Grant the VM's service account **Firebase Authentication Admin** (`roles/firebaseauth.admin`) from your own login. The agent never changes IAM.
   3. In `.env` on the VM, typed in nano, set `FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` and `NEXT_PUBLIC_FIREBASE_APP_ID`. These are public web values, not secrets.
   4. Set `AUTH_MODE=otp`, then run `deploy/vm/up.sh`. Sign in on a phone with your own number.
   5. **Rollback:** set `AUTH_MODE=switcher`, then run `deploy/vm/up.sh`.
