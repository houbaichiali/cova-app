import { Skeleton } from "@/components/ui/Skeleton";
import { getT } from "@/i18n/server";

export default async function AdminLoading() {
  const t = await getT();
  return (
    <div aria-busy="true">
      <Skeleton className="mb-2 h-7 w-56" />
      <Skeleton className="mb-8 h-4 w-80" />
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
}
