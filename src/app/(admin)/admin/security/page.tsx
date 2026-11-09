import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { SecurityCenter } from "@/components/admin/SecurityCenter";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin · Security" };

export default async function AdminSecurityPage() {
  const t = await getT();
  return (
    <>
      <PageHeader title={t("admin.security.pageTitle")} description={t("admin.security.pageDesc")} />
      <SecurityCenter />
    </>
  );
}
