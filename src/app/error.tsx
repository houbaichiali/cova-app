"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useT } from "@/i18n/client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-cova-pale">
        <AlertTriangle className="h-7 w-7" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold">{t("error.title")}</h1>
      <p className="mt-2 max-w-sm text-sm text-cova-mute">{t("error.body")}</p>
      <Button className="mt-6" onClick={reset}>
        {t("common.tryAgain")}
      </Button>
    </main>
  );
}
