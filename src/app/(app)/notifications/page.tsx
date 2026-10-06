import type { Metadata } from "next";
import { requirePageUser } from "@/server/auth/session";
import { listNotifications } from "@/server/services/notify";
import { Card, PageHeader } from "@/components/ui";
import { NotificationList } from "./notification-list";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requirePageUser(["PERSONNEL", "SUPERVISOR", "PMO", "ADMIN"]);
  const items = await listNotifications(user.id);
  return (
    <>
      <PageHeader title="Notifications" subtitle="Reminders, alerts and decisions for you. People with an email address on their account also receive these by email." />
      <Card title={`Latest (${items.length})`}><NotificationList items={items} /></Card>
    </>
  );
}
