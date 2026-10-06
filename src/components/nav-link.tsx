"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const active = usePathname().startsWith(href);
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-white text-brand-deep" : "text-white/90 hover:bg-white/10"}`}>
      {children}
    </Link>
  );
}
