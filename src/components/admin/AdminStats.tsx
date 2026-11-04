"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Flame,
  Gamepad2,
  Swords,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { StatCard } from "@/components/dashboard/StatCard";
import { useI18n, useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";

interface DashboardStats {
  users_total: number;
  users_new_30d: number;
  users_active_7d: number;
  quizzes_total: number;
  quiz_games_total: number;
  quiz_participations_total: number;
  badges_unlocked_total: number;
  xp_distributed_total: number;
}

/** Real aggregate numbers from admin_dashboard_stats() — no invented data.
 * Modules without backing tables yet (reports, sanctions) appear with their
 * Phase 4/5 rollout. */
export function AdminStats() {
  const t = useT();
  const { formatTag } = useI18n();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState(false);
  const [rawError, setRawError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await getSupabase().rpc("admin_dashboard_stats");
      if (cancelled) return;
      if (error) {
        setError(true);
        setRawError(error.message);
        return;
      }
      setStats(data as DashboardStats);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <Card>
        <CardBody className="text-sm text-red-800">
          <p role="alert" className="font-medium">{t("admin.stats.error")}</p>
          {rawError && (
            <p className="mt-1 rounded bg-red-50 px-2 py-1 font-mono text-[11px]">{rawError}</p>
          )}
        </CardBody>
      </Card>
    );
  }

  if (!stats) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-cova-pale" />
        ))}
      </div>
    );
  }

  const fmt = (value: number) => value.toLocaleString(formatTag);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label={t("admin.stats.users")} value={fmt(stats.users_total)} />
        <StatCard icon={UserPlus} label={t("admin.stats.newUsers")} value={fmt(stats.users_new_30d)} />
        <StatCard icon={UserCheck} label={t("admin.stats.activeUsers")} value={fmt(stats.users_active_7d)} />
        <StatCard icon={Flame} label={t("admin.stats.xpDistributed")} value={fmt(stats.xp_distributed_total)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Gamepad2} label={t("admin.stats.quizzes")} value={fmt(stats.quizzes_total)} />
        <StatCard icon={Swords} label={t("admin.stats.quizGames")} value={fmt(stats.quiz_games_total)} />
        <StatCard icon={BookOpen} label={t("admin.stats.quizParticipations")} value={fmt(stats.quiz_participations_total)} />
        <StatCard icon={Trophy} label={t("admin.stats.badgesUnlocked")} value={fmt(stats.badges_unlocked_total)} />
      </div>
    </div>
  );
}
