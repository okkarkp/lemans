"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/api";
import { longDate, pct } from "@/lib/format";
import { Alert, Badge, buttonClass, fieldClass } from "@/components/ui";

interface Request {
  id: number; personnelName: string; leaveType: string; startDate: string; endDate: string; backupName: string; teamName: string;
  coverage: { minRatio: number; passes: boolean; workingDays: number; floor: number };
}

export function LeaveDecision({ request: r }: { request: Request }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const decide = (decision: "APPROVE" | "REJECT") => start(async () => {
    const res = await api(`/api/leave/${r.id}/decision`, { body: { decision, note: note || undefined } });
    if (!res.ok) return setError(res.message);
    router.refresh();
  });

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{r.personnelName} <span className="font-normal text-muted">- {r.leaveType}</span></p>
          <p className="text-sm text-muted">{longDate(r.startDate)} to {longDate(r.endDate)} ({r.coverage.workingDays} working days)</p>
          <p className="text-sm text-muted">Team: {r.teamName}. Backup: {r.backupName}</p>
        </div>
        <Badge tone={r.coverage.passes ? "ok" : "bad"}>Coverage {pct(r.coverage.minRatio)}</Badge>
      </div>
      {rejecting && (
        <div>
          <label htmlFor={`note-${r.id}`} className="text-sm font-medium text-muted">Reason for rejecting</label>
          <textarea id={`note-${r.id}`} className={fieldClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
      {error && <Alert tone="bad">{error}</Alert>}
      <div className="flex gap-2">
        {!rejecting ? (
          <>
            <button type="button" className={buttonClass.small} disabled={pending || !r.coverage.passes} onClick={() => decide("APPROVE")}>Approve</button>
            <button type="button" className={buttonClass.smallSecondary} disabled={pending} onClick={() => setRejecting(true)}>Reject</button>
          </>
        ) : (
          <>
            <button type="button" className={buttonClass.small} disabled={pending || note.trim().length < 5} onClick={() => decide("REJECT")}>Confirm rejection</button>
            <button type="button" className={buttonClass.smallSecondary} disabled={pending} onClick={() => { setRejecting(false); setNote(""); }}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}
