"use client";
import { useEffect, useState, useTransition } from "react";
import { api } from "@/lib/api";
import { Alert, buttonClass, fieldClass, labelClass } from "@/components/ui";

interface Balance { leaveType: "ANNUAL" | "MEDICAL" | "CHILDCARE"; entitled: number; approved: number; pending: number; remaining: number; isDefault: boolean }
const LABEL = { ANNUAL: "Annual", MEDICAL: "Medical", CHILDCARE: "Childcare" } as const;

export function EntitlementsEditor({ userId, year, idBase }: { userId: string; year: number; idBase: string }) {
  const [data, setData] = useState<Balance[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    api<Balance[]>(`/api/admin/users/${encodeURIComponent(userId)}/entitlements?year=${year}`).then((r) => {
      if (!live) return;
      if (!r.ok) return setMsg({ tone: "bad", text: r.message });
      setData(r.data);
      setValues(Object.fromEntries(r.data.map((b) => [b.leaveType, String(b.entitled)])));
    });
    return () => { live = false; };
  }, [userId, year]);

  if (!data) return msg ? <Alert tone="bad">{msg.text}</Alert> : <p className="text-xs text-muted">Loading entitlements...</p>;
  return (
    <div className="space-y-2 sm:col-span-2">
      <p className="text-sm font-semibold">Leave entitlement {year} (days)</p>
      <div className="grid grid-cols-3 gap-2">
        {data.map((b) => (
          <div key={b.leaveType}>
            <label htmlFor={`${idBase}-ent-${b.leaveType}`} className={labelClass}>{LABEL[b.leaveType]}{b.isDefault && " (default)"}</label>
            <input id={`${idBase}-ent-${b.leaveType}`} type="number" min={0} max={365} step={0.5} className={fieldClass}
              value={values[b.leaveType] ?? ""} onChange={(e) => setValues({ ...values, [b.leaveType]: e.target.value })} />
            <p className="mt-0.5 text-xs text-muted">Taken {b.approved}, pending {b.pending}</p>
          </div>
        ))}
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <button type="button" className={buttonClass.smallSecondary} disabled={pending} onClick={() => start(async () => {
        const body = { year, ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)])) };
        if (Object.values(body).some((v) => !Number.isFinite(v) || v < 0)) return setMsg({ tone: "bad", text: "Enter a number of days for each type." });
        const r = await api(`/api/admin/users/${encodeURIComponent(userId)}/entitlements`, { method: "PUT", body });
        setMsg(r.ok ? { tone: "ok", text: "Entitlements saved." } : { tone: "bad", text: r.message });
      })}>Save entitlements</button>
    </div>
  );
}
