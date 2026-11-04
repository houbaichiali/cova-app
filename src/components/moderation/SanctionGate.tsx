"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Gavel } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";

interface MySanction {
  id: string;
  type: string;
  reason: string;
  starts_at: string;
  ends_at: string | null;
}

/** Practical enforcement while the account is sanctioned: a blocking screen
 * on every student page, with the reason, the end date and the way to
 * contest it (/appeals stays reachable). Real login blocking additionally
 * happens server-side through the service-role key when an approved ban is
 * issued. */
export function SanctionGate({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const [sanctions, setSanctions] = useState<MySanction[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await getSupabase().rpc("me_sanctions");
      if (cancelled) return;
      setSanctions(error ? [] : ((data ?? []) as MySanction[]));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const blocking = (sanctions ?? []).find(
    (s) => s.type === "suspension" || s.type === "ban" || s.type === "restriction",
  );

  if (sanctions === null || !blocking || pathname.startsWith("/appeals")) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-cova-bg p-6">
      <Card className="w-full max-w-md">
        <CardBody className="space-y-4 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-800">
            <Gavel className="h-7 w-7" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-semibold text-cova-ink">{t("mod.block.title")}</h1>
          <p className="text-sm text-cova-mute">
            {t(`mod.block.type.${blocking.type}` as never)}
          </p>
          <p className="rounded-lg bg-cova-bg px-3 py-2 text-sm text-cova-ink">{blocking.reason}</p>
          {blocking.ends_at && (
            <p className="text-xs text-cova-mute">
              {t("mod.block.until")}{" "}
              {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(blocking.ends_at))}
            </p>
          )}
          <Link href="/appeals" className="block text-sm font-medium text-cova-muted hover:text-cova-ink">
            {t("mod.block.appeal")}
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
