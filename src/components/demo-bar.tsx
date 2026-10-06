"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/api";

type Device = "WOG_LAPTOP" | "PERSONAL_PHONE";
type Network = "OFFICE" | "REMOTE";

/** Demo-only controls. The server ignores these entirely when DEMO_MODE is false. */
export function DemoBar({ date, time, device, network }: { date: string; time: string; device: Device; network: Network }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (url: string, body: unknown) => start(async () => {
    const r = await api(url, { body });
    setError(r.ok ? null : r.message);
    if (r.ok) router.refresh();
  });

  const select = "rounded border border-[#d9c2f0] bg-white px-2 py-1 text-xs";
  return (
    <div className="border-b border-[#e7d5fa] bg-[#faf5ff] text-xs text-brand-deep" aria-label="Demonstration controls">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-6 py-2">
        <span className="font-bold uppercase tracking-wide">Demo mode</span>
        <label className="flex items-center gap-1.5">Business date
          <input type="date" className={select} defaultValue={date} disabled={pending}
            onChange={(e) => e.target.value && run("/api/demo/clock", { now: `${e.target.value}T${time}` })} />
        </label>
        <label className="flex items-center gap-1.5">Time (SGT)
          <input type="time" className={select} defaultValue={time} disabled={pending}
            onBlur={(e) => e.target.value && e.target.value !== time && run("/api/demo/clock", { now: `${date}T${e.target.value}` })} />
        </label>
        <span className="hidden h-4 w-px bg-[#d9c2f0] md:block" aria-hidden />
        <span className="font-semibold">Simulated trust signals:</span>
        <label className="flex items-center gap-1.5">Device
          <select className={select} value={device} disabled={pending} onChange={(e) => run("/api/demo/signals", { device: e.target.value, network })}>
            <option value="WOG_LAPTOP">WOG laptop (managed)</option>
            <option value="PERSONAL_PHONE">Personal phone (unmanaged)</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">Network
          <select className={select} value={network} disabled={pending} onChange={(e) => run("/api/demo/signals", { device, network: e.target.value })}>
            <option value="OFFICE">IRAS office network</option>
            <option value="REMOTE">Remote / home</option>
          </select>
        </label>
        {error && <span role="alert" className="font-semibold text-bad">{error}</span>}
      </div>
    </div>
  );
}
