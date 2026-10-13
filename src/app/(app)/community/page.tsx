import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { CommunityBrowser } from "@/components/community/CommunityBrowser";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Community" };

export default async function CommunityPage() {
  const t = await getT();

  return (
    <>
      <PageHeader
        title={t("page.community.title")}
        description={t("page.community.description")}
      />
      <CommunityBrowser />
    </>
  );
}
