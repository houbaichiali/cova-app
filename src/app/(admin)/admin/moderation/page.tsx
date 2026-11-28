import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModerationCenter } from "@/components/admin/ModerationCenter";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin · Moderation" };

export default async function AdminModerationPage() {
  const t = await getT();
  return (
    <>
      <PageHeader title={t("admin.moderation.pageTitle")} description={t("admin.moderation.pageDesc")} />
      <ModerationCenter />
    </>
  );
}
