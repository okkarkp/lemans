import { redirect } from "next/navigation";
import { config } from "@/server/config";
import { pool } from "@/server/db";
import { now } from "@/server/clock";
import { currentUser, type Role } from "@/server/auth/session";
import { readDemoSignals } from "@/server/trust";
import { DemoBar } from "@/components/demo-bar";
import { NavLink } from "@/components/nav-link";
import { SignOutButton } from "@/components/sign-out-button";
import { NotificationBell } from "@/components/notification-bell";
import { unreadCount } from "@/server/services/notify";

const NAV: Record<Role, { href: string; label: string }[]> = {
  PERSONNEL: [{ href: "/me", label: "My day" }],
  SUPERVISOR: [{ href: "/supervisor", label: "Approvals" }, { href: "/reports", label: "Monthly report" }, { href: "/audit", label: "Audit ledger" }],
  PMO: [{ href: "/pmo", label: "Exceptions" }, { href: "/reports", label: "Monthly report" }, { href: "/audit", label: "Audit ledger" }],
  ADMIN: [{ href: "/admin/users", label: "Users" }, { href: "/audit", label: "Audit ledger" }],
};
const ROLE_LABEL: Record<Role, string> = { PERSONNEL: "Service personnel", SUPERVISOR: "IRAS supervisor", PMO: "Accenture PMO", ADMIN: "System administrator" };

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const demo = config().DEMO_MODE;
  const [n, signals] = demo ? await Promise.all([now(pool()), readDemoSignals()]) : [null, null];
  const unread = await unreadCount(user.id);

  return (
    <>
      <header className="bg-brand-deep text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-extrabold tracking-tight">LeMans <span className="text-[#d9a8ff]">2.0</span></span>
            <nav aria-label="Main" className="flex gap-1">{NAV[user.role].map((l) => <NavLink key={l.href} href={l.href}>{l.label}</NavLink>)}</nav>
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell unread={unread} />
            <div className="text-right text-sm leading-tight">
              <p className="font-semibold">{user.displayName}</p>
              <p className="text-xs text-white/70">{ROLE_LABEL[user.role]}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>
      {demo && n && signals && <DemoBar key={`${n.date}T${n.time}`} date={n.date} time={n.time} device={signals.device} network={signals.network} />}
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
      <footer className="border-t border-line bg-white py-4 text-center text-xs text-muted">
        LeMans 2.0 - Attendance, leave and billing assurance. Copyright © 2026 Accenture. All rights reserved.
      </footer>
    </>
  );
}
