import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/server/auth/session";
import { ledgerPage, verifyLedger } from "@/server/services/audit";
import { Alert, Card, PageHeader } from "@/components/ui";
import { dateTimeSgt } from "@/lib/format";

export const metadata: Metadata = { title: "Audit ledger" };

const EVENT_LABEL: Record<string, string> = {
  CHECK_IN: "Check-in", CHECK_IN_REJECTED: "Check-in rejected", LEAVE_REQUESTED: "Leave requested",
  LEAVE_APPROVED: "Leave approved", LEAVE_REJECTED: "Leave rejected", FOLLOW_UP: "PMO follow-up",
  DAY_CORRECTED: "Day corrected", REPORT_ACCEPTED: "Report accepted",
  LEAVE_WITHDRAWN: "Leave withdrawn", LEAVE_CANCELLED: "Leave cancelled", ATTACHMENT_ADDED: "Document added", ENTITLEMENT_SET: "Entitlement set",
  TEAM_CREATED: "Team created", TEAM_UPDATED: "Team updated", DELEGATION_CREATED: "Delegation created", DELEGATION_REVOKED: "Delegation revoked",
  ADMIN_GRANT_REQUESTED: "Admin rights requested", ADMIN_GRANT_APPROVED: "Admin rights approved", ADMIN_GRANT_REJECTED: "Admin rights rejected",
  SESSIONS_REVOKED: "Sessions ended", USERS_IMPORTED: "Users imported", HOLIDAY_ADDED: "Holiday added", HOLIDAY_REMOVED: "Holiday removed",
  INVOICE_RECORDED: "Invoice recorded",
  USER_CREATED: "User created", USER_UPDATED: "User updated", USER_DEACTIVATED: "User deactivated", USER_REACTIVATED: "User reactivated",
};

export default async function AuditPage(props: PageProps<"/audit">) {
  await requirePageUser(["SUPERVISOR", "PMO", "ADMIN"]);
  const sp = await props.searchParams;
  const page = Number(sp.page ?? 1);
  const full = sp.verify === "full";
  const [data, check] = await Promise.all([ledgerPage(page), verifyLedger({ full })]);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const current = Math.min(Math.max(1, page || 1), pages);

  return (
    <>
      <PageHeader title="Audit ledger" subtitle="Every check-in, leave decision, correction and acceptance, in order. Entries cannot be edited or deleted." />
      <div className="mb-6">
        {check.ok
          ? <Alert tone="ok"><span className="font-semibold">Chain verified.</span> {check.full ? `All ${check.count} entries recomputed from the first.` : `${check.count} entries; recomputed from checkpoint #${check.from}.`} No record has been altered. Head hash <code className="font-mono text-xs">{check.head?.slice(0, 16)}</code></Alert>
          : <Alert tone="bad"><span className="font-semibold">Chain broken at entry #{check.brokenAt}.</span> A record was altered or removed after it was written. Escalate to the security officer.</Alert>}
        <p className="mt-2 text-xs text-muted">
          Last full verification: {check.lastFull ? dateTimeSgt(check.lastFull) : "not yet run"}.{" "}
          {!full && <Link href="/audit?verify=full" className="font-semibold text-brand-dark underline">Run a full verification now</Link>}
        </p>
      </div>
      <div className="mb-6">
        <Card title="Export for auditors">
          <form method="get" action="/api/audit/export" className="flex flex-wrap items-end gap-3 text-sm">
            <label className="text-muted">From<input name="from" type="date" required className="mt-1 block rounded-lg border border-line px-3 py-2 text-ink" /></label>
            <label className="text-muted">To<input name="to" type="date" required className="mt-1 block rounded-lg border border-line px-3 py-2 text-ink" /></label>
            <button type="submit" className="rounded-lg bg-brand px-4 py-2 font-semibold text-white">Download CSV</button>
            <a href="/api/audit/digest" className="font-semibold text-brand-dark underline">Download today&apos;s digest</a>
          </form>
          <p className="mt-2 text-xs text-muted">The digest records the entry count and the latest hash. Keep it outside this system (for example, filed with the monthly report): any later change to history will no longer match it.</p>
        </Card>
      </div>
      <Card title={`Entries (${data.total})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                {["#", "Business time (SGT)", "Event", "Actor", "Detail", "Hash"].map((h) => <th key={h} scope="col" className="px-2 py-2 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.rows.map((e) => (
                <tr key={e.seq} className="align-top">
                  <td className="px-2 py-2 font-mono text-xs">{e.seq}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-xs">{dateTimeSgt(e.occurredAt)}</td>
                  <td className="whitespace-nowrap px-2 py-2 font-medium">{EVENT_LABEL[e.eventType] ?? e.eventType}</td>
                  <td className="px-2 py-2 text-xs">{e.actorId}</td>
                  <td className="px-2 py-2 font-mono text-xs text-muted">{detail(e.payload)}</td>
                  <td className="px-2 py-2 font-mono text-xs" title={e.hash}>{e.hash.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">Page {current} of {pages}</span>
          <span className="flex gap-2">
            {current > 1 && <Link className="rounded border border-line px-3 py-1 hover:border-brand" href={`/audit?page=${current - 1}`}>Newer</Link>}
            {current < pages && <Link className="rounded border border-line px-3 py-1 hover:border-brand" href={`/audit?page=${current + 1}`}>Older</Link>}
          </span>
        </nav>
      </Card>
    </>
  );
}

function detail(p: Record<string, unknown>): string {
  return Object.entries(p).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`).join("  ");
}
