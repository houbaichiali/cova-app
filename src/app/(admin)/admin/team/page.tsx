import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { TeamManager } from "@/components/admin/TeamManager";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin · Team" };

export default async function AdminTeamPage() {
  const t = await getT();
  return (
    <>
      <PageHeader title={t("admin.team.pageTitle")} description={t("admin.team.pageDesc")} />
      <TeamManager />
    </>
  );
}
