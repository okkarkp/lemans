import type { Metadata } from "next";
import { requirePageUser } from "@/server/auth/session";
import { listPending } from "@/server/services/leave";
import { liveTeamView } from "@/server/services/pmo";
import { Card, Empty, PageHeader } from "@/components/ui";
import { longDate } from "@/lib/format";
import { LeaveDecision } from "./leave-decision";
import { LiveTeam } from "../live-team";

export const metadata: Metadata = { title: "Approvals" };

export default async function SupervisorPage() {
  await requirePageUser(["SUPERVISOR"]);
  const [pending, live] = await Promise.all([listPending(), liveTeamView()]);
  return (
    <>
      <PageHeader title="Approvals and live view" subtitle={longDate(live.now.date)} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Leave awaiting your approval (${pending.length})`}>
          {pending.length === 0 ? <Empty>Nothing waiting for approval.</Empty> : (
            <ul className="divide-y divide-line">{pending.map((r) => <li key={r.id} className="py-4 first:pt-0 last:pb-0"><LeaveDecision request={r} /></li>)}</ul>
          )}
        </Card>
        <Card title="Who is working today"><LiveTeam rows={live.rows} /></Card>
      </div>
    </>
  );
}
