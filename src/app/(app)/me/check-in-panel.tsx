"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/api";
import { timeSgt } from "@/lib/format";
import { Alert, buttonClass } from "@/components/ui";

interface Attendance { location: "OFFICE" | "WFH"; strength: "STRONG" | "MEDIUM"; device: string; network: string; checkedInAt: string }

export function CheckInPanel({ status, attendance }: { status: string; attendance: Attendance | null }) {
  const router = useRouter();
  const [location, setLocation] = useState<"OFFICE" | "WFH">("OFFICE");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (attendance) {
    return (
      <div className="space-y-3">
        <Alert tone={attendance.strength === "STRONG" ? "ok" : "warn"}>
          <p className="font-semibold">Checked in at {timeSgt(attendance.checkedInAt)} - {attendance.location === "OFFICE" ? "IRAS office" : "working from home"}</p>
          <p>Recorded as a working day.</p>
        </Alert>
        <dl className="rounded-lg bg-canvas p-3 text-xs text-muted">
          <dt className="font-semibold text-ink">Evidence recorded by the server</dt>
          <dd className="mt-1">Device: {attendance.device}</dd>
          <dd>Network: {attendance.network}</dd>
          <dd>Strength: {attendance.strength === "STRONG" ? "Strong" : "Medium"}</dd>
        </dl>
      </div>
    );
  }
  if (status === "LEAVE") return <Alert tone="info">You are on approved leave today.</Alert>;
  if (status === "NOT_ASSIGNED") return <Alert tone="neutral">You are not assigned to the contract today. Contact the PMO if this is wrong.</Alert>;
  if (status === "NON_WORKING") return <Alert tone="neutral">Today is not a working day. Check-in is closed.</Alert>;

  return (
    <div className="space-y-4">
      {status === "GAP" && <Alert tone="warn">You have not checked in yet and the midday check has passed. Check in now.</Alert>}
      <fieldset>
        <legend className="text-sm font-medium text-ink">Where are you working today?</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["OFFICE", "WFH"] as const).map((l) => (
            <button key={l} type="button" aria-pressed={location === l} onClick={() => setLocation(l)}
              className={`rounded-lg border px-3 py-2.5 text-sm font-semibold ${location === l ? "border-brand-deep bg-brand-deep text-white" : "border-line bg-white text-ink hover:border-brand"}`}>
              {l === "OFFICE" ? "IRAS office" : "Work from home"}
            </button>
          ))}
        </div>
      </fieldset>
      <button type="button" disabled={pending} className={`${buttonClass.primary} w-full py-5 text-xl tracking-wide`}
        onClick={() => start(async () => {
          const r = await api("/api/attendance/check-in", { body: { location } });
          setError(r.ok ? null : r.message);
          router.refresh();
        })}>
        {pending ? "Checking in..." : "CHECK IN"}
      </button>
      {error && <Alert tone="bad">{error}</Alert>}
      <p className="text-xs text-muted">Your device and network are verified by the server. The time recorded is the server time, not your device&apos;s.</p>
    </div>
  );
}
