"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/api";
import { dateTimeSgt, longDate } from "@/lib/format";
import { Alert, Badge, buttonClass, Empty, fieldClass, labelClass } from "@/components/ui";

interface Grant { id: number; targetUserId: string; targetName: string; fromRole: string | null; requestedBy: string; requestedAt: string }

export function PendingGrants({ grants, selfId }: { grants: Grant[]; selfId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (grants.length === 0) return <Empty>No administrator requests waiting.</Empty>;
  return (
    <ul className="divide-y divide-line text-sm">
      {grants.map((g) => (
        <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <span>
            <span className="font-semibold">{g.targetName}</span> <span className="font-mono text-xs">{g.targetUserId}</span>
            <br /><span className="text-muted">{g.fromRole ? `Promotion from ${g.fromRole.toLowerCase()}` : "New administrator account"}, requested by {g.requestedBy} on {dateTimeSgt(g.requestedAt)}</span>
          </span>
          {g.requestedBy === selfId ? <Badge tone="warn">Needs another administrator</Badge> : (
            <span className="flex gap-2">
              {[true, false].map((approve) => (
                <button key={String(approve)} type="button" className={approve ? buttonClass.small : buttonClass.smallSecondary} disabled={pending}
                  onClick={() => start(async () => { const r = await api(`/api/admin/grants/${g.id}/decision`, { body: { approve } }); if (!r.ok) return setError(r.message); router.refresh(); })}>
                  {approve ? "Approve" : "Reject"}
                </button>
              ))}
            </span>
          )}
        </li>
      ))}
      {error && <li className="py-2"><Alert tone="bad">{error}</Alert></li>}
    </ul>
  );
}

interface RowResult { line: number; loginId: string; ok: boolean; message: string }
const TEMPLATE = "login_id,name,role,email,team,job_title,start_date\nnew.dev,Personnel 07,PERSONNEL,,APP,Developer,2026-10-01\n";

export function BulkImport() {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<{ applied: boolean; rows: RowResult[]; dry: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (dryRun: boolean) => start(async () => {
    const r = await api<{ applied: boolean; rows: RowResult[] }>("/api/admin/users/import", { body: { csv, dryRun } });
    if (!r.ok) { setResult(null); return setError(r.message); }
    setError(null); setResult({ ...r.data, dry: dryRun });
    if (r.data.applied) router.refresh();
  });
  const allOk = result?.rows.every((x) => x.ok);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Columns: <code className="font-mono text-xs">login_id, name, role, email, team, job_title, start_date</code>. The whole file is imported, or none of it.</p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="imp-file" className={`${buttonClass.smallSecondary} cursor-pointer`}>Choose CSV file</label>
        <input id="imp-file" type="file" accept=".csv,text/csv" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setCsv(await f.text()); setResult(null); } }} />
        <button type="button" className={buttonClass.smallSecondary} onClick={() => { setCsv(TEMPLATE); setResult(null); }}>Insert example</button>
      </div>
      <div>
        <label htmlFor="imp-csv" className={labelClass}>CSV content</label>
        <textarea id="imp-csv" rows={5} className={`${fieldClass} font-mono text-xs`} value={csv} onChange={(e) => { setCsv(e.target.value); setResult(null); }} />
      </div>
      {error && <Alert tone="bad">{error}</Alert>}
      {result && (
        <div className="space-y-2">
          <Alert tone={result.applied ? "ok" : allOk ? "info" : "bad"}>
            {result.applied ? `Imported ${result.rows.length} user(s).` : allOk ? `Check passed: ${result.rows.length} user(s) ready to import.` : "Nothing was imported. Fix the rows below and check again."}
          </Alert>
          <ul className="max-h-48 overflow-auto text-xs">
            {result.rows.map((r) => <li key={r.line} className={r.ok ? "text-ok" : "text-bad"}>Line {r.line} ({r.loginId || "no login ID"}): {r.message}</li>)}
          </ul>
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" className={buttonClass.smallSecondary} disabled={pending || !csv.trim()} onClick={() => run(true)}>Check file</button>
        <button type="button" className={buttonClass.small} disabled={pending || !result?.dry || !allOk} onClick={() => run(false)}>Import</button>
      </div>
    </div>
  );
}

export function Holidays({ holidays, year, today }: { holidays: { date: string; name: string }[]; year: number; today: string }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const call = (url: string, init: { method?: string; body?: unknown }) => start(async () => {
    const r = await api(url, init);
    if (!r.ok) return setError(r.message);
    setError(null); setDate(""); setName(""); router.refresh();
  });
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">Enter the gazetted dates from the Ministry of Manpower. Days in an accepted month cannot change.</p>
      {holidays.length === 0 ? <Empty>No public holidays entered for {year}.</Empty> : (
        <ul className="divide-y divide-line text-sm">
          {holidays.map((h) => (
            <li key={h.date} className="flex items-center justify-between py-2">
              <span>{longDate(h.date)} - {h.name}</span>
              {h.date >= today && <button type="button" className={buttonClass.smallSecondary} disabled={pending} aria-label={`Remove ${h.name}`}
                onClick={() => call(`/api/admin/holidays/${h.date}`, { method: "DELETE" })}>Remove</button>}
            </li>
          ))}
        </ul>
      )}
      <form className="grid grid-cols-[9rem_1fr_auto] items-end gap-2" noValidate onSubmit={(e) => {
        e.preventDefault();
        if (!date || name.trim().length < 2) return setError("Enter a date and a name.");
        call("/api/admin/holidays", { body: { date, name } });
      }}>
        <div><label htmlFor="ph-date" className={labelClass}>Date</label><input id="ph-date" type="date" min={today} className={fieldClass} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label htmlFor="ph-name" className={labelClass}>Name</label><input id="ph-name" className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <button type="submit" className={buttonClass.small} disabled={pending}>Add</button>
      </form>
      {error && <Alert tone="bad">{error}</Alert>}
    </div>
  );
}
