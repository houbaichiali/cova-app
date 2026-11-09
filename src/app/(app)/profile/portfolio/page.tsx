import type { Metadata } from "next";

import { PortfolioManager } from "@/components/portfolio/PortfolioManager";
import { PageHeader } from "@/components/ui/PageHeader";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "My portfolio" };

export default async function PortfolioManagerPage() {
  const t = await getT();

  return (
    <>
      <PageHeader title={t("page.portfolio.title")} description={t("page.portfolio.description")} />
      <PortfolioManager />
    </>
  );
}
