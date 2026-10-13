import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { MessagesClient } from "@/components/messages/MessagesClient";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const t = await getT();

  return (
    <>
      <PageHeader title={t("page.messages.title")} description={t("page.messages.description")} />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <MessagesClient />
      </Suspense>
    </>
  );
}
