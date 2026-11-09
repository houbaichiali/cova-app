import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { SettingsManager } from "@/components/admin/SettingsManager";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin · Settings" };

export default async function AdminSettingsPage() {
  const t = await getT();
  return (
    <>
      <PageHeader title={t("admin.settings.pageTitle")} description={t("admin.settings.pageDesc")} />
      <SettingsManager />
    </>
  );
}
