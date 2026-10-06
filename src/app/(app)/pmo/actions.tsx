"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/api";
import { longDate } from "@/lib/format";
import { Badge, buttonClass, fieldClass } from "@/components/ui";

export function FollowUpButton({ personnelId, done }: { personnelId: string; done: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (done) return <Badge tone="ok">Followed up</Badge>;
  return (
    <span className="text-right">
      <button type="button" className={buttonClass.small} disabled={pending}
        onClick={() => start(async () => { const r = await api("/api/pmo/follow-ups", { body: { personnelId } }); setError(r.ok ? null : r.message); router.refresh(); })}>
        Follow up
      </button>
      {error && <span role="alert" className="block text-xs text-bad">{error}</span>}
    </span>
  );
}

export function GapCorrection({ personnelId, personnelName, workDate }: { personnelId: string; personnelName: string; workDate: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<"LEAVE" | "WORKED" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = `reason-${personnelId}-${workDate}`;

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span><span className="font-semibold">{personnelName}</span><br /><span className="text-muted">{longDate(workDate)}</span></span>
        {!outcome && (
          <span className="flex gap-1.5">
            <button type="button" className={buttonClass.smallSecondary} onClick={() => setOutcome("LEAVE")}>Record leave</button>
            <button type="button" className={buttonClass.smallSecondary} onClick={() => setOutcome("WORKED")}>Record worked</button>
          </span>
        )}
      </div>
      {outcome && (
        <form className="space-y-2 rounded-lg bg-canvas p-3" onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim().length < 5) return setError("Give a reason of at least 5 characters.");
          start(async () => {
            const r = await api("/api/pmo/corrections", { body: { personnelId, workDate, outcome, reason } });
            if (!r.ok) return setError(r.message);
            router.refresh();
          });
        }}>
          <label htmlFor={id} className="text-xs font-medium text-muted">Reason for recording as {outcome === "LEAVE" ? "leave" : "worked"}</label>
          <textarea id={id} rows={2} className={fieldClass} value={reason} onChange={(e) => { setReason(e.target.value); setError(null); }}
            aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} />
          {error && <p id={`${id}-err`} role="alert" className="text-xs text-bad">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className={buttonClass.small} disabled={pending}>Save correction</button>
            <button type="button" className={buttonClass.smallSecondary} onClick={() => { setOutcome(null); setReason(""); setError(null); }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
