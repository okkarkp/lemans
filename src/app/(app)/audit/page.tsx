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
  USER_CREATED: "User created", USER_UPDATED: "User updated", USER_DEACTIVATED: "User deactivated", USER_REACTIVATED: "User reactivated",
};

export default async function AuditPage(props: PageProps<"/audit">) {
  await requirePageUser(["SUPERVISOR", "PMO", "ADMIN"]);
  const page = Number((await props.searchParams).page ?? 1);
  const [data, check] = await Promise.all([ledgerPage(page), verifyLedger()]);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const current = Math.min(Math.max(1, page || 1), pages);

  return (
    <>
      <PageHeader title="Audit ledger" subtitle="Every check-in, leave decision, correction and acceptance, in order. Entries cannot be edited or deleted." />
      <div className="mb-6">
        {check.ok
          ? <Alert tone="ok"><span className="font-semibold">Chain verified.</span> {check.count} entries recomputed from the first; no record has been altered. Head hash <code className="font-mono text-xs">{check.head?.slice(0, 16)}</code></Alert>
          : <Alert tone="bad"><span className="font-semibold">Chain broken at entry #{check.brokenAt}.</span> A record was altered after it was written. Escalate to the security officer.</Alert>}
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
