import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin · Users" };

export default async function AdminUsersPage() {
  const t = await getT();
  return (
    <>
      <PageHeader title={t("admin.users.pageTitle")} description={t("admin.users.pageDesc")} />
      <AdminUsers />
    </>
  );
}
