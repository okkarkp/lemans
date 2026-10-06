"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/api";
import { Alert, buttonClass, fieldClass, labelClass } from "@/components/ui";

interface Team { id: string; name: string; supervisorId: string | null; supervisorName: string | null; members: number }

export function TeamsAdmin({ teams, supervisors }: { teams: Team[]; supervisors: { id: string; name: string }[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ id: "", name: "", supervisorId: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const call = (url: string, init: { method?: string; body: unknown }, reset = false) => start(async () => {
    const r = await api(url, init);
    if (!r.ok) return setError(r.message);
    setError(null); if (reset) setForm({ id: "", name: "", supervisorId: "" }); router.refresh();
  });

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line text-sm">
        {teams.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <span><span className="font-semibold">{t.name}</span> <span className="font-mono text-xs text-muted">{t.id}</span><br /><span className="text-muted">{t.members} assigned today</span></span>
            <label className="flex items-center gap-2 text-xs text-muted">Supervisor
              <select className="rounded border border-line bg-white px-2 py-1 text-sm text-ink" value={t.supervisorId ?? ""} disabled={pending}
                aria-label={`Supervisor of ${t.name}`}
                onChange={(e) => call(`/api/admin/teams/${t.id}`, { method: "PATCH", body: { supervisorId: e.target.value || null } })}>
                <option value="">None - any supervisor may approve</option>
                {supervisors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </li>
        ))}
      </ul>
      <form className="grid gap-2 rounded-lg bg-canvas p-3" noValidate onSubmit={(e) => {
        e.preventDefault();
        if (!/^[A-Za-z0-9-]{2,20}$/.test(form.id) || form.name.trim().length < 2) return setError("Enter a team code (2-20 letters, digits or dashes) and a name.");
        call("/api/admin/teams", { body: { ...form, supervisorId: form.supervisorId || null } }, true);
      }}>
        <p className="text-sm font-semibold">Add a team</p>
        <div className="grid grid-cols-3 gap-2">
          <div><label htmlFor="tm-id" className={labelClass}>Code</label><input id="tm-id" className={fieldClass} value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} /></div>
          <div className="col-span-2"><label htmlFor="tm-name" className={labelClass}>Name</label><input id="tm-name" className={fieldClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        </div>
        <div>
          <label htmlFor="tm-sup" className={labelClass}>Supervisor</label>
          <select id="tm-sup" className={fieldClass} value={form.supervisorId} onChange={(e) => setForm({ ...form, supervisorId: e.target.value })}>
            <option value="">None</option>
            {supervisors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {error && <Alert tone="bad">{error}</Alert>}
        <button type="submit" className={buttonClass.small} disabled={pending}>Add team</button>
      </form>
    </div>
  );
}
