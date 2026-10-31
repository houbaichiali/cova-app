"use client";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useT } from "@/i18n/client";

/**
 * Real settings only: appearance (light/dark) and site language. Both apply
 * instantly and persist on the device. Identity (name, photo, bio…) lives on
 * the dedicated /profile page.
 */
export function SettingsForm() {
  const t = useT();

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader title={t("settings.appearance")} description={t("settings.appearanceDesc")} />
        <CardBody>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("settings.darkMode")}</p>
              <p className="mt-0.5 text-sm text-cova-mute">{t("settings.darkModeDesc")}</p>
            </div>
            <ThemeToggle />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("lang.label")} description={t("lang.description")} />
        <CardBody>
          <LanguageSwitcher />
        </CardBody>
      </Card>
    </div>
  );
}
