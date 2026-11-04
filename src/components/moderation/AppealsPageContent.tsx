"use client";

import { useCallback, useEffect, useState } from "react";
import { Gavel } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextAreaField } from "@/components/ui/FormField";
import { EmptyState } from "@/components/ui/EmptyState";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";

interface MySanction {
  id: string; type: string; reason: string; starts_at: string; ends_at: string | null;
}
interface MyAppeal {
  id: string; sanction_id: string; statement: string; status: string;
  decision_reason: string; created_at: string; decided_at: string | null;
}

const STATUS_TONE: Record<string, string> = {
  active: "text-red-800", pending_approval: "text-amber-700",
  pending: "text-amber-700", accepted: "text-emerald-700", rejected: "text-cova-mute",
  lifted: "text-emerald-700",
};

/** Student-facing sanctions & appeals: see your own sanctions and contest
 * the ones that are eligible (restrictions, suspensions, bans). */
export function AppealsPageContent() {
  const t = useT();
  const [sanctions, setSanctions] = useState<MySanction[] | null>(null);
  const [appeals, setAppeals] = useState<MyAppeal[] | null>(null);
  const [statement, setStatement] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, a] = await Promise.all([
      getSupabase().rpc("me_sanctions"),
      getSupabase().rpc("my_appeals"),
    ]);
    setSanctions(s.error ? [] : ((s.data ?? []) as MySanction[]));
    setAppeals(a.error ? [] : ((a.data ?? []) as MyAppeal[]));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount into component state (same pattern as lib/gamification)
    void load();
  }, [load]);

  async function submit() {
    if (!target || !statement.trim()) return;
    setBusy(true);
    const { error } = await getSupabase().rpc("appeal_submit", {
      p_sanction: target,
      p_statement: statement.trim(),
    });
    setBusy(false);
    if (error) return;
    setStatement("");
    setTarget(null);
    await load();
  }

  const appealFor = (sanctionId: string) => appeals?.find((a) => a.sanction_id === sanctionId);

  const fmt = (date: string) =>
    new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(date));

  return (
    <>
      <PageHeader title={t("appeals.title")} description={t("appeals.desc")} />

      {sanctions === null || appeals === null ? (
        <div className="h-24 animate-pulse rounded-xl bg-cova-pale" aria-busy="true" />
      ) : sanctions.length === 0 ? (
        <EmptyState
          icon={Gavel}
          title={t("appeals.empty")}
          description={t("appeals.emptyDesc")}
        />
      ) : (
        <div className="space-y-4">
          {sanctions.map((sanction) => {
            const appeal = appealFor(sanction.id);
            return (
              <Card key={sanction.id}>
                <CardHeader
                  title={t(`appeals.type.${sanction.type}` as never)}
                  description={`${t("appeals.issued")} ${fmt(sanction.starts_at)}`}
                  action={
                    <span className={`text-xs font-semibold ${STATUS_TONE[appeal?.status ?? "none"] ?? "text-cova-mute"}`}>
                      {appeal ? t(`appeals.status.${appeal.status}` as never) : t("appeals.status.none")}
                    </span>
                  }
                />
                <CardBody className="space-y-3">
                  <p className="rounded-lg bg-cova-bg px-3 py-2 text-sm text-cova-ink">{sanction.reason}</p>
                  {appeal && (
                    <div className="rounded-lg border border-cova-line px-3 py-2 text-sm">
                      <p className="text-cova-ink">{appeal.statement}</p>
                      {appeal.status !== "pending" && appeal.decision_reason && (
                        <p className="mt-1 text-xs text-cova-mute">
                          {t("appeals.decision")}: {appeal.decision_reason}
                        </p>
                      )}
                    </div>
                  )}
                  {!appeal && target === sanction.id && (
                    <TextAreaField
                      id={`appeal-${sanction.id}`}
                      label={t("appeals.statement")}
                      value={statement}
                      maxLength={2000}
                      onChange={(e) => setStatement(e.target.value)}
                    />
                  )}
                  {!appeal && target === sanction.id && (
                    <div className="flex gap-2">
                      <Button onClick={() => void submit()} disabled={busy || !statement.trim()}>
                        {busy ? t("appeals.sending") : t("appeals.send")}
                      </Button>
                      <Button variant="secondary" onClick={() => setTarget(null)}>
                        {t("appeals.cancel")}
                      </Button>
                    </div>
                  )}
                  {!appeal && target !== sanction.id && (
                    <Button variant="secondary" size="sm" onClick={() => setTarget(sanction.id)}>
                      {t("appeals.contest")}
                    </Button>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
