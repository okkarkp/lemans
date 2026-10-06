import type { Metadata } from "next";
import { pool } from "@/server/db";
import { now } from "@/server/clock";
import { requirePageUser } from "@/server/auth/session";
import { listUsers } from "@/server/services/users";
import { PageHeader } from "@/components/ui";
import { UsersAdmin } from "./users-admin";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const admin = await requirePageUser(["ADMIN"]);
  const [users, n] = await Promise.all([listUsers(), now(pool())]);
  return (
    <>
      <PageHeader title="User management" subtitle="Who can sign in, in which role, and the assignment period for each service personnel. Accounts are deactivated, never deleted." />
      <UsersAdmin users={users} selfId={admin.id} today={n.date} />
    </>
  );
}
