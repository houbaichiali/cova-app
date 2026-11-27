import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { RequirementsManager } from "@/components/admin/RequirementsManager";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin · Requirements" };

export default async function AdminRequirementsPage() {
  const t = await getT();
  return (
    <>
      <PageHeader
        title={t("admin.requirements.pageTitle")}
        description={t("admin.requirements.pageDesc")}
      />
      <RequirementsManager />
    </>
  );
}
