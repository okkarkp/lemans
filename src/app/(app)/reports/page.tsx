import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/server/config";
import { pool } from "@/server/db";
import { now } from "@/server/clock";
import { requirePageUser } from "@/server/auth/session";
import { formatMonth, isIsoMonth, monthOf } from "@/server/domain/calendar";
import { getReport } from "@/server/services/report";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { dateTimeSgt, longDate, pct } from "@/lib/format";
import { AcceptReport } from "./accept-report";
import { InvoiceForm } from "./invoice-form";

export const metadata: Metadata = { title: "Monthly report" };

export default async function ReportPage(props: PageProps<"/reports">) {
  const user = await requirePageUser(["SUPERVISOR", "PMO"]);
  const n = await now(pool());
  const requested = (await props.searchParams).month;
  const month = typeof requested === "string" && isIsoMonth(requested) ? requested : monthOf(n.date);
  const v = await getReport(month);
  const r = v.report;
  const floor = config().ATTENDANCE_FLOOR;
  const months = recentMonths(monthOf(n.date), 4);

  return (
    <>
      <PageHeader title="Monthly report" subtitle="Auto-generated from the attendance ledger. One number, agreed by both sides before it is invoiced." />
      <nav aria-label="Report month" className="mb-4 flex flex-wrap gap-2">
        {months.map((m) => (
          <Link key={m} href={`/reports?month=${m}`} aria-current={m === month ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${m === month ? "border-brand bg-brand text-white" : "border-line bg-white hover:border-brand"}`}>
            {formatMonth(m)}
          </Link>
        ))}
      </nav>
      <Card title={`${formatMonth(month)} - ${v.acceptance ? "accepted" : v.complete ? "final draft" : "month-to-date draft"}`}
        action={
          <span className="flex gap-4 text-sm font-semibold text-brand-dark">
            <a href={`/api/reports/${month}/xlsx`} className="underline-offset-2 hover:underline">Excel</a>
            <a href={`/api/reports/${month}/csv`} className="underline-offset-2 hover:underline">Export CSV</a>
            <a href={`/print/reports/${month}`} className="underline-offset-2 hover:underline">Print / PDF</a>
          </span>
        }>
        <p className="mb-4 text-sm text-muted">
          {r.workingDays} working days{r.periodEnd ? ` up to ${longDate(r.periodEnd)}` : ""}. Billed on actual working days only; leave days are excluded.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-tint text-left text-brand-deep">
                {["Service personnel", "Worked", "Corrected", "Leave", "Billable", "Status"].map((h) => <th key={h} scope="col" className="px-3 py-2.5 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.rows.map((row) => (
                <tr key={row.personnelId}>
                  <td className="px-3 py-2.5 font-medium">{row.name}</td>
                  <td className="px-3 py-2.5">{row.worked}</td>
                  <td className="px-3 py-2.5">{row.correctedWorked}</td>
                  <td className="px-3 py-2.5">{row.leave}</td>
                  <td className="px-3 py-2.5 font-bold">{row.billable}</td>
                  <td className="px-3 py-2.5">{row.gaps ? <Badge tone="bad">{row.gaps} gap{row.gaps > 1 ? "s" : ""}</Badge> : <Badge tone="ok">OK</Badge>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-ink text-white">
                <td className="px-3 py-3 font-semibold">Total billable days</td>
                <td colSpan={5} className="px-3 py-3 font-semibold">{r.billable} of {r.capacity}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-brand-deep">Attendance rate {pct(r.rate)}</p>
            <p className="text-sm text-muted">Against the {pct(floor, 0)} floor. {r.rate >= floor ? "Above floor." : "Below floor."}</p>
          </div>
          <div>
            {v.acceptance ? (
              <Alert tone="ok">
                <span className="font-semibold">Accepted by {v.acceptance.acceptedBy}</span> on {dateTimeSgt(v.acceptance.acceptedAt)}. Ledger entry #{v.acceptance.ledgerSeq}.{" "}
                {v.invoice ? <>Invoice <span className="font-semibold">{v.invoice.invoiceRef}</span> raised by {v.invoice.raisedBy} on {dateTimeSgt(v.invoice.raisedAt)}.</> : "The invoice may now be raised."}
              </Alert>
            ) : null}
            {v.acceptance && !v.invoice && user.role === "PMO" && <InvoiceForm month={month} />}
            {v.acceptance ? null : user.role === "SUPERVISOR" ? (
              <AcceptReport month={month} canAccept={v.complete && r.gaps === 0}
                reason={!v.complete ? "Acceptance opens once the month is over." : r.gaps ? `${r.gaps} unexplained day(s) must be resolved by the PMO first.` : null} />
            ) : (
              <Alert tone="neutral">{!v.complete ? "Draft. Submitted to IRAS once the month is over." : r.gaps ? `Resolve ${r.gaps} gap(s) before IRAS can accept.` : "Ready for IRAS acceptance."}</Alert>
            )}
          </div>
        </div>
        {v.corrections.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-ink">Corrections made by the PMO ({v.corrections.length})</h3>
            <ul className="mt-2 divide-y divide-line text-sm">
              {v.corrections.map((c) => (
                <li key={`${c.personnelName}-${c.workDate}`} className="py-2">
                  <span className="font-medium">{c.personnelName}</span>, {longDate(c.workDate)}: recorded as {c.outcome === "WORKED" ? "worked" : "leave"}. <span className="text-muted">Reason: {c.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </>
  );
}

function recentMonths(current: string, count: number): string[] {
  const [y, m] = current.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }).reverse();
}
