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

// Runs before first paint: applies the saved palette, the saved theme (or the
// system preference) and the text size so the page never flashes in the wrong
// look during hydration. The palette whitelist mirrors src/lib/palettes.ts
// (scripts/test-palettes.ts keeps them in sync).
const themeInitScript = `try{var ok=["soft-blue","three-blue","academic-tech-premium","forest-copper","midnight-lavender","arctic-minimal","burgundy-champagne","sage-stone","sand-terracotta","graphite-mint","mono-creative"];var p=localStorage.getItem("cova-palette");document.documentElement.dataset.palette=ok.indexOf(p)>-1?p:"soft-blue";var t=localStorage.getItem("cova-theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)){var r=document.documentElement;r.classList.add("dark");r.style.colorScheme="dark"}var s=localStorage.getItem("cova-text-size");if(s==="small"||s==="large"){document.documentElement.dataset.textSize=s}}catch(e){}`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={LOCALE_DIR[locale]} suppressHydrationWarning>
      <body className="bg-cova-bg text-cova-ink antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <I18nProvider initialLocale={locale}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
