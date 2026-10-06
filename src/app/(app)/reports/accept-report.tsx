"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/api";
import { Alert, buttonClass } from "@/components/ui";

export function AcceptReport({ month, canAccept, reason }: { month: string; canAccept: boolean; reason: string | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!canAccept) return <Alert tone="neutral">{reason}</Alert>;
  return (
    <div className="space-y-2">
      {!confirming ? (
        <button type="button" className={buttonClass.primary} onClick={() => setConfirming(true)}>Accept report</button>
      ) : (
        <div className="rounded-lg border border-brand bg-brand-tint p-3 text-sm">
          <p className="font-semibold text-brand-deep">Accept this report on behalf of IRAS?</p>
          <p className="text-muted">The figures will be frozen and recorded in the audit ledger. This cannot be undone.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className={buttonClass.small} disabled={pending}
              onClick={() => start(async () => { const r = await api(`/api/reports/${month}/accept`, { body: {} }); if (!r.ok) return setError(r.message); router.refresh(); })}>
              {pending ? "Accepting..." : "Confirm acceptance"}
            </button>
            <button type="button" className={buttonClass.smallSecondary} disabled={pending} onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      )}
      {error && <Alert tone="bad">{error}</Alert>}
    </div>
  );
}
