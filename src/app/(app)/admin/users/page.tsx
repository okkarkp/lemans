import type { Metadata } from "next";
import { pool } from "@/server/db";
import { now } from "@/server/clock";
import { requirePageUser } from "@/server/auth/session";
import { listPendingGrants, listUsers } from "@/server/services/users";
import { listHolidays } from "@/server/services/holidays";
import { listDelegations, listTeams } from "@/server/services/teams";
import { Card, PageHeader } from "@/components/ui";
import { UsersAdmin } from "./users-admin";
import { TeamsAdmin } from "./teams-admin";
import { Delegations } from "../../delegations";
import { BulkImport, Holidays, PendingGrants } from "./admin-extras";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const admin = await requirePageUser(["ADMIN"]);
  const db = pool();
  const [users, n, teams, delegations, grants] = await Promise.all([listUsers(), now(db), listTeams(db), listDelegations(admin), listPendingGrants()]);
  const year = Number(n.date.slice(0, 4));
  const holidays = await listHolidays(year);
  const supervisors = users.filter((u) => u.role === "SUPERVISOR" && u.active).map((u) => ({ id: u.id, name: u.displayName }));
  return (
    <>
      <PageHeader title="User management" subtitle="Who can sign in, in which role, in which team, and the assignment period for each service personnel. Accounts are deactivated, never deleted." />
      {grants.length > 0 && (
        <div className="mb-6"><Card title={`Administrator rights waiting for approval (${grants.length})`}><PendingGrants grants={grants} selfId={admin.id} /></Card></div>
      )}
      <UsersAdmin users={users} selfId={admin.id} today={n.date} teams={teams.map((t) => ({ id: t.id, name: t.name }))} />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Teams"><TeamsAdmin teams={teams} supervisors={supervisors} /></Card>
        <Card title="Approval delegations"><Delegations delegations={delegations} supervisors={supervisors} selfId={admin.id} today={n.date} isAdmin /></Card>
        <Card title="Bulk import"><BulkImport /></Card>
        <Card title={`Public holidays ${year}`}><Holidays holidays={holidays} year={year} today={n.date} /></Card>
      </div>
    </>
  );
}
