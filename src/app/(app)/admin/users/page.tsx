import type { Metadata } from "next";
import { pool } from "@/server/db";
import { now } from "@/server/clock";
import { requirePageUser } from "@/server/auth/session";
import { listUsers } from "@/server/services/users";
import { listDelegations, listTeams } from "@/server/services/teams";
import { Card, PageHeader } from "@/components/ui";
import { UsersAdmin } from "./users-admin";
import { TeamsAdmin } from "./teams-admin";
import { Delegations } from "../../delegations";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const admin = await requirePageUser(["ADMIN"]);
  const db = pool();
  const [users, n, teams, delegations] = await Promise.all([listUsers(), now(db), listTeams(db), listDelegations(admin)]);
  const supervisors = users.filter((u) => u.role === "SUPERVISOR" && u.active).map((u) => ({ id: u.id, name: u.displayName }));
  return (
    <>
      <PageHeader title="User management" subtitle="Who can sign in, in which role, in which team, and the assignment period for each service personnel. Accounts are deactivated, never deleted." />
      <UsersAdmin users={users} selfId={admin.id} today={n.date} teams={teams.map((t) => ({ id: t.id, name: t.name }))} />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Teams"><TeamsAdmin teams={teams} supervisors={supervisors} /></Card>
        <Card title="Approval delegations"><Delegations delegations={delegations} supervisors={supervisors} selfId={admin.id} today={n.date} isAdmin /></Card>
      </div>
    </>
  );
}
