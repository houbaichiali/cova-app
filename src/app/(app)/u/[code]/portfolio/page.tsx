import type { Metadata } from "next";

import { PortfolioView } from "@/components/portfolio/PortfolioView";

export const metadata: Metadata = { title: "Portfolio" };

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function PortfolioPage({ params }: PageProps) {
  const { code } = await params;
  return <PortfolioView code={code} />;
}
