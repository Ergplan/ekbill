# Performance

What was measured, where, and what is still the VM's to measure. Budgets (master prompt Stage 10, p95):

| What                        | Budget |
| --------------------------- | ------ |
| Home                        | 400 ms |
| The bill form               | 300 ms |
| Issue, including the render | 3 s    |
| Photo read                  | 20 s   |

## Measured in the build container

Four shared cores, Postgres 16 local, a production build (`next start`), the 1/10 load seed: 50 businesses, 60,003 bills, 685 MB.

**Queries** (`node scripts/explain.mjs <url>`, on the load-test business with 1,203 documents):

| Query                                 | Execution |
| ------------------------------------- | --------- |
| The balances of a page of 500 bills   | 13.6 ms   |
| The dues, outstanding filtered in SQL | 10.7 ms   |
| The bills list, newest 500            | 6.9 ms    |
| Poocho's change scan                  | 0.8 ms    |
| A GST quarter                         | 0.5 ms    |
| The customer directory                | 0.2 ms    |

**Pages** (`tests/load/measure.mjs`; each owner walks Home, the bill form, the dues and the bills list with no pause):

| Owners at once | Home p95 | Bill form p95 | Dues p95 | Bills p95 |
| -------------- | -------- | ------------- | -------- | --------- |
| 1              | 127 ms   | 66 ms         | 123 ms   | 104 ms    |
| 5              | 372 ms   | 321 ms        | 329 ms   | 320 ms    |

**Other figures:**

| What                                             | Measured                                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Issue, including the render of the shared format | Under 3 s on a warm renderer (Stage 6 report; the first render after a restart starts Chromium) |
| The load seed                                    | About 15 ms a bill: 1/10 scale in 15 min, full scale about 2.5 h                                |
| Removing the 1/10 seed                           | 6.5 s                                                                                           |
| A dump and restore of the build's database       | 8 s; the restore check passed                                                                   |

## The gap, and its cause

The database is not the limit: every list query is under 15 ms on 60,000 documents. Pages are rendered by one Node process, so with several requests in flight latency queues on the CPU. Five owners loading pages without pause take the bill form to 321 ms (over its 300 ms budget).

The k6 scenario at full scale (`tests/load/routes.k6.js`) asks for much more:

- 50 owners making bills
- 200 owners reading dues
- 10 rendering PDFs
- all with one-second pauses

On a small VM that is CPU-bound. The levers are a second web process (if the VM has the cores) and leaner pages for the busiest routes. Caching tenant data across requests is ruled out (master prompt Stage 10).

Found and fixed by the load seed:

- **Dues past the list's limit.** Home, Dues and the directory missed old unpaid bills once a business had more than 500 bills.
- **Home and the bill form read the whole book.** They now read nine weeks and a fortnight respectively.

## Not yet measured

- **k6 on the VM**, at 1/10 scale and then, on the operator's "go", at full scale. k6 could not be installed in the build container.
- **The photo read's 20 s budget with a real model.** The build calls no model.
- **The restore drill on a real backup** (`deploy/vm/restore-drill.sh`). It records its times in `deploy/vm/state/last-restore-drill.json`.
