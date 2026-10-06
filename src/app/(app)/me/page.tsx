import type { Metadata } from "next";
import { pool } from "@/server/db";
import { requirePageUser } from "@/server/auth/session";
import { myDay, myMonth } from "@/server/services/attendance";
import { listMine, LEAVE_TYPES } from "@/server/services/leave";
import { balances } from "@/server/services/entitlements";
import { listPersonnel } from "@/server/services/reference";
import { Card, PageHeader } from "@/components/ui";
import { longDate } from "@/lib/format";
import { MyRequests } from "./my-requests";
import { CheckInPanel } from "./check-in-panel";
import { LeaveForm } from "./leave-form";

export const metadata: Metadata = { title: "My day" };

export default async function MyDayPage() {
  const user = await requirePageUser(["PERSONNEL"]);
  const personnelId = user.personnelId!;
  const [day, month, mine] = await Promise.all([myDay(personnelId), myMonth(personnelId), listMine(personnelId)]);
  const team = await listPersonnel(pool(), day.now.date);
  const bal = await balances(personnelId, Number(day.now.date.slice(0, 4)));
  const count = (pred: (s: string) => boolean) => month.filter((d) => pred(d.status)).length;

  return (
    <>
      <PageHeader title={`Good ${greeting(day.now.time)}, ${user.displayName}`} subtitle={longDate(day.now.date)} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Daily check-in">
          <CheckInPanel status={day.status} attendance={day.attendance} />
        </Card>
        <Card title="Apply for leave">
          <LeaveForm today={day.now.date} backups={team.filter((p) => p.id !== personnelId).map((p) => ({ id: p.id, name: p.name }))} types={LEAVE_TYPES}
            remaining={Object.fromEntries(bal.map((b) => [b.leaveType, b.remaining]))} />
        </Card>
        <div className="space-y-6">
          <Card title="This month so far">
            <dl className="grid grid-cols-3 gap-3 text-center">
              {[["Worked", count((s) => s === "WORKED" || s === "CORRECTED_WORKED")], ["Leave", count((s) => s === "LEAVE" || s === "CORRECTED_LEAVE")], ["Gaps", count((s) => s === "GAP")]].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-canvas p-3"><dt className="text-xs text-muted">{k}</dt><dd className="text-2xl font-bold text-brand-deep">{v}</dd></div>
              ))}
            </dl>
            <ol className="mt-4 grid grid-cols-7 gap-1" aria-label="Day by day">
              {month.map((d) => (
                <li key={d.date} title={`${longDate(d.date)}: ${d.status}`}
                  className={`flex h-8 items-center justify-center rounded text-xs font-medium ${dayClass(d.status)}`}>
                  {Number(d.date.slice(8))}<span className="sr-only"> {d.status}</span>
                </li>
              ))}
            </ol>
          </Card>
          <Card title={`Leave balance ${day.now.date.slice(0, 4)}`}>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-muted">
                {["Type", "Entitled", "Taken", "Pending", "Left"].map((h) => <th key={h} scope="col" className="py-1 font-semibold">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-line">
                {bal.map((b) => (
                  <tr key={b.leaveType}>
                    <td className="py-1.5">{LEAVE_TYPES[b.leaveType]}</td><td>{b.entitled}</td><td>{b.approved}</td><td>{b.pending}</td>
                    <td className="font-bold text-brand-deep">{b.remaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card title="My leave requests">
            <MyRequests requests={mine} today={day.now.date} />
          </Card>
        </div>
      </div>
    </>
  );
}

const greeting = (t: string) => (t < "12:00" ? "morning" : t < "18:00" ? "afternoon" : "evening");
function dayClass(s: string) {
  if (s === "WORKED") return "bg-ok-tint text-ok";
  if (s === "LEAVE" || s === "CORRECTED_LEAVE") return "bg-brand-tint text-brand-deep";
  if (s === "CORRECTED_WORKED") return "bg-warn-tint text-warn";
  if (s === "GAP") return "bg-bad-tint text-bad";
  if (s === "NON_WORKING" || s === "NOT_ASSIGNED") return "text-muted";
  return "bg-canvas text-muted";
}
