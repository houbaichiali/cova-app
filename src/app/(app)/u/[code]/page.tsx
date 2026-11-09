import type { Metadata } from "next";
import { PublicProfile } from "@/components/profile/PublicProfile";
import { getT } from "@/i18n/server";

interface PageProps {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  return { title: `Profile ${code}` };
}

export default async function PublicProfilePage({ params }: PageProps) {
  const { code } = await params;
  const t = await getT();

  return <PublicProfile code={code} notFoundLabel={t("profile.notFound")} />;
}
