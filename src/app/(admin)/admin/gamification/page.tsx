import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { GamificationCenter } from "@/components/admin/GamificationCenter";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin · Gamification" };

export default async function AdminGamificationPage() {
  const t = await getT();
  return (
    <>
      <PageHeader title={t("admin.gamif.pageTitle")} description={t("admin.gamif.pageDesc")} />
      <GamificationCenter />
    </>
  );
}
