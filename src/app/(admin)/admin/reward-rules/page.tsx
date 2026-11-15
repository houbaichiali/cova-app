import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { RewardRulesManager } from "@/components/admin/RewardRulesManager";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Admin · Reward rules" };

export default async function AdminRewardRulesPage() {
  const t = await getT();
  return (
    <>
      <PageHeader title={t("admin.rewardRules.pageTitle")} description={t("admin.rewardRules.pageDesc")} />
      <RewardRulesManager />
    </>
  );
}
