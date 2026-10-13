import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { I18nProvider } from "@/i18n/client";
import { LOCALE_DIR } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "COVA — Community Of Visionary Achievers", template: "%s · COVA" },
  description:
    "COVA is a student community and collaborative learning platform: study groups, courses, challenges and peers in one calm place.",
};

export const viewport: Viewport = {
  themeColor: "#DCECF7",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={LOCALE_DIR[locale]}>
      <body className="bg-cova-bg text-cova-ink antialiased">
        <I18nProvider initialLocale={locale}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
