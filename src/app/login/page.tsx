import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { config } from "@/server/config";
import { pool } from "@/server/db";
import { currentUser, homeFor } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(homeFor(user.role));
  if (!config().DEMO_MODE) notFound(); // production sign-in is the WOG SSO redirect, not this page
  const r = await pool().query("SELECT id, display_name, role FROM app_user WHERE active ORDER BY role DESC, id");
  const users = r.rows.map((u) => ({ id: u.id as string, name: u.display_name as string, role: u.role as string }));

  return (
    <main className="flex flex-1 items-center justify-center bg-brand-deep px-4 py-16">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <p className="text-2xl font-extrabold tracking-tight text-brand-deep">LeMans <span className="text-brand">2.0</span></p>
        <p className="mt-1 text-sm text-muted">Attendance, leave and billing assurance</p>
        <h1 className="mt-8 text-lg font-semibold">Sign in with your government identity</h1>
        <p className="mt-1 text-sm text-muted">Simulated Whole-of-Government (WOG) single sign-on. Choose a demo identity.</p>
        <LoginForm users={users} />
      </div>
    </main>
  );
}
