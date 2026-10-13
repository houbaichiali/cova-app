import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { MarketingHeader } from "@/components/layout/MarketingHeader";
import { getT } from "@/i18n/server";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const t = await getT();
  return (
    <>
      <MarketingHeader />
      <main>{children}</main>
      <footer className="border-t border-cova-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo showTagline />
          <nav aria-label="Footer" className="flex gap-6 text-sm text-cova-mute">
            <Link href="/login" className="hover:text-cova-ink">
              {t("common.logIn")}
            </Link>
            <Link href="/register" className="hover:text-cova-ink">
              {t("common.createAccount")}
            </Link>
            <Link href="/dashboard" className="hover:text-cova-ink">
              {t("landing.footer.explore")}
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
