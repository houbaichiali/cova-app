"use client";

import { useCallback, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";

type RuleRow = {
  id: string;
  category: string;
  activity: string;
  difficulty: string;
  global_xp: number;
  skill_trophy: number;
  active: boolean;
  updated_at: string;
};

type Draft = { global_xp: number; skill_trophy: number; active: boolean };

/**
 * Admin Center — Reward Rules configuration (Phase 7). Reads through
 * admin_rules_list() and writes through admin_rules_save(), both
 * permission-gated server-side (gamification.rules.manage). Every change is
 * written to reward_rule_history by the SQL function.
 */
export function RewardRulesManager() {
  const t = useT();
  const toast = useToast();
  const [rows, setRows] = useState<RuleRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const fetchRules = useCallback(async (): Promise<RuleRow[] | null> => {
    const { data, error } = await getSupabase().rpc("admin_rules_list");
    if (error) return null;
    return (data ?? []) as unknown as RuleRow[];
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchRules().then((rules) => {
      if (cancelled) return;
      if (rules === null) {
        setDenied(true);
        setLoading(false);
        return;
      }
      setRows(rules);
      setDrafts(
        Object.fromEntries(
          rules.map((r) => [
            r.id,
            { global_xp: r.global_xp, skill_trophy: r.skill_trophy, active: r.active },
          ]),
        ),
      );
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchRules]);

  async function save(row: RuleRow) {
    const draft = drafts[row.id];
    if (!draft || busyId) return;
    setBusyId(row.id);
    try {
      const { error } = await getSupabase().rpc("admin_rules_save", {
        p_category: row.category,
        p_activity: row.activity,
        p_difficulty: row.difficulty,
        p_global_xp: draft.global_xp,
        p_skill_trophy: draft.skill_trophy,
        p_active: draft.active,
      });
      if (error) throw error;
      toast.push(t("admin.rewardRules.saved"));
      const fresh = await fetchRules();
      if (fresh) setRows(fresh);
    } catch (err) {
      toast.push(err instanceof Error && err.message ? err.message : t("admin.rewardRules.error"));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (denied) {
    return (
      <EmptyState
        icon={Save}
        title={t("admin.rewardRules.deniedTitle")}
        description={t("admin.rewardRules.deniedDesc")}
      />
    );
  }

  const visible = rows.filter(
    (r) =>
      filter.trim().length === 0 ||
      `${r.category} ${r.activity} ${r.difficulty}`.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t("admin.rewardRules.filter")}</span>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("admin.rewardRules.filterPlaceholder")}
              className="h-10 w-full max-w-md rounded-lg border border-cova-line bg-white px-3 text-sm dark:bg-cova-ink"
            />
          </label>
        </CardBody>
      </Card>

      <div className="grid gap-3">
        {visible.map((row) => {
          const draft = drafts[row.id];
          const dirty =
            !!draft &&
            (draft.global_xp !== row.global_xp ||
              draft.skill_trophy !== row.skill_trophy ||
              draft.active !== row.active);
          return (
            <Card key={row.id}>
              <CardBody className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {row.category} · {row.activity}
                    {row.difficulty !== "standard" && (
                      <span className="ml-2 rounded-full bg-cova-pale px-2 py-0.5 text-xs font-medium text-cova-mute">
                        {row.difficulty}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-cova-mute">
                    {t("admin.rewardRules.updatedAt", {
                      date: new Date(row.updated_at).toLocaleDateString(),
                    })}
                  </p>
                </div>
                {draft && (
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-cova-mute">
                        {t("admin.rewardRules.globalXp")}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={10000}
                        value={draft.global_xp}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [row.id]: { ...draft, global_xp: Number(e.target.value) },
                          }))
                        }
                        className="h-10 w-24 rounded-lg border border-cova-line bg-white px-3 text-sm dark:bg-cova-ink"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-cova-mute">
                        {t("admin.rewardRules.skillTrophy")}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        value={draft.skill_trophy}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [row.id]: { ...draft, skill_trophy: Number(e.target.value) },
                          }))
                        }
                        className="h-10 w-24 rounded-lg border border-cova-line bg-white px-3 text-sm dark:bg-cova-ink"
                      />
                    </label>
                    <label className="flex h-10 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.active}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [row.id]: { ...draft, active: e.target.checked },
                          }))
                        }
                        className="h-4 w-4 accent-cova-muted"
                      />
                      {t("admin.rewardRules.active")}
                    </label>
                    <Button
                      onClick={() => void save(row)}
                      disabled={busyId !== null}
                      variant={dirty ? "primary" : "secondary"}
                    >
                      <Save className="h-4 w-4" aria-hidden="true" />
                      {t("admin.rewardRules.save")}
                    </Button>
                  </div>
                )}
              </CardBody>
            </Card>
          );
        })}
        {visible.length === 0 && (
          <EmptyState icon={Save} title={t("admin.rewardRules.none")} description={t("admin.rewardRules.filterPlaceholder")} />
        )}
      </div>
    </div>
  );
}
