"use client";

import Link from "next/link";
import { BarChart3, BookOpenCheck, ScrollText, Settings, ShieldAlert, ShieldCheck, ShieldPlus, Trophy, UserCog, Users, type LucideIcon } from "lucide-react";
import { AdminStats } from "@/components/admin/AdminStats";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { useAdminAccess } from "@/lib/admin-client";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/translate";

interface ModuleLink {
  href: string;
  labelKey: MessageKey;
  icon: LucideIcon;
  permission?: string;
}

const MODULE_LINKS: ModuleLink[] = [
  { href: "/admin/users", labelKey: "admin.nav.users", icon: Users, permission: "users.read" },
  { href: "/admin/moderation", labelKey: "admin.nav.moderation", icon: ShieldAlert, permission: "moderation.reports.read" },
  { href: "/admin/rules", labelKey: "admin.nav.rules", icon: ScrollText, permission: "rules.read" },
  { href: "/admin/content", labelKey: "admin.nav.content", icon: BookOpenCheck, permission: "content.review" },
  { href: "/admin/gamification", labelKey: "admin.nav.gamification", icon: Trophy, permission: "gamification.badges.manage" },
  { href: "/admin/analytics", labelKey: "admin.nav.analytics", icon: BarChart3, permission: "analytics.read" },
  { href: "/admin/security", labelKey: "admin.nav.security", icon: ShieldPlus, permission: "security.read" },
  { href: "/admin/settings", labelKey: "admin.nav.settings", icon: Settings, permission: "settings.manage" },
  { href: "/admin/team", labelKey: "admin.nav.team", icon: UserCog, permission: "team.manage" },
];

const ROLE_KEYS: Record<string, MessageKey> = {
  founder: "admin.roles.founder",
  admin: "admin.roles.admin",
  moderator: "admin.roles.moderator",
  content_manager: "admin.roles.content_manager",
  support: "admin.roles.support",
  analyst: "admin.roles.analyst",
};

/** Admin Center home. Only real access data — statistics arrive in Phase 3
 * wired to actual tables, never invented numbers. */
export function AdminHome() {
  const t = useT();
  const access = useAdminAccess();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-cova-pale px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cova-ink">
            <ShieldCheck className="h-4 w-4 text-cova-muted" aria-hidden="true" />
            {t("admin.center.title")}
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-cova-ink">
            {t("admin.home.welcome")}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-cova-mute">{t("admin.home.complete")}</p>
        </div>
        <Link href="/dashboard">
          <Button variant="secondary">{t("admin.nav.backToStudent")}</Button>
        </Link>
      </div>

      <AdminStats />

      {/* Module quick links — the entries respect the same permission gates as the sidebar. */}
      <nav aria-label={t("admin.center.title")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MODULE_LINKS.map(({ href, labelKey, permission, icon: Icon }) => {
          if (permission && !access.can(permission)) return null;
          return (
            <Link key={href} href={href}>
              <Card className="h-full transition-colors hover:border-cova-muted">
                <CardBody className="flex items-center gap-3 p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cova-pale">
                    <Icon className="h-4.5 w-4.5 text-cova-muted" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-cova-ink">{t(labelKey)}</span>
                </CardBody>
              </Card>
            </Link>
          );
        })}
      </nav>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("admin.home.role")} />
          <CardBody className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar name="A" size="md" />
              <div>
                <p className="text-sm font-semibold text-cova-ink">
                  {t(ROLE_KEYS[access.role ?? ""] ?? "admin.roles.admin")}
                </p>
                <p className="text-xs text-cova-mute">{t("admin.center.desc")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck
                className={access.mfaOk ? "h-4 w-4 text-emerald-600" : "h-4 w-4 text-amber-600"}
                aria-hidden="true"
              />
              <span className="text-sm text-cova-mute">
                {t("admin.home.mfa")}:{" "}
                <span className={access.mfaOk ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>
                  {access.mfaOk ? t("admin.home.mfaOn") : t("admin.home.mfaOff")}
                </span>
              </span>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("admin.home.permissions")} />
          <CardBody>
            <div className="flex flex-wrap gap-1.5">
              {access.permissions.length === 0 ? (
                <span className="text-sm text-cova-mute">{t("admin.home.noPermissions")}</span>
              ) : (
                access.permissions.map((permission) => (
                  <Badge key={permission} tone="soft">
                    {permission}
                  </Badge>
                ))
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
