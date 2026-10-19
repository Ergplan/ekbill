# Threat model

What EkBill protects, from whom, across which boundaries, and which security work is knowingly deferred (master prompt section 4.3). The VM is shared with other products; the build runs with test data only until sign-in is on.

## Assets

| Asset                                                                                                                     | Where it lives                                                                                  | Why it matters                                                           |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A business's books: bills (issued snapshots), payments, credit notes, customers (names, phones, GSTINs, addresses), items | Postgres, forced RLS per business                                                               | Commercial and personal data; issued bills are tax records               |
| Photos of bills and imported files                                                                                        | Postgres (`uploads`, `import_files`), bytes                                                     | May show third parties' details                                          |
| The audit trail                                                                                                           | `audit_events`, written only by a trigger                                                       | The record of who changed what                                           |
| Sessions                                                                                                                  | `sessions` rows; an httpOnly, SameSite=Lax cookie holding the session id (Secure in production) | Whoever holds one acts as that member                                    |
| The OpenAI key                                                                                                            | `.env` on the VM or Secret Manager; read by the server and worker only                          | Billed to the product; the voice gets a ten-minute client secret instead |
| The database password and backups                                                                                         | Secret Manager; nightly dumps in a GCS bucket                                                   | Every business's books                                                   |
| The rule pack                                                                                                             | `packages/engine/rules/gst/*.json`                                                              | Wrong rules mean wrong tax on every bill                                 |

## Actors

| Actor                                                                                    | Can                                                                                           | Must not                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner                                                                                    | Everything for their business: issue, cancel, credit, money, settings, team                   | Touch another business                                                                                                                                                                   |
| Staff                                                                                    | Make bills, record money, customers, items                                                    | Settings, team, cancel, credit notes, the CA pack (repository roles, I8)                                                                                                                 |
| Accountant                                                                               | Read everything, the GST workings, the CA pack, Poocho                                        | Write anything but their own questions                                                                                                                                                   |
| An invited person, not yet signed in                                                     | Nothing                                                                                       | Act before their phone proves itself (`acceptInvites` on sign-in)                                                                                                                        |
| Signed-out visitor                                                                       | The welcome, sign-in and the demo looks on fixtures                                           | Any business data                                                                                                                                                                        |
| Another business's member                                                                | Their own business                                                                            | Anything here (I1: RLS plus the scope in every repository call)                                                                                                                          |
| A model (photo reading, Poocho, voice)                                                   | Write staging rows (`extractions`, `ai_calls`); answer in words; light up and fill the screen | Write an authoritative table (`refuse_model_actor`, `guard_extraction`, I6); press a committing button (`screens/voice/dom.ts`, deny by default)                                         |
| Text from outside (customer names, bill lines, pasted contracts, uploaded files, photos) | Be stored and rendered as text                                                                | Run as code in the PDF (Chromium with JavaScript off and the network refused, `packages/render/src/render.ts`), or steer a model (prompts say records are data; outputs are zod-checked) |
| The operator                                                                             | Run the VM, `.env`, IAM, the full load run                                                    | (out of scope)                                                                                                                                                                           |
| The build agent                                                                          | Write code, run tests; on the VM pull, deploy, review                                         | IAM, firewall, metadata, sshd, other products' containers and volumes, `docker system prune` (rule 18)                                                                                   |

## Boundaries

1. **Browser → Caddy (HTTPS)** → the app on `127.0.0.1:8080`. Caddy terminates TLS; the basic-auth gate is off at the operator's instruction.
2. **Request → app**: `proxy.ts` stamps a request id and applies rate limits. Server actions and route handlers resolve the session (`server/session.ts`) and pass a `TenantScope` to repositories.
3. **App → Postgres**: every scoped transaction runs as `ekbill_app` (owns nothing) with `app.business_id`, `app.user_id`, `app.actor_kind` and `app.request_id` set locally; forced RLS, audit and no-delete triggers apply.
4. **Worker → Postgres**: jobs act per business through the same `withTenant`, as `system` or `model`; cross-business reads return ids only (`packages/db/src/system.ts`).
5. **App/worker → OpenAI**: through `packages/ai` only (versioned prompts, zod-checked answers, one `ai_calls` row per call). The browser talks to OpenAI only for the voice, with a short-lived secret minted by the server.
6. **App → Twilio Verify (OTP)**: the server asks Twilio to SMS a code and to check the code typed; the browser only talks to EkBill. The API key secret (or auth token) lives in `.env` or Secret Manager, never in the browser or a log; the code is never stored. Indian mobiles only, per-number limits on sends and tries (SMS pumping).
7. **VM → GCS**: nightly `pg_dump` to the bucket; restore and the restore drill read it.

## Deferred security (section 4.3), current state

| Item                                                     | State now                                                                                                                            | Until           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| Phone OTP sign-in                                        | Built and tested on the emulator; off (`AUTH_MODE=switcher`) until the operator turns it on. Rollback: `AUTH_MODE=switcher`, `up.sh` | The operator    |
| Rate limits                                              | On: 60 writes a minute per session, 30 sign-in attempts a minute per address, in the web process (`apps/web/server/rate-limit.ts`)   | Done (Stage 10) |
| WAF, bot checks, secret rotation, KMS, DLP               | Not built                                                                                                                            | Later           |
| SSH restrictions, deny rules, IP allowlists, IAM changes | Never in this build (operator's instruction)                                                                                         | —               |
| Row-level security, audit log                            | On since Stage 2                                                                                                                     | —               |
| HTTPS                                                    | On (Caddy)                                                                                                                           | —               |
| Backups                                                  | Nightly; `/api/health` reports the last one's age; restore drill scripted                                                            | Done (Stage 10) |
| The basic-auth gate                                      | Off at the operator's instruction                                                                                                    | The operator    |

## Known weak points, stated for the auditor

- **Switcher mode signs anyone in.** While `AUTH_MODE=switcher`, `/dev/switch` signs in any seeded person or any phone number. That is why the VM holds test data only.
- **Rate limits are per process.** They forget on a restart.
- **Signing out has no button yet.** `POST /api/auth/logout` ends the session (`?everywhere=1` ends all of the person's). The Aap screen has no button for it until the design is approved. Sessions otherwise last 30 days; a removed member loses access on the next request.
- **Invites are accepted without asking.** The invitee's next sign-in joins them. Their own business stays first, and there is no switcher yet.
- **Metrics are local.** `/api/metrics` answers on the VM itself, or a scraper holding `METRICS_TOKEN`.
- **The voice relies on the model.** It reads the screen and is told which items are OWNER-ONLY. The refusal to press them is enforced in the browser (`dom.ts`), not by the model.
- **Poocho sends record text to the text model.** That is the business's own bills, customers and items, and only when a model is configured.
- **One dependency has open advisories, dev only.** drizzle-kit (migrations, run by the operator) pulls an esbuild with a moderate advisory against its development server, which nothing here starts. Everything else `npm audit` reported was upgraded in Stage 11: sharp (reads uploaded photos), fflate (reads uploaded zips), firebase-admin (drops node-forge), and @grpc/grpc-js pinned up under the Firebase client's Firestore, which the app does not load. `DEPENDENCIES.md` has the record.
