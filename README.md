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

## Demo script

| Step | Sign in as | What to show |
| --- | --- | --- |
| 1 | Personnel 03 | Set the demo bar to "Personal phone" + "Remote", choose Work from home, check in: rejected. Switch to "WOG laptop": accepted, with the evidence shown. |
| 2 | Personnel 03 | Apply for leave on 29-30 Sep: the SLA check fails (coverage 66.7%). Choose 28 Sep: passes and is sent. |
| 3 | IRAS Supervisor | Approve the request. The live view shows who is in today. |
| 4 | Accenture PMO | The 12:00 alert lists who has not checked in. Follow up. Close the 15 Sep gap with a reasoned correction. |
| 5 | IRAS Supervisor | Monthly report: August is accepted and frozen; September is a draft. Set the date to 1 Oct, resolve gaps, accept. Export CSV. |
| 6 | Either | Audit ledger: every action above, chain verified. |
| 7 | System Administrator | Users: add a service personnel with a start date, edit, deactivate with a last day (access ends at once), reactivate. |

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
