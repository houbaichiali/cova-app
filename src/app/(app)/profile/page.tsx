import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { AchievementsCard } from "@/components/learning/AchievementsCard";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  const t = await getT();

  return (
    <>
      <PageHeader title={t("page.profile.title")} description={t("page.profile.description")} />
      <ProfileEditor />
      <div className="mx-auto max-w-2xl">
        <AchievementsCard />
      </div>
    </>
  );
}
