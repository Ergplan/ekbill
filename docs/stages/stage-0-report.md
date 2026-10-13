# Stage 0 — Ground: report

**Status: built and verified in the build container; the VM-only parts wait for the operator** (section "On the VM" below). No product feature and no screen flow were built; that is Stage 1.

## What exists now

- **Repository** `Ergplan/ekbill`, `main`, tagged `stage-0-start` at the docs-only commit before this stage's work. Layout as master prompt 5.1: npm workspaces (`design`, `packages/*`, `apps/*`), TypeScript 5.9 strict with one root `tsconfig.json`, ESLint 10 flat config (engine purity rules; model-endpoint `fetch` only in `packages/ai`), Prettier, vitest 5 (unit + integration projects), Playwright (phone 390px Pixel 7 and desktop 1280px), Drizzle with an empty schema and `0000_ground.sql` (`pgcrypto`, `vector`; `schema_migrations` is created by `packages/db/migrate.mjs` under an advisory lock), `scripts/local-postgres.sh` (port 5440, `ekbill2_dev`, `ekbill2_test`).
- **`@ekbill/design`** is a workspace package; tokens are imported from it (`themes.css`, `fonts.css`), fonts copied by `scripts/copy-fonts.mjs` before `dev`/`build`. Tokens added: `guide` colour and `shadow.guide` per theme, radii `tile`/`chip`/`small`/`tip` (tokens.json 1.2.0; `build.py` regenerated `themes.css` and `tokens.ts`).
- **`packages/ui`**: every component in `design/components.md` plus v2's additions (TabBar with centre mic, GuideHighlight, SignaturePad, ConfidenceField, CheckStrip, SeriesChip, FilterChips, ShareToggle, MakeBar), tokens only, both themes. `/kit` renders them all from `design/fixtures/demo.json` with a theme switch and a tour button (`data-testid="kit-tour"`) that walks the `data-guide` ids.
- **Watcher** `scripts/watch.mjs` (5.2): eslint → prettier → tsc → vitest unit (changed package, then all) → drizzle-kit check → rules:check → tokens:check → trace:check → flow:check → integration (when `packages/db` or `apps/web/actions` changed, or with `--once`). Writes `.watch/status.json` and `.watch/log`; stops at the first red.
- **Review loop** `scripts/review-stage.mjs` (rule 12): four inputs, fixed checklist (a)–(f), one VERDICT line, written to `docs/stages/stage-N-review-k.md`; `--check-model` confirms `OPENAI_REVIEW_MODEL` against the account's models list; `--dry` builds the prompt without a call. Unit-tested with a stubbed model on a throwaway git repository.
- **Checks**: `tokens:check` (exact patterns of 5.2, `tokens-allow.txt` with reasons), `rules:check` (rule-pack shape; vacuous until Stage 3), `trace` → `docs/FIELD-TRACE.md`, `flow` → `docs/SCREEN-FLOW.md` (reads `apps/web/screens/*/manifest.ts` through tsx; empty until Stage 1), `seed` (refuses a database not named dev/test).
- **CI**: `.github/workflows/ci.yml` (push to `main`, pull requests: the watcher once with a Postgres service, build, Playwright without `@slow`); `.github/workflows/slow.yml` (`workflow_dispatch`: `@slow`, load, evals).
- **Deployment** `deploy/`: `Dockerfile` (one image: standalone web server + worker sources run by tsx + migration runner + Chromium), `docker-compose.yml` (project **`ekbill2`**: `db` → volume `ekbill2_pgdata` on 127.0.0.1:5441, `docling`, `app` on 127.0.0.1:8080, `worker`, `caddy` 80/443 with the gate), `Caddyfile`, `vm/{lib,up,backup,schedule-backup,restore,free-space,set-openai-key}.sh` (Secret Manager flow and gate password kept; project `ekbill2`; `free-space.sh` removes only this project's unused images, `--mvp` adds the stopped MVP's, never a volume, never a prune). `backup.sh` writes `deploy/vm/state/last-backup.json`; `/api/health` reports `lastBackup` with its age in hours.
- **Living documents**: `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (the 4.1 stack as dated entries, plus Stage 0 decisions), `docs/KNOWN-GAPS.md`, generated `docs/FIELD-TRACE.md` and `docs/SCREEN-FLOW.md`, `CLAUDE.md` (sections 2–5 verbatim, then the design pack's Always and trimmed Never lists under the override line), `README.md`, `.env.example`.

## Tests

| Test                                                                                                                                                      | Where                                  | Result                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| Review script: stage prompt extraction, four inputs, verdict parsing, review file naming, refusals, dry run, `.env` loading                               | `tests/unit/review-stage.test.ts` (9)  | pass                                                               |
| Scripts: tokens:check on the kit, rules:check, trace:check and flow:check agree with the committed docs, seed refuses non-dev/test                        | `tests/unit/scripts.test.ts` (5)       | pass                                                               |
| `GET /api/health` against the real test database: ok, schema tag, sign-in off, no connection string in the body; backup age from the state file           | `tests/integration/health.test.ts` (2) | pass                                                               |
| `/kit` in both themes at 390px: theme attribute, tour button, no literal colour in inline styles, visual baseline; desktop shell has no horizontal scroll | `tests/e2e/kit.spec.ts` (3)            | pass; baselines stored in `tests/e2e/__screenshots__/kit.spec.ts/` |
| `tokens:check` on the kit                                                                                                                                 | `npm run tokens:check`                 | clean (1 allowed file: the InvoicePaper CSS)                       |

### The watcher goes red and green

A deliberately failing unit test was added, `npm run watch -- --once` run, the status captured, the test removed, and the watcher run again. Not committed red.

Red (with `tests/unit/zz-deliberately-red.test.ts` present; the watcher stopped at the first red and `.watch/status.json` said `ok: false, failed: [{ name: "vitest unit", tail: … "expected 2 to be 3" }]`):

```
---- run at 2026-10-13T17:48:57.297Z
ok   eslint (4592 ms)
ok   prettier (2912 ms)
ok   tsc (4931 ms)
FAIL vitest unit (2773 ms)
RED: vitest unit
exit=1
```

Green (the file removed; every check ran):

```
---- run at 2026-10-13T17:49:12.591Z
ok   eslint (4902 ms)
ok   prettier (3114 ms)
ok   tsc (5410 ms)
ok   vitest unit (2393 ms)
ok   drizzle-kit check (1157 ms)
ok   rules:check (69 ms)
ok   tokens:check (81 ms)
ok   trace:check (70 ms)
ok   flow:check (78 ms)
ok   vitest integration (1560 ms)
GREEN
exit=0
```

### The kit against the pack's own kit sheet (reported, not gated)

Measured by `tests/e2e/kit.spec.ts` with pixelmatch (threshold 0.1) after scaling the pack's 2480-px sheet to the kit's width and comparing the overlapping height:

| Theme   | Compared area          | Differing pixels |
| ------- | ---------------------- | ---------------- |
| Narangi | 1024 × 1717 (of 12261) | 50.3 %           |
| Harmony | 1024 × 974 (of 12687)  | 69.3 %           |

The pack's `00-kit.png` is a desktop component sheet laid out in columns; the `/kit` route is one phone column. The numbers say the two pages are different compositions, not that the components differ: Stage 1 compares screen by screen against `01-login` … `07-profile`, which are phone layouts. Two defects the screenshots did show were fixed in this stage: the five-slot tab bar overflowed 390px (inactive tabs now carry their icon only; the word stays for assistive technology), and Harmony's folder peeks overlapped each other's text (fanned across the folder; only the front bill shows its words).

## Checks run in this container

- `npm run watch -- --once`: GREEN (see the demo above for the run list and timings).
- `npx next build` (apps/web): compiled; routes `/`, `/_not-found`, `/api/health`, `/kit`.
- Dev server with `DATABASE_URL=…/ekbill2_dev`: `/api/health` → `{"ok":true,…,"schema":"0000_ground.sql","lastBackup":"none"}`.
- `npm run review:stage -- 0 --dry`: builds the four-input prompt from `stage-0-start..HEAD` (size printed in the terminal; no call made here — this container has no `.env`).

## On the VM (the operator's part of Stage 0)

Done here: everything that needs no key, no disk and no Docker daemon. Still to do on `tariff-order`, in this order, each from `~/ekbill` on `main`:

1. Pastes 1–4 of `docs/MASTER-PROMPT.md` section 1 (gh, tag `mvp-final` and stop the MVP, clone, `.env`, tmux + Claude Code). Paste 2 keeps `ekbill_pgdata`.
2. `npm ci && npm run review:stage -- --check-model` → records whether `OPENAI_REVIEW_MODEL` resolves; the build agent writes the ID into `docs/DECISIONS.md`.
3. `df -h /` and `~/easybills/deploy/vm/free-space.sh` (before/after into this report). If under 15 GB: report "blocked on disk" with `docker system df`, and stop.
4. `deploy/vm/up.sh` (builds the image; needs ~8 GB) → `https://<ip-with-dashes>.sslip.io/api/health` ok with schema `0000_ground.sql`; `/kit` behind the gate.
5. `deploy/vm/schedule-backup.sh` → the 02:30 IST cron line; `deploy/vm/backup.sh` once by hand so `/api/health` shows `lastBackup`.
6. `npm run review:stage -- 0` → `docs/stages/stage-0-review-1.md`; fix findings; commit the final report.

## Questions for the operator

1. **Kaccha-bill photos for Stage 7.** Please put at least 30 real handwritten-bill photos into `tests/fixtures/bills/real/` with ground truth: for each `NNN.jpg` a `NNN.json` with `{ seller, buyer, date, lines: [{ description, qty, rate, amount }], total }` as written on the paper — or put only the photos and say so, and the build agent writes the labels for you to confirm. They are needed before Stage 7 starts; Stages 1–6 do not wait for them.
2. **The reviewer model.** After paste 3, does `npm run review:stage -- --check-model` print "resolves"? If not, the first 20 model IDs it lists tell us what to write in `.env`.
3. **Disk.** The VM had ~5 GB free at the last look. Building the v2 image needs ~8 GB. `deploy/vm/free-space.sh --mvp` removes the stopped MVP's unused images only. If that is not enough, the decision on what else to free is yours (the other products' images and build cache are not ours to touch).

## Deferred by design (master prompt 4.3)

Sign-in (`AUTH_MODE=switcher`), rate limits, OTP, CSP and the rest of 4.3 are listed in `docs/KNOWN-GAPS.md` with the stage that closes them. Nothing was added early.
