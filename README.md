# EkBill v2

Hinglish GST billing for small Indian businesses: **bill ready, sent on WhatsApp, record updated — in seconds.** This repository is the v2 build; the specification is `docs/MASTER-PROMPT.md` and the rules for the build agent are `CLAUDE.md`.

## Run it locally

```bash
npm ci
scripts/local-postgres.sh start        # Postgres 16 + pgvector on 127.0.0.1:5440 (ekbill2_dev, ekbill2_test)
cp .env.example .env                   # fill what you have; nothing is needed for /kit
npm run db:migrate
npm run seed                           # the build's people and businesses (/dev/switch)
npm run dev                            # http://127.0.0.1:3000/dev/switch (the app), /kit, /flow
```

Checks, as CI runs them: `npm run watch -- --once` (lint, format, types, unit, drizzle, rules, tokens, copy, trace, flow, generated tests, integration), then `npm run e2e` (Playwright at 390px in both themes; it seeds the dev database first). If the dev server was killed rather than stopped, start it on a clean cache (`rm -rf apps/web/.next`): a stale Turbopack cache makes every page reload in a loop.

## The design pack

`design/` is the quality bar for how it looks: tokens (`design/tokens`, the Narangi and Harmony themes), the component notes (`design/components.md`), the reference screens and the Urbanist typeface (SIL OFL 1.1, `design/fonts/OFL-LICENSE.txt`). `packages/ui` builds from the tokens; `npm run tokens:check` refuses a colour or size that is not one; `/kit` shows every component in both themes, and the approved Stage 1 screens are the Playwright baselines.

## For an auditor

`docs/audit/`: start with `docs/audit/AUDIT-PROMPT.md`; `docs/audit/README.md` runs the whole suite from a clean clone with a throwaway Postgres and no secrets.

## Sign-in

The build runs with `AUTH_MODE=switcher` (`/dev/switch` signs in any seeded person: test data only). Phone OTP (Twilio Verify) is built and tested with a stand-in sender, and is switched on by the operator: Twilio's settings in `.env` (see `.env.example`), `deploy/vm/check-env.sh`, then `AUTH_MODE=otp` and `deploy/vm/up.sh`.

## Layout

See `docs/ARCHITECTURE.md`. Decisions: `docs/DECISIONS.md`. What is knowingly missing: `docs/KNOWN-GAPS.md`. Stage reports and independent reviews: `docs/stages/`.

## On the VM

`deploy/vm/up.sh` (compose project `ekbill2`). `deploy/vm/check-env.sh` shows which settings and keys are set, in `.env`, Secret Manager and the running containers, and whether the OpenAI key works with each model it names; it never prints a secret. Backups: `deploy/vm/backup.sh`, scheduled by `deploy/vm/schedule-backup.sh`. Never touch the other products on the machine (CLAUDE.md rule 18).
