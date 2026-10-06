"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/api";
import { Alert, buttonClass, fieldClass, labelClass } from "@/components/ui";

export function InvoiceForm({ month }: { month: string }) {
  const router = useRouter();
  const [ref, setRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="mt-3 flex flex-wrap items-end gap-2" noValidate onSubmit={(e) => {
      e.preventDefault();
      if (!/^[A-Za-z0-9/_.-]{3,40}$/.test(ref.trim())) return setError("Invoice number: 3-40 letters, digits or / _ . -");
      start(async () => { const r = await api(`/api/reports/${month}/invoice`, { body: { invoiceRef: ref.trim() } }); if (!r.ok) return setError(r.message); router.refresh(); });
    }}>
      <div><label htmlFor="inv" className={labelClass}>Invoice number</label><input id="inv" className={fieldClass} value={ref} onChange={(e) => { setRef(e.target.value); setError(null); }} /></div>
      <button type="submit" className={buttonClass.small} disabled={pending}>Record invoice</button>
      {error && <div className="w-full"><Alert tone="bad">{error}</Alert></div>}
    </form>
  );
}
