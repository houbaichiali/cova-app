"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";

interface SettingRow {
  key: string;
  value: unknown;
  type: "integer" | "boolean" | "string";
  category: string;
  description: string;
  min_value: number | null;
  max_value: number | null;
  choices: string[] | null;
  updated_by: string | null;
  updated_at: string;
}

/** Locked security items: shown read-only — they are enforced in code/env by
 * design, not configurable from the UI (separation of ordinary configuration
 * from sensitive global operations). */
const LOCKED_ITEMS = [
  { key: "security.require_mfa_admin", value: "enforced" },
  { key: "security.service_role", value: "server-env" },
] as const;

const CATEGORY_ORDER = ["moderation", "gamification", "content", "general", "community", "notifications", "security", "maintenance"];

/** Administrative settings: typed, validated server-side, audited. */
export function SettingsManager() {
  const t = useT();
  const toast = useToast();

  const [rows, setRows] = useState<SettingRow[] | null>(null);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<SettingRow | null>(null);
  const [draft, setDraft] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    const { data, error: rpcError } = await getSupabase().rpc("admin_settings_list");
    if (rpcError) {
      setError(true);
      setRows([]);
      return;
    }
    setRows((data ?? []) as SettingRow[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount (same pattern as AdminUsers)
    void load();
  }, [load]);

  function openEditor(row: SettingRow) {
    setEditing(row);
    setDraft(row.type === "boolean" ? String(Boolean(row.value)) : String(row.value));
    setReason("");
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    const value = editing.type === "boolean" ? draft === "true" : editing.type === "integer" ? Number(draft) : draft;
    const { error: rpcError } = await getSupabase().rpc("admin_settings_update", {
      p_key: editing.key,
      p_value: value,
      p_reason: reason,
    });
    setBusy(false);
    if (rpcError) {
      toast.push(t("admin.settings.saveError"));
      return;
    }
    toast.push(t("admin.settings.saved"));
    setEditing(null);
    await load();
  }

  const categories = [...new Set((rows ?? []).map((r) => r.category))].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b),
  );

  return (
    <div className="space-y-6">
      {error ? (
        <Card>
          <CardBody>
            <p role="alert" className="text-sm font-medium text-red-800">{t("admin.settings.loadError")}</p>
          </CardBody>
        </Card>
      ) : rows === null ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        categories.map((cat) => (
          <section key={cat} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cova-mute">
              {t(`admin.settings.cat.${cat}` as never)}
            </h2>
            <ul className="space-y-2">
              {rows.filter((r) => r.category === cat).map((row) => (
                <li key={row.key}>
                  <Card>
                    <CardBody className="flex flex-wrap items-center gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs text-cova-mute">{row.key}</p>
                        <p className="mt-0.5 text-sm text-cova-ink">{row.description || row.key}</p>
                        <p className="mt-0.5 text-xs text-cova-mute">
                          {t("admin.settings.requiredPermission")}: settings.manage
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {row.type === "boolean" ? (
                          <Switch
                            checked={Boolean(row.value)}
                            onChange={(v) => openEditor({ ...row, value: v })}
                            label={`${row.key} toggle`}
                          />
                        ) : (
                          <span className="rounded-lg bg-cova-bg px-3 py-1.5 font-mono text-sm font-semibold text-cova-ink">
                            {String(row.value)}
                          </span>
                        )}
                        <Button variant="secondary" onClick={() => openEditor(row)}>
                          {t("admin.settings.edit")}
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {/* locked security items — read-only by design */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-cova-mute">{t("admin.settings.cat.security")}</h2>
        <ul className="space-y-2">
          {LOCKED_ITEMS.map((item) => (
            <li key={item.key}>
              <Card>
                <CardBody className="flex flex-wrap items-center gap-3 p-4 opacity-80">
                  <Lock className="h-4 w-4 shrink-0 text-cova-muted" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-cova-mute">{item.key}</p>
                    <p className="mt-0.5 text-sm text-cova-ink">{t(`admin.settings.locked.${item.key.split(".")[1]}` as never)}</p>
                  </div>
                  <span className="rounded-lg bg-cova-pale px-3 py-1.5 font-mono text-xs font-semibold text-cova-ink">
                    {t(`admin.settings.lockedValue.${item.value}` as never)}
                  </span>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {/* edit modal */}
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.key}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <p className="text-sm text-cova-mute">{editing.description}</p>
            {editing.type === "boolean" ? (
              <Switch checked={draft === "true"} onChange={(v) => setDraft(String(v))} label={t("admin.settings.value")} />
            ) : (
              <TextField
                id="setting-value"
                label={t("admin.settings.value")}
                type={editing.type === "integer" ? "number" : "text"}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                required
                min={editing.min_value ?? undefined}
                max={editing.max_value ?? undefined}
              />
            )}
            {(editing.min_value !== null || editing.max_value !== null) && (
              <p className="text-xs text-cova-mute">
                {t("admin.settings.range")}: [{editing.min_value ?? "−∞"}, {editing.max_value ?? "+∞"}]
              </p>
            )}
            <TextField
              id="setting-reason"
              label={t("admin.gamif.reasonLabel")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={5}
            />
            <p className="rounded-lg bg-cova-bg px-3 py-2 text-xs text-cova-mute">{t("admin.settings.auditNote")}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={busy || reason.trim().length < 5}>
                {busy ? t("admin.gamif.saving") : t("common.save")}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
