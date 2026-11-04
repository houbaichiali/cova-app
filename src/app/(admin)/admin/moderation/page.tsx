import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModerationCenter } from "@/components/admin/ModerationCenter";

export const metadata: Metadata = { title: "Admin · Moderation" };

export default function AdminModerationPage() {
  return (
    <>
      <PageHeader title="Moderation" description="Reports, sanctions and appeals." />
      <ModerationCenter />
    </>
  );
}
