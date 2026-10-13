"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useT } from "@/i18n/client";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  return (
    <EmptyState
      icon={AlertTriangle}
      title={t("error.page.title")}
      description={t("error.page.body")}
      action={<Button onClick={reset}>{t("common.tryAgain")}</Button>}
    />
  );
}
