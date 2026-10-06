import Link from "next/link";

export function NotificationBell({ unread }: { unread: number }) {
  const label = unread ? `Notifications, ${unread} unread` : "Notifications";
  return (
    <Link href="/notifications" aria-label={label} className="relative rounded-md p-2 text-white/90 hover:bg-white/10">
      <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread > 0 && (
        <span aria-hidden className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-[#ffb81c] px-1 text-center text-[11px] font-bold leading-5 text-ink">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
