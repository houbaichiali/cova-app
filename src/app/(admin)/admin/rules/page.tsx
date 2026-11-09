import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { RulesManager } from "@/components/admin/RulesManager";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin · Rules" };

export default async function AdminRulesPage() {
  const t = await getT();
  return (
    <>
      <PageHeader title={t("admin.rules.pageTitle")} description={t("admin.rules.pageDesc")} />
      <RulesManager />
    </>
  );
}
