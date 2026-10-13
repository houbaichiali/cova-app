import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { getT } from "@/i18n/server";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getT();
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-cova-pale/60 to-cova-bg px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-between">
          <Logo showTagline />
        </div>
        <div className="rounded-2xl border border-cova-line bg-white p-6 sm:p-8">{children}</div>
        <div className="mt-4">
          <DemoNotice>{t("auth.demoNotice")}</DemoNotice>
        </div>
      </div>
    </main>
  );
}
