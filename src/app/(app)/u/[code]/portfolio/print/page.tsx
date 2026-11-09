import type { Metadata } from "next";

import { PortfolioPrint } from "@/components/portfolio/PortfolioPrint";

export const metadata: Metadata = { title: "Portfolio PDF" };

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function PortfolioPrintPage({ params }: PageProps) {
  const { code } = await params;
  return <PortfolioPrint code={code} />;
}
