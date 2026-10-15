# Stage 1 — the operator's answers

On 15 Oct 2026 the operator wrote "continue build for next 12 hours" after the round-3 reviews, without a separate "— APPROVED" line. The build agent takes that as the go-ahead past the Stage 1 gate on the proposals below (each is the proposal the report made); the operator can overturn any of them in a later stage with "Run Stage 1 again" and the changed answer.

| #   | Question                                                              | Answer                                                               |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Short setup path; PAN/UPI/city/signature on the review screen and Aap | Accepted; the signature is asked again before the first bill is sent |
| 2   | First bill carries the name inline; "Naya customer" keeps its screen  | Keep both                                                            |
| 3   | Kitna defaults to 1                                                   | Keep                                                                 |
| 4   | Inactive tabs show their icon only                                    | Keep                                                                 |
| 5   | Harmony's Home shows two folders                                      | Keep, with the peeks                                                 |
| 6   | GST rate chips from the rule pack by date, unverified until Stage 3   | Keep; Stage 3 verifies                                               |
| 7   | Accountant: Download yes, WhatsApp dobara no                          | As proposed                                                          |
| 8   | Poocho and the contract helper reached from Aap, not Home             | Keep Home to three cards                                             |

Baselines: `tests/e2e/__screenshots__` and `design/screens/<theme>/v2-*.png` as of the round-4 commit are the approved screens (I10); later stages change the data behind them, never the design.
