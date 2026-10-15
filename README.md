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

## Layout

See `docs/ARCHITECTURE.md`. Decisions: `docs/DECISIONS.md`. What is knowingly missing: `docs/KNOWN-GAPS.md`. Stage reports and independent reviews: `docs/stages/`.

## On the VM

`deploy/vm/up.sh` (compose project `ekbill2`). Backups: `deploy/vm/backup.sh`, scheduled by `deploy/vm/schedule-backup.sh`. Never touch the other products on the machine (CLAUDE.md rule 18).
