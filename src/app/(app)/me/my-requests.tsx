"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { api } from "@/lib/api";
import { shortDate } from "@/lib/format";
import { Alert, Badge, buttonClass, Empty, StatusBadge } from "@/components/ui";

interface Request {
  id: number; leaveType: string; leaveTypeCode: string; startDate: string; endDate: string; status: string;
  halfDay: "AM" | "PM" | null; days: number; attachments: number; decisionNote: string | null;
}

export function MyRequests({ requests, today }: { requests: Request[]; today: string }) {
  if (requests.length === 0) return <Empty>No leave requests yet.</Empty>;
  return <ul className="divide-y divide-line">{requests.map((r) => <Row key={r.id} r={r} today={today} />)}</ul>;
}

function Row({ r, today }: { r: Request; today: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<null | "withdraw" | "cancel">(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const canWithdraw = r.status === "PENDING";
  const canCancel = r.status === "APPROVED" && r.startDate > today;
  const needsMc = r.leaveTypeCode === "MEDICAL" && (r.status === "PENDING" || r.status === "APPROVED");

  const act = (kind: "withdraw" | "cancel") => start(async () => {
    const res = await api(`/api/leave/${r.id}/${kind}`, { body: {} });
    if (!res.ok) return setError(res.message);
    setConfirm(null); setError(null); router.refresh();
  });

  const upload = (file: File) => start(async () => {
    if (file.size > 5 * 1024 * 1024) return setError("Files can be at most 5 MB.");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/leave/${r.id}/attachments`, { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok) return setError(json?.error?.message ?? "Upload failed.");
      setError(null); router.refresh();
    } catch { setError("Network error. Try again."); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  });

  const inputId = `mc-${r.id}`;
  return (
    <li className="space-y-2 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span>
          <span className="font-medium">{r.leaveType}</span>{r.halfDay && <span className="text-muted"> ({r.halfDay === "AM" ? "morning" : "afternoon"})</span>}
          <br /><span className="text-muted">{shortDate(r.startDate)}{r.endDate !== r.startDate && ` - ${shortDate(r.endDate)}`} - {r.days} day{r.days === 1 ? "" : "s"}</span>
        </span>
        <StatusBadge status={r.status} />
      </div>
      {r.status === "REJECTED" && r.decisionNote && <p className="text-xs text-muted">Reason: {r.decisionNote}</p>}
      {needsMc && (
        <div className="flex flex-wrap items-center gap-2">
          {r.attachments > 0 ? <Badge tone="ok">Certificate uploaded ({r.attachments})</Badge> : <Badge tone="warn">Medical certificate needed</Badge>}
          <label htmlFor={inputId} className={`${buttonClass.smallSecondary} cursor-pointer`}>Upload document</label>
          <input id={inputId} ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" disabled={pending}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>
      )}
      {(canWithdraw || canCancel) && !confirm && (
        <button type="button" className={buttonClass.smallSecondary} onClick={() => setConfirm(canWithdraw ? "withdraw" : "cancel")}>
          {canWithdraw ? "Withdraw request" : "Cancel leave"}
        </button>
      )}
      {confirm && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-canvas p-2">
          <span className="text-xs">{confirm === "withdraw" ? "Withdraw this request?" : "Cancel this approved leave? The days return to your balance."}</span>
          <button type="button" className={buttonClass.small} disabled={pending} onClick={() => act(confirm)}>Confirm</button>
          <button type="button" className={buttonClass.smallSecondary} onClick={() => setConfirm(null)}>Keep it</button>
        </div>
      )}
      {error && <Alert tone="bad">{error}</Alert>}
    </li>
  );
}
