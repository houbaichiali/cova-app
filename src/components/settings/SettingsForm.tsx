"use client";

import { Palette, Users, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { Switch } from "@/components/ui/Switch";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { useUserSettings, type InfoVisibility, type ProfileVisibility } from "@/lib/user-settings";
import type { TextSize } from "@/lib/theme";
import { AccountPanel } from "@/components/settings/AccountPanel";

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-cova-line bg-cova-bg p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            option.value === value ? "bg-cova-soft text-cova-ink" : "text-cova-mute hover:text-cova-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PrefRow({
  icon: Icon,
  label,
  description,
  children,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cova-pale">
          <Icon className="h-4 w-4 text-cova-muted" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-cova-ink">{label}</p>
          {description && <p className="mt-0.5 text-sm text-cova-mute">{description}</p>}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/**
 * Every preference lives in Supabase (user_settings) and applies instantly:
 * the notification preferences are enforced by the database, the privacy ones
 * by RLS helpers and triggers, and the look is applied app-wide on all devices.
 */
export function SettingsForm() {
  const t = useT();
  const { settings, update } = useUserSettings();
  const onError = () => t("settings.saveError");

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader title={t("settings.appearance")} description={t("settings.appearanceDesc")} />
        <CardBody className="divide-y divide-cova-line">
          <PrefRow icon={Palette} label={t("settings.darkMode")}>
            <ThemeToggle />
          </PrefRow>
          <PrefRow icon={Palette} label={t("settings.textSize")} description={t("settings.textSizeDesc")}>
            <Segmented<TextSize>
              label={t("settings.textSize")}
              value={settings.textSize}
              onChange={(textSize) => update({ textSize }, onError)}
              options={[
                { value: "small", label: t("settings.textSmall") },
                { value: "medium", label: t("settings.textMedium") },
                { value: "large", label: t("settings.textLarge") },
              ]}
            />
          </PrefRow>
          <PrefRow icon={Palette} label={t("lang.label")} description={t("lang.description")}>
            <LanguageSwitcher />
          </PrefRow>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("settings.notifications")} description={t("settings.notifDesc")} />
        <CardBody className="divide-y divide-cova-line py-0">
          <Switch label={t("settings.notifMessages")} description={t("settings.notifMessagesDesc")} checked={settings.notifyMessages} onChange={(notifyMessages) => update({ notifyMessages }, onError)} />
          <Switch label={t("settings.notifFriendRequests")} description={t("settings.notifFriendRequestsDesc")} checked={settings.notifyFriendRequests} onChange={(notifyFriendRequests) => update({ notifyFriendRequests }, onError)} />
          <Switch label={t("settings.notifCommunities")} description={t("settings.notifCommunitiesDesc")} checked={settings.notifyCommunities} onChange={(notifyCommunities) => update({ notifyCommunities }, onError)} />
          <Switch label={t("settings.notifCourses")} description={t("settings.notifCoursesDesc")} checked={settings.notifyCourses} onChange={(notifyCourses) => update({ notifyCourses }, onError)} />
          <Switch label={t("settings.notifAssignments")} description={t("settings.notifAssignmentsDesc")} checked={settings.notifyAssignments} onChange={(notifyAssignments) => update({ notifyAssignments }, onError)} />
          <Switch label={t("settings.notifDeadlines")} description={t("settings.notifDeadlinesDesc")} checked={settings.notifyDeadlines} onChange={(notifyDeadlines) => update({ notifyDeadlines }, onError)} />
          <Switch label={t("settings.notifChallenges")} description={t("settings.notifChallengesDesc")} checked={settings.notifyChallenges} onChange={(notifyChallenges) => update({ notifyChallenges }, onError)} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("settings.privacy")} description={t("settings.privacyDesc")} />
        <CardBody className="divide-y divide-cova-line">
          <PrefRow icon={Users} label={t("settings.profileVisibilityMode")} description={t("settings.profileVisibilityModeDesc")}>
            <Segmented<ProfileVisibility>
              label={t("settings.profileVisibilityMode")}
              value={settings.profileVisibility}
              onChange={(profileVisibility) => update({ profileVisibility }, onError)}
              options={[
                { value: "public", label: t("settings.vis.public") },
                { value: "private", label: t("settings.vis.private") },
              ]}
            />
          </PrefRow>
          <PrefRow icon={Users} label={t("settings.infoVisibility")} description={t("settings.infoVisibilityDesc")}>
            <Segmented<InfoVisibility>
              label={t("settings.infoVisibility")}
              value={settings.infoVisibility}
              onChange={(infoVisibility) => update({ infoVisibility }, onError)}
              options={[
                { value: "everyone", label: t("settings.infoEveryone") },
                { value: "friends", label: t("settings.infoFriends") },
                { value: "nobody", label: t("settings.infoNobody") },
              ]}
            />
          </PrefRow>
          <Switch label={t("settings.allowFriendRequests")} description={t("settings.allowFriendRequestsDesc")} checked={settings.allowFriendRequests} onChange={(allowFriendRequests) => update({ allowFriendRequests }, onError)} />
          <Switch label={t("settings.showOnlineStatus")} description={t("settings.showOnlineStatusDesc")} checked={settings.showOnlineStatus} onChange={(showOnlineStatus) => update({ showOnlineStatus }, onError)} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("settings.account")} description={t("settings.accountDesc")} />
        <CardBody>
          <AccountPanel />
        </CardBody>
      </Card>
    </div>
  );
}
