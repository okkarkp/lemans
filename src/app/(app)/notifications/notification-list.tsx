"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { api } from "@/lib/api";
import { dateTimeSgt } from "@/lib/format";
import { buttonClass, Empty } from "@/components/ui";

interface Item { id: number; kind: string; title: string; body: string; link: string | null; createdAt: string; read: boolean }

export function NotificationList({ items }: { items: Item[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const mark = (ids: number[] | "all") => start(async () => { await api("/api/notifications", { body: { ids } }); router.refresh(); });
  if (items.length === 0) return <Empty>You have no notifications.</Empty>;
  const unread = items.filter((i) => !i.read).length;
  return (
    <div className="space-y-3">
      {unread > 0 && <button type="button" className={buttonClass.smallSecondary} disabled={pending} onClick={() => mark("all")}>Mark all {unread} as read</button>}
      <ul className="divide-y divide-line">
        {items.map((i) => (
          <li key={i.id} className={`flex items-start justify-between gap-3 py-3 ${i.read ? "opacity-70" : ""}`}>
            <div>
              <p className="font-semibold">{!i.read && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-brand" aria-label="Unread" />}{i.title}</p>
              <p className="text-sm text-muted">{i.body}</p>
              <p className="text-xs text-muted">{dateTimeSgt(i.createdAt)}</p>
            </div>
            {i.link && (
              <Link href={i.link} className={buttonClass.smallSecondary} onClick={() => { if (!i.read) void api("/api/notifications", { body: { ids: [i.id] } }); }}>
                Open
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
