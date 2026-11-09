import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ContentReviewCenter } from "@/components/admin/ContentReviewCenter";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin · Content review" };

export default async function AdminContentPage() {
  const t = await getT();
  return (
    <>
      <PageHeader title={t("admin.content.pageTitle")} description={t("admin.content.pageDesc")} />
      <ContentReviewCenter />
    </>
  );
}
