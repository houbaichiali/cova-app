import Link from "next/link";
import { Compass } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { buttonStyles } from "@/components/ui/Button";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Logo />
      <span className="mt-10 flex h-14 w-14 items-center justify-center rounded-full bg-cova-pale">
        <Compass className="h-7 w-7" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold">{t("notFound.title")}</h1>
      <p className="mt-2 max-w-sm text-sm text-cova-mute">{t("notFound.body")}</p>
      <Link href="/dashboard" className={buttonStyles({ className: "mt-6" })}>
        {t("notFound.cta")}
      </Link>
    </main>
  );
}
