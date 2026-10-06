"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/api";
import { Alert, buttonClass, fieldClass, labelClass } from "@/components/ui";

const ROLE: Record<string, string> = { PERSONNEL: "Service personnel", SUPERVISOR: "IRAS supervisor", PMO: "Accenture PMO", ADMIN: "System administrator" };

export function LoginForm({ users }: { users: { id: string; name: string; role: string }[] }) {
  const router = useRouter();
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form className="mt-6 space-y-4" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await api<{ redirectTo: string }>("/api/auth/demo-login", { body: { userId } });
        if (!r.ok) return setError(r.message);
        router.push(r.data.redirectTo);
        router.refresh();
      });
    }}>
      <div>
        <label htmlFor="user" className={labelClass}>Identity</label>
        <select id="user" className={fieldClass} value={userId} onChange={(e) => setUserId(e.target.value)}>
          {Object.entries(ROLE).map(([role, label]) => (
            <optgroup key={role} label={label}>
              {users.filter((u) => u.role === role).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      {error && <Alert tone="bad">{error}</Alert>}
      <button type="submit" className={`${buttonClass.primary} w-full py-3`} disabled={pending || !userId}>
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
