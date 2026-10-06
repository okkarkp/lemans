# LeMans 2.0 - architecture notes

## Principles

1. **Evidence at source.** A day is billable because of a record made that day, not a figure
   reconstructed at month-end.
2. **The server decides.** Location, device and time are observed by the server. Nothing the
   client says about itself is trusted.
3. **Nothing is overwritten.** Attendance, corrections and accepted reports cannot be updated or
   deleted (database triggers). Every change is also an entry in a hash-chained ledger.
4. **One number.** The monthly report is computed from the same records both sides can see, and
   once IRAS accepts it, the figures are frozen as a snapshot.

## Check-in evidence

The rule is in `src/server/domain/checkin-policy.ts` and does not change between demo and pilot:

| Declared | Network seen by server | Device | Result |
| --- | --- | --- | --- |
| IRAS office | Office network | Managed WOG device | Accepted - strong evidence |
| IRAS office | Office network | Personal phone | Accepted - medium evidence |
| IRAS office | Not office | Any | Rejected |
| Work from home | Office network | Any | Rejected - select office |
| Work from home | Remote | Managed WOG device | Accepted - strong evidence |
| Work from home | Remote | Personal phone | Rejected |

Rejected attempts are recorded in the ledger too. Only the source of the signals changes
(`src/server/trust/`): in demo mode they come from the demo bar; otherwise from the gateway.

Open questions for IRAS / GovTech:

- Do all service personnel have a WOG device?
- Can the agency gateway or conditional access provide a device-compliance signal to the app?
- What are the office egress IP ranges, and can the app see the true client address?

## Day status

Every working day for every person resolves to exactly one status
(`src/server/domain/day-status.ts`): worked, leave, corrected (worked or leave), awaiting (today,
before the 12:00 alert) or gap. A gap can only be closed by a PMO correction with a written
reason. Corrections are listed on the monthly report so IRAS sees them before accepting.

## Billing rule

Billable days = worked days + days corrected to worked. Leave is excluded. Attendance rate =
billable days / (personnel x working days). Acceptance is only possible after the month ends and
with no open gaps.

## Leave and coverage

A request is checked against the coverage floor (`COVERAGE_FLOOR`, default 80%) for every working
day it covers. Pending requests count as absence, so two people cannot both pass the check for
the same days. Submissions and approvals are serialised with a database lock. The 80% default is
an assumption and must be confirmed against the tender.

## Audit ledger

Each entry stores a SHA-256 hash of its own content and the previous entry's hash. Changing or
removing any entry breaks every hash after it, and the audit screen recomputes the whole chain.
The database triggers stop the application from editing records; the chain detects anyone who
bypasses them with elevated access.

## User management

Sign-in is WOG SSO; LeMans decides what a signed-in identity may do. A System administrator
grants access and a role (service personnel, IRAS supervisor, Accenture PMO, administrator).

| Rule | Why |
| --- | --- |
| Accounts are deactivated, never deleted | Past check-ins, approvals and acceptances must stay attributable |
| Deactivation takes effect on the next request, including open sessions | The session only carries the user id; role and status are reloaded each time |
| Service personnel have an assignment period (start, optional end) | Capacity and coverage count only assigned days, so a leaver is pro-rated rather than shown as gaps |
| A period cannot exclude recorded attendance or pending/approved leave, or move within an accepted month | Prevents orphaned evidence and silent changes to agreed figures |
| An ended assignment is not reopened; a new account is created | Reopening would turn the days in between into false gaps |
| Personnel and staff accounts cannot switch type | The personnel record is the billing identity |
| An administrator cannot change or deactivate their own account; one active administrator always remains | Prevents lock-out, including when two administrators act at once |
| Changes are written to the ledger by identifier, without names | Names are personal data and can change; the ledger is permanent |

## Deployment: one container

`tini` starts the entrypoint, which runs PostgreSQL (listening on 127.0.0.1 inside the container
only) as `postgres` and the app as `app`. On first start it initialises the database and generates
the owner, application, session and job secrets into `/data/secrets` (root-only); every start
applies migrations before the app takes traffic. If either process dies, the other is stopped
cleanly and the container exits for Docker to restart. The app connects as the restricted
`lemans_app` role. Trade-off: the app cannot be scaled separately from its database; splitting
them again (or moving to a managed database) needs only a different `DATABASE_URL`.

Tested: restart keeps data and secrets; `docker stop` shuts PostgreSQL down cleanly (exit 0);
killing Node or PostgreSQL with SIGKILL recovers without data loss and the ledger still verifies;
an existing installation's dump imports and is migrated forward on first start.

## Teams, delegation and notifications

Teams decide who approves leave; SLA coverage stays contract-wide. A supervisor sees and decides
only their teams' requests, unsupervised teams, and teams delegated to them for the day. Every
event that needs attention writes an in-app notification - and, for people with an address, an
email to the outbox - in the same transaction as the event. Scheduled jobs (11:00 reminder,
alert-time missing check-in, approval reminders, month-end notice) run at most once per key.
Messages never name the leave type, because "medical" is health data and may leave by email.

## Security controls in this build

- Server-side sessions referenced by a signed (HS256), HttpOnly, SameSite=Lax cookie: 30-minute
  sliding idle timeout, 8-hour limit; ended at once by sign-out, deactivation or an administrator.
  User and role reloaded from the database on every request.
- Administrator rights need a second administrator (enforced in the app and by a database check).
- Supporting documents are type-checked by content, size-limited, immutable, served as downloads
  in a sandbox, and visible only to the requester and approvers.
- Role check on every page and every API route, on the server.
- Same-origin check on every state-changing API call.
- Input validation with Zod at every API boundary; dates validated as real calendar dates.
- Parameterised SQL throughout.
- Errors return a reference id; internal details and request bodies are not logged or returned.
- CSV export guards against spreadsheet formula injection.
- Security headers: frame-ancestors none, nosniff, referrer policy, permissions policy.
- Configuration validated at the point of use; the app refuses to run with a weak session secret.
