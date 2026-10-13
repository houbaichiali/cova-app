import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { NotificationsList } from "@/components/learning/NotificationsList";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Updates about your courses, groups and messages."
      />
      <NotificationsList />
    </>
  );
}
