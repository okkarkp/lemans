import type { ReactNode } from "react";

export function Card({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-xl border border-line bg-white shadow-sm ${className}`} aria-label={title}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="text-base font-semibold text-brand-deep">{title}</h2>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

type Tone = "ok" | "warn" | "bad" | "info" | "neutral";
const toneClass: Record<Tone, string> = {
  ok: "bg-ok-tint text-ok border-ok",
  warn: "bg-warn-tint text-warn border-[#e0a100]",
  bad: "bg-bad-tint text-bad border-bad",
  info: "bg-brand-tint text-brand-deep border-brand",
  neutral: "bg-canvas text-muted border-line",
};

export function Alert({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`rounded-none border-l-4 px-4 py-3 text-sm ${toneClass[tone]}`}>
      {children}
    </div>
  );
}

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneClass[tone]}`}>{children}</span>;
}

const STATUS: Record<string, { label: string; tone: Tone }> = {
  WORKED: { label: "Checked in", tone: "ok" },
  LEAVE: { label: "On leave", tone: "info" },
  CORRECTED_WORKED: { label: "Corrected - worked", tone: "warn" },
  CORRECTED_LEAVE: { label: "Corrected - leave", tone: "warn" },
  GAP: { label: "Not checked in", tone: "bad" },
  AWAITING: { label: "Not yet", tone: "neutral" },
  NON_WORKING: { label: "Non-working day", tone: "neutral" },
  NOT_ASSIGNED: { label: "Not assigned", tone: "neutral" },
  PENDING: { label: "Pending", tone: "warn" },
  APPROVED: { label: "Approved", tone: "ok" },
  REJECTED: { label: "Rejected", tone: "bad" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  WORKED_HALF: { label: "Half day worked", tone: "ok" },
};
export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export const buttonClass = {
  primary: "inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-[#cdbfdc]",
  secondary: "inline-flex items-center justify-center rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink hover:border-brand hover:text-brand-deep disabled:cursor-not-allowed disabled:opacity-50",
  small: "inline-flex items-center justify-center rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50",
  smallSecondary: "inline-flex items-center justify-center rounded-md border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand disabled:opacity-50",
};

export const fieldClass = "mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-brand";
export const labelClass = "block text-sm font-medium text-muted";

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-4xl font-extrabold tracking-tight text-brand-deep">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </div>
  );
}
