import type { Metadata } from "next";
import { pool } from "@/server/db";
import { requirePageUser } from "@/server/auth/session";
import { listPending } from "@/server/services/leave";
import { liveTeamView } from "@/server/services/pmo";
import { listDelegations } from "@/server/services/teams";
import { Card, Empty, PageHeader } from "@/components/ui";
import { longDate } from "@/lib/format";
import { LeaveDecision } from "./leave-decision";
import { LiveTeam } from "../live-team";
import { Delegations } from "../delegations";

export const metadata: Metadata = { title: "Approvals" };

export default async function SupervisorPage() {
  const user = await requirePageUser(["SUPERVISOR"]);
  const [pending, live, delegations, sups] = await Promise.all([
    listPending(user), liveTeamView(user), listDelegations(user),
    pool().query("SELECT id, display_name FROM app_user WHERE role = 'SUPERVISOR' AND active ORDER BY display_name"),
  ]);
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
        <Card title="Delegation">
          <Delegations delegations={delegations} supervisors={sups.rows.map((s) => ({ id: s.id, name: s.display_name }))}
            selfId={user.id} today={live.now.date} isAdmin={false} />
        </Card>
      </div>
    </>
  );
}
