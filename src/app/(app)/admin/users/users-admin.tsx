"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { api } from "@/lib/api";
import { longDate } from "@/lib/format";
import { Alert, Badge, buttonClass, Card, Empty, fieldClass, labelClass } from "@/components/ui";

type Role = "PERSONNEL" | "SUPERVISOR" | "PMO" | "ADMIN";
interface User {
  id: string; displayName: string; role: Role; active: boolean; createdAt: string;
  personnelId: string | null; roleTitle: string | null; startDate: string | null; endDate: string | null;
}
const ROLE_LABEL: Record<Role, string> = { PERSONNEL: "Service personnel", SUPERVISOR: "IRAS supervisor", PMO: "Accenture PMO", ADMIN: "System administrator" };
const STAFF_ROLES: Role[] = ["SUPERVISOR", "PMO", "ADMIN"];

export function UsersAdmin({ users, selfId, today }: { users: User[]; selfId: string; today: string }) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | Role>("");
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [flash, setFlash] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) =>
      (status === "all" || (status === "active") === u.active) &&
      (!roleFilter || u.role === roleFilter) &&
      (!q || u.displayName.toLowerCase().includes(q) || u.id.includes(q) || (u.personnelId ?? "").toLowerCase().includes(q)));
  }, [users, query, roleFilter, status]);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
      <Card title={`Users (${shown.length} of ${users.length})`}>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="q" className={labelClass}>Search</label>
            <input id="q" type="search" className={fieldClass} placeholder="Name, login ID or SP number" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div>
            <label htmlFor="rf" className={labelClass}>Role</label>
            <select id="rf" className={fieldClass} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as "" | Role)}>
              <option value="">All roles</option>
              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="sf" className={labelClass}>Status</label>
            <select id="sf" className={fieldClass} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="active">Active</option><option value="inactive">Deactivated</option><option value="all">All</option>
            </select>
          </div>
        </div>
        {flash && <div className="mb-4"><Alert tone="ok">{flash}</Alert></div>}
        {shown.length === 0 ? <Empty>No users match these filters.</Empty> : (
          <ul className="divide-y divide-line">
            {shown.map((u) => <UserRow key={u.id} user={u} self={u.id === selfId} today={today} onDone={setFlash} />)}
          </ul>
        )}
      </Card>
      <Card title="Add a user"><CreateUser today={today} onDone={setFlash} /></Card>
    </div>
  );
}

function UserRow({ user: u, self, today, onDone }: { user: User; self: boolean; today: string; onDone: (m: string) => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "deactivate">("view");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ displayName: u.displayName, role: u.role, roleTitle: u.roleTitle ?? "", startDate: u.startDate ?? "", endDate: u.endDate ?? "" });
  const [lastDay, setLastDay] = useState(today);

  const run = (url: string, init: { method?: string; body: unknown }, ok: string) => start(async () => {
    const r = await api(url, init);
    if (!r.ok) return setError(r.message);
    setError(null); setMode("view"); onDone(ok); router.refresh();
  });

  const save = () => {
    const body: Record<string, unknown> = {};
    if (form.displayName.trim() !== u.displayName) body.displayName = form.displayName;
    if (form.role !== u.role) body.role = form.role;
    if (u.personnelId) {
      if (form.roleTitle.trim() !== (u.roleTitle ?? "")) body.roleTitle = form.roleTitle;
      if (form.startDate !== u.startDate) body.startDate = form.startDate;
      if ((form.endDate || null) !== u.endDate) body.endDate = form.endDate || null;
    }
    if (Object.keys(body).length === 0) return setError("Nothing has changed.");
    run(`/api/admin/users/${encodeURIComponent(u.id)}`, { method: "PATCH", body }, `Saved changes to ${u.displayName}.`);
  };

  const idBase = `u-${u.id.replace(/[^a-z0-9]/g, "")}`;
  return (
    <li className="py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {u.displayName} {self && <span className="text-xs font-normal text-muted">(you)</span>}
          </p>
          <p className="text-sm text-muted">
            <span className="font-mono text-xs">{u.id}</span> - {ROLE_LABEL[u.role]}
            {u.personnelId && <> - {u.personnelId}, {u.roleTitle}</>}
          </p>
          {u.personnelId && (
            <p className="text-xs text-muted">Assigned {longDate(u.startDate!)}{u.endDate ? ` to ${longDate(u.endDate)}` : " - no end date"}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={u.active ? "ok" : "neutral"}>{u.active ? "Active" : "Deactivated"}</Badge>
          {mode === "view" && u.active && (
            <>
              <button type="button" className={buttonClass.smallSecondary} onClick={() => setMode("edit")} aria-label={`Edit ${u.displayName}`}>Edit</button>
              {!self && <button type="button" className={buttonClass.smallSecondary} onClick={() => setMode("deactivate")} aria-label={`Deactivate ${u.displayName}`}>Deactivate</button>}
            </>
          )}
          {mode === "view" && !u.active && (
            <button type="button" className={buttonClass.smallSecondary} disabled={pending} aria-label={`Reactivate ${u.displayName}`}
              onClick={() => run(`/api/admin/users/${encodeURIComponent(u.id)}/reactivate`, { body: {} }, `${u.displayName} can sign in again.`)}>
              Reactivate
            </button>
          )}
        </div>
      </div>

      {mode === "edit" && (
        <form className="mt-3 grid gap-3 rounded-lg bg-canvas p-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div>
            <label htmlFor={`${idBase}-name`} className={labelClass}>Name</label>
            <input id={`${idBase}-name`} className={fieldClass} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </div>
          <div>
            <label htmlFor={`${idBase}-role`} className={labelClass}>Role</label>
            <select id={`${idBase}-role`} className={fieldClass} value={form.role} disabled={self || u.role === "PERSONNEL"}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {(u.role === "PERSONNEL" ? (["PERSONNEL"] as Role[]) : STAFF_ROLES).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          {u.personnelId && (
            <>
              <div>
                <label htmlFor={`${idBase}-title`} className={labelClass}>Job title</label>
                <input id={`${idBase}-title`} className={fieldClass} value={form.roleTitle} onChange={(e) => setForm({ ...form, roleTitle: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={`${idBase}-start`} className={labelClass}>Assigned from</label>
                  <input id={`${idBase}-start`} type="date" className={fieldClass} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </div>
                <div>
                  <label htmlFor={`${idBase}-end`} className={labelClass}>Assigned until</label>
                  <input id={`${idBase}-end`} type="date" className={fieldClass} value={form.endDate} min={form.startDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                </div>
              </div>
            </>
          )}
          {error && <div className="sm:col-span-2"><Alert tone="bad">{error}</Alert></div>}
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className={buttonClass.small} disabled={pending}>{pending ? "Saving..." : "Save changes"}</button>
            <button type="button" className={buttonClass.smallSecondary} onClick={() => { setMode("view"); setError(null); }}>Cancel</button>
          </div>
        </form>
      )}

      {mode === "deactivate" && (
        <div className="mt-3 space-y-3 rounded-lg border border-bad bg-bad-tint p-4 text-sm">
          <p className="font-semibold text-bad">Deactivate {u.displayName}?</p>
          <p className="text-ink">They lose access immediately, including any session already open. Their records stay in the ledger.</p>
          {u.personnelId && (
            <div className="max-w-xs">
              <label htmlFor={`${idBase}-last`} className={labelClass}>Last working day on the contract</label>
              <input id={`${idBase}-last`} type="date" className={fieldClass} value={lastDay} max={today} min={u.startDate ?? undefined} onChange={(e) => setLastDay(e.target.value)} />
            </div>
          )}
          {error && <Alert tone="bad">{error}</Alert>}
          <div className="flex gap-2">
            <button type="button" className="inline-flex items-center rounded-md bg-bad px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" disabled={pending}
              onClick={() => run(`/api/admin/users/${encodeURIComponent(u.id)}/deactivate`, { body: u.personnelId ? { lastDay } : {} }, `${u.displayName} has been deactivated.`)}>
              {pending ? "Deactivating..." : "Confirm deactivation"}
            </button>
            <button type="button" className={buttonClass.smallSecondary} onClick={() => { setMode("view"); setError(null); }}>Cancel</button>
          </div>
        </div>
      )}
      {mode === "view" && error && <div className="mt-2"><Alert tone="bad">{error}</Alert></div>}
    </li>
  );
}

function CreateUser({ today, onDone }: { today: string; onDone: (m: string) => void }) {
  const router = useRouter();
  const empty = { id: "", displayName: "", role: "PERSONNEL" as Role, roleTitle: "", startDate: today };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const personnel = form.role === "PERSONNEL";

  return (
    <form className="space-y-3" noValidate onSubmit={(e) => {
      e.preventDefault();
      if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(form.id.trim().toLowerCase())) return setError("Login ID must be 3-64 characters: letters, digits, dot, dash or underscore.");
      if (form.displayName.trim().length < 2) return setError("Enter a name.");
      if (personnel && (form.roleTitle.trim().length < 2 || !form.startDate)) return setError("Service personnel need a job title and an assignment start date.");
      start(async () => {
        const body = personnel ? form : { id: form.id, displayName: form.displayName, role: form.role };
        const r = await api<{ id: string; personnelId: string | null }>("/api/admin/users", { body });
        if (!r.ok) return setError(r.message);
        setError(null); setForm(empty);
        onDone(`Created ${r.data.id}${r.data.personnelId ? ` as ${r.data.personnelId}` : ""}.`);
        router.refresh();
      });
    }}>
      <div>
        <label htmlFor="new-role" className={labelClass}>Role</label>
        <select id="new-role" className={fieldClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
          {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="new-id" className={labelClass}>Login ID (matches the SSO identity)</label>
        <input id="new-id" className={fieldClass} autoComplete="off" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} />
      </div>
      <div>
        <label htmlFor="new-name" className={labelClass}>Name</label>
        <input id="new-name" className={fieldClass} autoComplete="off" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
      </div>
      {personnel && (
        <>
          <div>
            <label htmlFor="new-title" className={labelClass}>Job title</label>
            <input id="new-title" className={fieldClass} value={form.roleTitle} onChange={(e) => setForm({ ...form, roleTitle: e.target.value })} />
          </div>
          <div>
            <label htmlFor="new-start" className={labelClass}>Assigned from</label>
            <input id="new-start" type="date" className={fieldClass} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
        </>
      )}
      {error && <Alert tone="bad">{error}</Alert>}
      <button type="submit" className={`${buttonClass.primary} w-full`} disabled={pending}>{pending ? "Creating..." : "Create user"}</button>
      <p className="text-xs text-muted">Sign-in is through WOG SSO. This only grants the account access and a role.</p>
    </form>
  );
}
