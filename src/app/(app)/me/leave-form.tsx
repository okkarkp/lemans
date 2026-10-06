"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { api } from "@/lib/api";
import { longDate, pct } from "@/lib/format";
import { Alert, buttonClass, fieldClass, labelClass } from "@/components/ui";

interface Coverage { minRatio: number; worstDay: string | null; floor: number; passes: boolean; workingDays: number }

export function LeaveForm({ today, backups, types }: { today: string; backups: { id: string; name: string }[]; types: Record<string, string> }) {
  const router = useRouter();
  const [leaveType, setLeaveType] = useState("ANNUAL");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const [backupPersonnelId, setBackup] = useState(backups[0]?.id ?? "");
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const rangeValid = Boolean(startDate && endDate && endDate >= startDate);
  useEffect(() => {
    if (!rangeValid) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      const r = await api<Coverage>(`/api/leave/coverage?start=${startDate}&end=${endDate}`);
      if (!ctl.signal.aborted) setCoverage(r.ok ? r.data : null);
    }, 250);
    return () => { ctl.abort(); clearTimeout(t); };
  }, [startDate, endDate, rangeValid]);
  const shownCoverage = rangeValid ? coverage : null;

  return (
    <form className="space-y-4" noValidate onSubmit={(e) => {
      e.preventDefault();
      if (!rangeValid) return setMessage({ tone: "bad", text: "Choose a start date and an end date on or after it." });
      start(async () => {
        const r = await api<{ id: number }>("/api/leave", { body: { leaveType, startDate, endDate, backupPersonnelId } });
        if (!r.ok) return setMessage({ tone: "bad", text: r.message });
        setMessage({ tone: "ok", text: `Request LR-${r.data.id} sent to your IRAS supervisor.` });
        setStart(""); setEnd(""); setCoverage(null);
        router.refresh();
      });
    }}>
      <div>
        <label htmlFor="leaveType" className={labelClass}>Type</label>
        <select id="leaveType" className={fieldClass} value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
          {Object.entries(types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="start" className={labelClass}>From</label>
          <input id="start" type="date" min={today} className={fieldClass} value={startDate} onChange={(e) => { setStart(e.target.value); if (!endDate) setEnd(e.target.value); }} required />
        </div>
        <div>
          <label htmlFor="end" className={labelClass}>To</label>
          <input id="end" type="date" min={startDate || today} className={fieldClass} value={endDate} onChange={(e) => setEnd(e.target.value)} required />
        </div>
      </div>
      <div>
        <label htmlFor="backup" className={labelClass}>Backup (confirmed with)</label>
        <select id="backup" className={fieldClass} value={backupPersonnelId} onChange={(e) => setBackup(e.target.value)}>
          {backups.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <div aria-live="polite">
        {shownCoverage && (shownCoverage.workingDays === 0
          ? <Alert tone="warn">No working days in this period.</Alert>
          : shownCoverage.passes
            ? <Alert tone="ok"><span className="font-semibold">SLA check passed.</span> Coverage stays at {pct(shownCoverage.minRatio)} or above ({shownCoverage.workingDays} working days; floor {pct(shownCoverage.floor, 0)}).</Alert>
            : <Alert tone="bad"><span className="font-semibold">SLA check failed.</span> Coverage would fall to {pct(shownCoverage.minRatio)} on {longDate(shownCoverage.worstDay!)}. Choose other dates.</Alert>)}
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <button type="submit" className={`${buttonClass.primary} w-full py-3`} disabled={pending || (shownCoverage !== null && !shownCoverage.passes)}>
        {pending ? "Sending..." : "Send to IRAS supervisor"}
      </button>
      <p className="text-xs text-muted">Approval happens in the app. No email chain, no spreadsheet.</p>
    </form>
  );
}
