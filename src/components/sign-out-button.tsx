"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { api } from "@/lib/api";

export function SignOutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { await api("/api/auth/logout", { body: {} }); router.push("/login"); router.refresh(); })}
      className="rounded-md px-3 py-1.5 text-sm font-medium text-white/90 ring-1 ring-white/30 hover:bg-white/10"
    >
      Sign out
    </button>
  );
}
