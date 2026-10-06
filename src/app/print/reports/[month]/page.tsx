import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/server/auth/session";
import { formatMonth, isIsoMonth } from "@/server/domain/calendar";
import { getReport } from "@/server/services/report";
import { dateTimeSgt, longDate, pct } from "@/lib/format";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Monthly report (print)" };

/** A clean, printable layout: use the browser's "Save as PDF" to produce the PDF for IRAS finance. */
export default async function PrintReport(props: PageProps<"/print/reports/[month]">) {
  await requirePageUser(["SUPERVISOR", "PMO"]);
  const { month } = await props.params;
  if (!isIsoMonth(month)) notFound();
  const v = await getReport(month);
  const r = v.report;
  return (
    <main className="mx-auto w-full max-w-4xl bg-white p-10 text-sm text-ink print:p-0">
      <div className="mb-6 flex items-start justify-between print:hidden">
        <a href={`/reports?month=${month}`} className="text-brand-dark underline">Back to the report</a>
        <PrintButton />
      </div>
      <header className="border-b-4 border-brand pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">LeMans 2.0 - Attendance and billing record</p>
        <h1 className="mt-1 text-2xl font-bold">Monthly report: {formatMonth(month)}</h1>
        <p className="mt-1 text-muted">
          Status: {v.acceptance ? `Accepted by ${v.acceptance.acceptedBy} on ${dateTimeSgt(v.acceptance.acceptedAt)} (ledger entry #${v.acceptance.ledgerSeq})` : v.complete ? "Final draft - not yet accepted" : "Month-to-date draft - not for invoicing"}
        </p>
      </header>
      <section className="mt-6 grid grid-cols-4 gap-4">
        {[["Working days", String(r.workingDays)], ["Billable days", String(r.billable)], ["Capacity", String(r.capacity)], ["Attendance rate", pct(r.rate)]].map(([k, val]) => (
          <div key={k} className="rounded border border-line p-3"><p className="text-xs text-muted">{k}</p><p className="text-xl font-bold">{val}</p></div>
        ))}
      </section>
      <table className="mt-6 w-full border-collapse">
        <thead><tr className="bg-brand-tint text-left">
          {["Service personnel", "Assigned", "Worked", "Corrected", "Leave", "Unexplained", "Billable"].map((h) => <th key={h} scope="col" className="border border-line px-2 py-1.5">{h}</th>)}
        </tr></thead>
        <tbody>
          {r.rows.map((x) => (
            <tr key={x.personnelId}>
              <td className="border border-line px-2 py-1.5">{x.name}</td><td className="border border-line px-2">{x.assignedDays}</td>
              <td className="border border-line px-2">{x.worked}</td><td className="border border-line px-2">{x.correctedWorked}</td>
              <td className="border border-line px-2">{x.leave}</td><td className="border border-line px-2">{x.gaps}</td>
              <td className="border border-line px-2 font-bold">{x.billable}</td>
            </tr>
          ))}
          <tr className="font-bold"><td className="border border-line px-2 py-1.5">Total</td><td className="border border-line px-2">{r.capacity}</td><td colSpan={4} className="border border-line" /><td className="border border-line px-2">{r.billable}</td></tr>
        </tbody>
      </table>
      {v.corrections.length > 0 && (
        <section className="mt-6">
          <h2 className="font-semibold">Corrections recorded by the PMO</h2>
          <ul className="mt-1 list-disc pl-5">{v.corrections.map((c) => <li key={`${c.personnelName}-${c.workDate}`}>{c.personnelName}, {longDate(c.workDate)}: {c.outcome === "WORKED" ? "worked" : "leave"}. Reason: {c.reason}</li>)}</ul>
        </section>
      )}
      <p className="mt-6 text-xs text-muted">Billed on actual working days only; leave excluded; half-day leave bills half a day. {v.invoice ? `Invoice ${v.invoice.invoiceRef} raised on ${dateTimeSgt(v.invoice.raisedAt)}.` : ""}</p>
      <section className="mt-10 grid grid-cols-2 gap-10 break-inside-avoid">
        {["For the Authority (IRAS)", "For the Contractor (Accenture)"].map((who) => (
          <div key={who}><div className="h-14 border-b border-ink" /><p className="mt-1 text-xs">{who}: name, signature and date</p></div>
        ))}
      </section>
    </main>
  );
}
