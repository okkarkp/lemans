import type { Metadata } from "next";
import { config } from "@/server/config";
import { requirePageUser } from "@/server/auth/session";
import { liveTeamView, pmoDashboard } from "@/server/services/pmo";
import { Alert, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { longDate, pct } from "@/lib/format";
import { FollowUpButton, GapCorrection } from "./actions";
import { LiveTeam } from "../live-team";

export const metadata: Metadata = { title: "Exceptions" };

export default async function PmoPage() {
  await requirePageUser(["PMO"]);
  const [d, live] = await Promise.all([pmoDashboard(), liveTeamView()]);
  const { MISSING_CHECKIN_ALERT_TIME: alertTime, ATTENDANCE_FLOOR: floor } = config();

  return (
    <>
      <PageHeader title="PMO exception view" subtitle={`${longDate(d.now.date)}, ${d.now.time} SGT`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Midday check">
          {!d.todayIsWorking ? <Alert tone="neutral">Not a working day.</Alert>
            : !d.alertPassed ? <Alert tone="neutral">The missing check-in alert runs at {alertTime}.</Alert>
            : d.missingToday.length === 0 ? <Alert tone="ok">Everyone is accounted for today.</Alert>
            : (
              <div className="space-y-3">
                <Alert tone="warn"><span className="font-semibold">{alertTime} alert - {d.missingToday.length} not checked in</span></Alert>
                <ul className="divide-y divide-line">
                  {d.missingToday.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="text-sm"><span className="font-semibold">{p.name}</span><br /><span className="text-muted">No check-in, no leave</span></span>
                      <FollowUpButton personnelId={p.id} done={p.followedUp} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          <div className="mt-6 border-t border-line pt-5">
            <Stat label="Month to date" value={pct(d.mtd.rate)} hint={`Attendance rate: ${d.mtd.billable} of ${d.mtd.capacity} personnel-days, against the ${pct(floor, 0)} floor`} />
            <p className="mt-3 text-xs italic text-muted">The gap is closed the same day, not discovered at month-end.</p>
          </div>
        </Card>
        <Card title={`Unexplained gaps this month (${d.gaps.length})`}>
          {d.gaps.length === 0 ? <Empty>No gaps. Every past working day is worked or accounted for.</Empty> : (
            <ul className="divide-y divide-line">
              {d.gaps.map((g) => (
                <li key={`${g.personnel.id}-${g.date}`} className="py-3 first:pt-0">
                  <GapCorrection personnelId={g.personnel.id} personnelName={g.personnel.name} workDate={g.date} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-muted">A correction needs a reason. It is written to the audit ledger and shown on the monthly report for IRAS to see.</p>
        </Card>
        <Card title="Who is working today"><LiveTeam rows={live.rows} /></Card>
      </div>
    </>
  );
}
