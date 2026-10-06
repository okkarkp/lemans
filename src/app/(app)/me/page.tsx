import type { Metadata } from "next";
import { pool } from "@/server/db";
import { requirePageUser } from "@/server/auth/session";
import { myDay, myMonth } from "@/server/services/attendance";
import { listMine, LEAVE_TYPES } from "@/server/services/leave";
import { listPersonnel } from "@/server/services/reference";
import { Card, Empty, PageHeader, StatusBadge } from "@/components/ui";
import { longDate, shortDate } from "@/lib/format";
import { CheckInPanel } from "./check-in-panel";
import { LeaveForm } from "./leave-form";

export const metadata: Metadata = { title: "My day" };

export default async function MyDayPage() {
  const user = await requirePageUser(["PERSONNEL"]);
  const personnelId = user.personnelId!;
  const [day, month, mine] = await Promise.all([myDay(personnelId), myMonth(personnelId), listMine(personnelId)]);
  const team = await listPersonnel(pool(), day.now.date);
  const count = (pred: (s: string) => boolean) => month.filter((d) => pred(d.status)).length;

  return (
    <>
      <PageHeader title={`Good ${greeting(day.now.time)}, ${user.displayName}`} subtitle={longDate(day.now.date)} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Daily check-in">
          <CheckInPanel status={day.status} attendance={day.attendance} />
        </Card>
        <Card title="Apply for leave">
          <LeaveForm today={day.now.date} backups={team.filter((p) => p.id !== personnelId).map((p) => ({ id: p.id, name: p.name }))} types={LEAVE_TYPES} />
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
          <Card title="My leave requests">
            {mine.length === 0 ? <Empty>No leave requests yet.</Empty> : (
              <ul className="divide-y divide-line">
                {mine.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span><span className="font-medium">{r.leaveType}</span><br /><span className="text-muted">{shortDate(r.startDate)} - {shortDate(r.endDate)}</span></span>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            )}
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
