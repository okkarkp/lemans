"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/api";
import { longDate } from "@/lib/format";
import { Alert, buttonClass, Empty, fieldClass, labelClass } from "@/components/ui";

interface Delegation { id: number; delegatorId: string; delegatorName: string; delegateId: string; delegateName: string; startDate: string; endDate: string }

/** Supervisors delegate their own approvals; administrators may choose whose approvals are delegated. */
export function Delegations({ delegations, supervisors, selfId, today, isAdmin }: {
  delegations: Delegation[]; supervisors: { id: string; name: string }[]; selfId: string; today: string; isAdmin: boolean;
}) {
  const router = useRouter();
  const others = supervisors.filter((s) => s.id !== selfId);
  const [delegatorId, setDelegator] = useState(isAdmin ? supervisors[0]?.id ?? "" : selfId);
  const [delegateId, setDelegate] = useState("");
  const [startDate, setStart] = useState(today);
  const [endDate, setEnd] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const choices = supervisors.filter((s) => s.id !== delegatorId);

  return (
    <div className="space-y-4">
      {delegations.length === 0 ? <Empty>No active or upcoming delegations.</Empty> : (
        <ul className="divide-y divide-line text-sm">
          {delegations.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
              <span>
                <span className="font-medium">{d.delegatorId === selfId ? "You" : d.delegatorName}</span> to{" "}
                <span className="font-medium">{d.delegateId === selfId ? "you" : d.delegateName}</span>
                <br /><span className="text-muted">{longDate(d.startDate)} - {longDate(d.endDate)}</span>
              </span>
              {(isAdmin || d.delegatorId === selfId) && (
                <button type="button" className={buttonClass.smallSecondary} disabled={pending}
                  onClick={() => start(async () => { const r = await api(`/api/delegations/${d.id}/revoke`, { body: {} }); if (!r.ok) return setError(r.message); router.refresh(); })}>
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {(isAdmin || others.length > 0) && (
        <form className="space-y-3 rounded-lg bg-canvas p-4" noValidate onSubmit={(e) => {
          e.preventDefault();
          if (!delegateId) return setError("Choose who will approve in your place.");
          if (endDate < startDate) return setError("End date must be on or after the start date.");
          start(async () => {
            const r = await api("/api/delegations", { body: { delegatorId: isAdmin ? delegatorId : undefined, delegateId, startDate, endDate } });
            if (!r.ok) { setDone(null); return setError(r.message); }
            setError(null); setDone("Delegation saved."); setDelegate(""); router.refresh();
          });
        }}>
          <p className="text-sm font-semibold text-ink">{isAdmin ? "Set up a delegation" : "Delegate your approvals while you are away"}</p>
          {isAdmin && (
            <div>
              <label htmlFor="dg-from" className={labelClass}>Approvals of</label>
              <select id="dg-from" className={fieldClass} value={delegatorId} onChange={(e) => setDelegator(e.target.value)}>
                {supervisors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="dg-to" className={labelClass}>Delegate to</label>
            <select id="dg-to" className={fieldClass} value={delegateId} onChange={(e) => setDelegate(e.target.value)}>
              <option value="">Choose a supervisor</option>
              {choices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor="dg-start" className={labelClass}>From</label><input id="dg-start" type="date" min={today} className={fieldClass} value={startDate} onChange={(e) => setStart(e.target.value)} /></div>
            <div><label htmlFor="dg-end" className={labelClass}>Until</label><input id="dg-end" type="date" min={startDate} className={fieldClass} value={endDate} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          {error && <Alert tone="bad">{error}</Alert>}
          {done && <Alert tone="ok">{done}</Alert>}
          <button type="submit" className={buttonClass.small} disabled={pending}>Save delegation</button>
        </form>
      )}
    </div>
  );
}
