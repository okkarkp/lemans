# LeMans 2.0 - attendance, leave and billing assurance

A working demonstration of LeMans 2.0: daily check-in backed by server-verified evidence, leave
requests with a live service level agreement (SLA) coverage check, a Project Management Office
(PMO) exception view, a monthly billing report that the Authority accepts in the app, and an
append-only, hash-chained audit ledger.

> Demo build. Single sign-on (SSO), device posture and the clock are simulated. All people are
> fictional placeholders. See "From demo to pilot" below before using it anywhere shared.

## Run it

Needs Node.js 24 and Docker.

```bash
npm install
npm run setup        # creates .env.local with a generated session secret
npm run db:up        # starts PostgreSQL 16 on localhost:5434
npm run db:migrate
npm run db:seed      # August 2026 accepted, September 2026 in progress, clock at 22 Sep 12:30
npm run dev          # http://localhost:3100
```

`npm run db:reset` drops and reseeds everything (demo mode only).

## Run as a single container

The image contains the app and its PostgreSQL database. All state - database files and the secrets
generated on first start - lives in the volume mounted at `/data`.

```bash
docker build -t lemans2 .
docker run -d --name lemans2 -p 127.0.0.1:3100:3100 -v lemans2-data:/data -e DEMO_MODE=true -e SEED_DEMO_DATA=true lemans2
```

Operations run inside it with `docker exec lemans2 lemans <command>`:

| Command | What it does |
| --- | --- |
| `migrate` | Applies pending migrations (also runs on every start) |
| `seed --yes` | Replaces all data with the demo scenario |
| `verify-ledger` | Full verification of the audit ledger |
| `backup > file.dump` | Logical backup to stdout |
| `restore-test < file.dump` | Restores a backup into a scratch database and verifies it |
| `run-jobs` | Runs due reminders and alerts, sends queued email |
| `psql` | Database console |

To move an existing installation in, place its `pg_dump -Fc` output at `/data/import.dump` before
the first start. Deployment files for a host with nginx and cron are in `deploy/`.

## Demo script

| Step | Sign in as | What to show |
| --- | --- | --- |
| 1 | Personnel 03 | Set the demo bar to "Personal phone" + "Remote", choose Work from home, check in: rejected. Switch to "WOG laptop": accepted, with the evidence shown. |
| 2 | Personnel 03 | Apply for leave on 29-30 Sep: the SLA check fails (coverage 66.7%). Choose 28 Sep: passes and is sent. |
| 3 | IRAS Supervisor | Approve the request. The live view shows who is in today. |
| 4 | Accenture PMO | The 12:00 alert lists who has not checked in. Follow up. Close the 15 Sep gap with a reasoned correction. |
| 5 | IRAS Supervisor | Monthly report: August is accepted and frozen; September is a draft. Set the date to 1 Oct, resolve gaps, accept. Export CSV. |
| 6 | Either | Audit ledger: every action above, chain verified. |
| 7 | System Administrator | Users: add a service personnel with a team and start date, set entitlements, deactivate with a last day (access ends at once), sign someone out everywhere, import from CSV, maintain public holidays. |
| 8 | System Administrator 2 | Approve the administrator rights requested by the first administrator (four eyes). |
| 9 | Personnel 01 | Half-day leave, medical leave with certificate upload, withdraw a request; the bell shows notifications. |
| 10 | Accenture PMO | Excel and printable PDF of the report; record the invoice for an accepted month; download the ledger digest. |

## Quality gates

```bash
npm run test:all          # everything below, in order
npm run lint
npm run typecheck
npm test                  # unit: business rules (Vitest)
npm run test:integration  # services against a real PostgreSQL test database, including race conditions
npm run test:e2e          # production build in Chrome: user journeys, security, accessibility (Playwright + axe)
```

## Structure

| Path | Purpose |
| --- | --- |
| `src/server/domain/` | Pure business rules: calendar, check-in policy, coverage, day status, report, hash chain. Fully unit tested. |
| `src/server/services/` | Use cases. Each state change and its ledger entry are written in one transaction. |
| `src/server/trust/` | Where check-in evidence comes from. Demo and gateway implementations behind one function. |
| `src/server/auth/` | Signed, HttpOnly session cookie; role checks on every page and API call. |
| `src/app/api/` | JSON API. Same-origin check on every state-changing call; uniform error envelope with a request id. |
| `src/app/(app)/` | Screens for service personnel, IRAS supervisor and Accenture PMO. |
| `db/migrations/` | Plain SQL schema, including triggers that make evidence tables append-only. |

Design notes are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## From demo to pilot

| Area | Demo | Needed for a pilot |
| --- | --- | --- |
| Sign-in | Identity picker | WOG SSO via OpenID Connect (OIDC); confirm which identity provider contractors may use |
| Device evidence | Demo bar setting | Device-compliance signal from the agency gateway or conditional access |
| Network evidence | Demo bar setting | Office egress IP ranges in `OFFICE_CIDRS`; gateway must overwrite `X-Forwarded-For` |
| Clock | Settable | Real time (set `DEMO_MODE=false`) |
| Hosting | Local Docker | Government Commercial Cloud (GCC), managed PostgreSQL, secrets in the platform secret manager |
| Ledger | Hash chain in the database | Also anchor the head hash outside the database daily; separate database roles so the app cannot disable triggers |
| Public holidays | One entry seeded | Load the gazetted list each year |
| Tests | Unit, integration and end-to-end suites | Add load testing and a penetration test before go-live |
