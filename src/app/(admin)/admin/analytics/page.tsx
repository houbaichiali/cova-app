import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { AnalyticsDashboard } from "@/components/admin/AnalyticsDashboard";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin · Analytics" };

export default async function AdminAnalyticsPage() {
  const t = await getT();
  return (
    <>
      <PageHeader title={t("admin.analytics.pageTitle")} description={t("admin.analytics.pageDesc")} />
      <AnalyticsDashboard />
    </>
  );
}
