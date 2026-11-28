"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Switch";
import { Tabs } from "@/components/ui/Tabs";
import { TextField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { useAdminAccess } from "@/lib/admin-client";
import { getSupabase } from "@/lib/supabase/client";

/**
 * Global Requirements & Configuration (spec Phase 8): one audited module for
 * upload requirements (extensions / max size / enabled / hidden), text field
 * validation requirements, authentication provider availability and the
 * change history. Every write goes through a security-definer RPC that checks
 * the permission, requires a reason and records before/after in the audit
 * log. Permanent deletion requires an explicit typed confirmation.
 */

const UPLOAD_AREAS = [
  "avatar", "cover", "postImage", "projectImage", "document", "courseAttachment",
  "codingSubmission", "projectSource", "audio", "video", "general", "badgeImage",
] as const;

type UploadArea = (typeof UPLOAD_AREAS)[number];

interface UploadRequirementRow {
  maxKb: number;
  extensions: string[];
  enabled: boolean;
  hidden: boolean;
}

interface FieldRequirementRow {
  id: string;
  area: string;
  key: string;
  min_length: number | null;
  max_length: number | null;
  required: boolean;
  pattern: string | null;
  enabled: boolean;
  hidden: boolean;
}

interface HistoryRow {
  id: string;
  action: string;
  target_type: string;
  target_id: string;
  reason: string;
  created_at: string;
}

const PROVIDER_KEYS = ["google", "github", "discord", "twitter"] as const;
type ProviderKey = (typeof PROVIDER_KEYS)[number];

function humanArea(area: string): string {
  return area.replace(/([A-Z])/g, " $1").trim();
}

export function RequirementsManager() {
  const t = useT();
  const toast = useToast();
  const access = useAdminAccess();
  const [tab, setTab] = useState<"files" | "fields" | "providers" | "history">("files");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [overrides, setOverrides] = useState<Record<string, UploadRequirementRow>>({});
  const [reason, setReason] = useState("");
  const [extensionInput, setExtensionInput] = useState<Partial<Record<UploadArea, string>>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<Partial<Record<UploadArea, string>>>({});

  const [fieldArea, setFieldArea] = useState("profile");
  const [fieldRows, setFieldRows] = useState<FieldRequirementRow[] | null>(null);
  const [fieldDraft, setFieldDraft] = useState({ key: "", min: "", max: "", required: true, pattern: "" });
  const [fieldDeleteConfirm, setFieldDeleteConfirm] = useState("");

  const [providers, setProviders] = useState<Record<ProviderKey, boolean> | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [saving, setSaving] = useState(false);

  const canManage = access.can("requirements.manage");
  const canRead = access.can("requirements.read");

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const supabase = getSupabase();
    const [requirementsResult, providersResult] = await Promise.all([
      supabase.rpc("upload_requirements_visible"),
      supabase.rpc("admin_settings_list"),
    ]);
    if (requirementsResult.error || providersResult.error) {
      setLoadError(true);
      setLoading(false);
      return;
    }
    setOverrides((requirementsResult.data ?? {}) as Record<string, UploadRequirementRow>);

    const settings = (providersResult.data ?? []) as Array<{ key: string; value: unknown }>;
    const map = { google: false, github: false, discord: false, twitter: false } as Record<ProviderKey, boolean>;
    for (const setting of settings) {
      const match = /^auth\.provider\.([a-z]+)\.enabled$/.exec(setting.key);
      if (match && (match[1] as ProviderKey) in map) {
        map[match[1] as ProviderKey] = (setting.value as { value?: boolean })?.value === true || setting.value === true;
      }
    }
    setProviders(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount
    if (canRead) void loadAll();
    else setLoading(false);
  }, [canRead, loadAll]);

  async function loadFieldRows(area: string) {
    const { data, error } = await getSupabase().rpc("field_requirements_list", { p_area: area });
    if (error) {
      toast.push(t("admin.requirements.loadError"));
      setFieldRows([]);
      return;
    }
    setFieldRows((data ?? []) as FieldRequirementRow[]);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch on tab switch
    if (tab === "fields" && canManage) void loadFieldRows(fieldArea);
    if (tab === "history" && canRead) {
      void (async () => {
        const { data, error } = await getSupabase().rpc("requirements_history", { p_limit: 100 });
        setHistory(error ? [] : (data ?? []) as HistoryRow[]);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on tab switch
  }, [tab, fieldArea, canManage, canRead]);

  async function saveRequirement(area: UploadArea, row: UploadRequirementRow) {
    if (!reason.trim() || reason.trim().length < 5) {
      toast.push(t("admin.requirements.saveError"));
      return;
    }
    setSaving(true);
    const { error } = await getSupabase().rpc("upload_requirement_save", {
      p_area: area,
      p_max_kb: row.maxKb,
      p_extensions: row.extensions,
      p_enabled: row.enabled,
      p_hidden: row.hidden,
      p_reason: reason.trim(),
    });
    setSaving(false);
    toast.push(error ? t("admin.requirements.saveError") : t("admin.requirements.save").replace(" (audited)", ""));
    if (!error) {
      setReason("");
      void loadAll();
    }
  }

  async function deleteRequirement(area: UploadArea) {
    if (deleteConfirm[area] !== area) return;
    if (!reason.trim() || reason.trim().length < 5) {
      toast.push(t("admin.requirements.saveError"));
      return;
    }
    setSaving(true);
    const { error } = await getSupabase().rpc("upload_requirement_delete", {
      p_area: area, p_reason: reason.trim(), p_confirm: true,
    });
    setSaving(false);
    if (error) {
      toast.push(t("admin.requirements.saveError"));
      return;
    }
    toast.push(t("admin.requirements.save").replace(" (audited)", ""));
    setDeleteConfirm((current) => ({ ...current, [area]: "" }));
    setReason("");
    void loadAll();
  }

  async function saveField(area: string) {
    if (!reason.trim() || reason.trim().length < 5) {
      toast.push(t("admin.requirements.saveError"));
      return;
    }
    setSaving(true);
    const { error } = await getSupabase().rpc("field_requirement_save", {
      p_id: null,
      p_area: area,
      p_key: fieldDraft.key.trim(),
      p_min_length: fieldDraft.min ? Number(fieldDraft.min) : null,
      p_max_length: fieldDraft.max ? Number(fieldDraft.max) : null,
      p_required: fieldDraft.required,
      p_pattern: fieldDraft.pattern.trim() || null,
      p_enabled: true,
      p_hidden: false,
      p_reason: reason.trim(),
    });
    setSaving(false);
    if (error) {
      toast.push(t("admin.requirements.saveError"));
      return;
    }
    toast.push(t("admin.requirements.save").replace(" (audited)", ""));
    setFieldDraft({ key: "", min: "", max: "", required: true, pattern: "" });
    setReason("");
    await loadFieldRows(area);
  }

  async function deleteField(row: FieldRequirementRow) {
    if (fieldDeleteConfirm !== row.key) return;
    if (!reason.trim() || reason.trim().length < 5) {
      toast.push(t("admin.requirements.saveError"));
      return;
    }
    setSaving(true);
    const { error } = await getSupabase().rpc("field_requirement_delete", {
      p_id: row.id, p_reason: reason.trim(), p_confirm: true,
    });
    setSaving(false);
    if (error) {
      toast.push(t("admin.requirements.saveError"));
      return;
    }
    toast.push(t("admin.requirements.save").replace(" (audited)", ""));
    setFieldDeleteConfirm("");
    setReason("");
    await loadFieldRows(row.area);
  }

  async function toggleProvider(provider: ProviderKey, next: boolean) {
    if (!reason.trim() || reason.trim().length < 5) {
      toast.push(t("admin.requirements.saveError"));
      return;
    }
    setSaving(true);
    const { error } = await getSupabase().rpc("admin_settings_update", {
      p_key: `auth.provider.${provider}.enabled`,
      p_value: next,
      p_reason: reason.trim(),
    });
    setSaving(false);
    if (error) {
      toast.push(t("admin.requirements.saveError"));
      return;
    }
    toast.push(t("admin.requirements.save").replace(" (audited)", ""));
    setProviders((current) => (current ? { ...current, [provider]: next } : current));
    setReason("");
  }

  if (access.loading || loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-cova-muted" aria-hidden="true" />
      </div>
    );
  }

  if (!canRead) {
    return (
      <Card>
        <CardBody>
          <p className="font-semibold text-cova-ink">{t("admin.requirements.deniedTitle")}</p>
          <p className="mt-1 text-sm text-cova-mute">{t("admin.requirements.deniedDesc")}</p>
        </CardBody>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-cova-mute">{t("admin.requirements.loadError")}</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="py-3">
          <TextField
            id="requirements-reason"
            label={t("admin.requirements.reason")}
            value={reason}
            maxLength={200}
            placeholder={t("admin.requirements.reasonPlaceholder")}
            onChange={(e) => setReason(e.target.value)}
          />
        </CardBody>
      </Card>

      <Tabs
        tabs={["files", "fields", "providers", "history"] as const}
        value={tab}
        onChange={setTab}
        label={t("admin.requirements.pageTitle")}
        labels={{
          files: t("admin.requirements.tabFiles"),
          fields: t("admin.requirements.tabFields"),
          providers: t("admin.requirements.tabProviders"),
          history: t("admin.requirements.tabHistory"),
        }}
      />

      {tab === "files" && (
        <div className="space-y-3">
          {UPLOAD_AREAS.map((area) => {
            const row: UploadRequirementRow = overrides[area] ?? {
              maxKb: 2560, extensions: [], enabled: true, hidden: false,
            };
            return (
              <Card key={area}>
                <CardHeader title={humanArea(area)} description={t(`file.area.${area}` as Parameters<typeof t>[0])} />
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <TextField
                      id={`${area}-max`}
                      label={t("admin.requirements.maxKb")}
                      type="number"
                      value={String(row.maxKb)}
                      onChange={(e) =>
                        setOverrides((current) => ({
                          ...current,
                          [area]: { ...row, maxKb: Number(e.target.value) || row.maxKb },
                        }))
                      }
                      className="w-40"
                    />
                    <div className="flex items-center gap-4 pb-1">
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={row.enabled}
                          label={t("admin.requirements.enabled")}
                          onChange={(next) =>
                            setOverrides((current) => ({ ...current, [area]: { ...row, enabled: next } }))
                          }
                        />
                        {t("admin.requirements.enabled")}
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={row.hidden}
                          label={t("admin.requirements.hidden")}
                          onChange={(next) =>
                            setOverrides((current) => ({ ...current, [area]: { ...row, hidden: next } }))
                          }
                        />
                        {t("admin.requirements.hidden")}
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(row.extensions ?? []).map((extension) => (
                      <span
                        key={extension}
                        className="inline-flex items-center gap-1 rounded-full bg-cova-pale px-2.5 py-0.5 text-xs font-medium text-cova-ink"
                      >
                        {extension.toUpperCase()}
                        <button
                          type="button"
                          aria-label={`${t("admin.requirements.removeExtension")} ${extension}`}
                          onClick={() =>
                            setOverrides((current) => ({
                              ...current,
                              [area]: { ...row, extensions: row.extensions.filter((item) => item !== extension) },
                            }))
                          }
                          className="rounded-full p-0.5 hover:bg-cova-soft"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                    <input
                      value={extensionInput[area] ?? ""}
                      onChange={(e) => setExtensionInput((current) => ({ ...current, [area]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const raw = (extensionInput[area] ?? "").trim().toLowerCase().replace(/^\./, "");
                          if (raw && !row.extensions.includes(raw)) {
                            setOverrides((current) => ({
                              ...current,
                              [area]: { ...row, extensions: [...row.extensions, raw] },
                            }));
                            setExtensionInput((current) => ({ ...current, [area]: "" }));
                          }
                        }
                      }}
                      placeholder={t("admin.requirements.addExtension")}
                      aria-label={t("admin.requirements.addExtension")}
                      className="h-8 w-40 rounded-lg border border-cova-line bg-white px-2 text-xs"
                    />
                  </div>
                  {canManage && (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Button onClick={() => void saveRequirement(area, row)} disabled={saving}>
                        {t("admin.requirements.save")}
                      </Button>
                      {overrides[area] && (
                        <div className="flex items-center gap-2">
                          <input
                            value={deleteConfirm[area] ?? ""}
                            onChange={(e) => setDeleteConfirm((current) => ({ ...current, [area]: e.target.value }))}
                            placeholder={area}
                            aria-label={t("admin.requirements.deleteConfirm")}
                            className="h-9 w-32 rounded-lg border border-cova-line bg-white px-2 text-xs"
                          />
                          <Button
                            variant="secondary"
                            className="text-cova-error"
                            disabled={deleteConfirm[area] !== area}
                            onClick={() => void deleteRequirement(area)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            {t("admin.requirements.delete")}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "fields" && (
        <div className="space-y-3">
          <Card>
            <CardBody className="flex flex-wrap items-end gap-3">
              <TextField
                id="field-area"
                label={t("admin.requirements.field.area")}
                value={fieldArea}
                maxLength={60}
                onChange={(e) => setFieldArea(e.target.value.toLowerCase())}
                className="w-44"
              />
              <TextField
                id="field-key"
                label={t("admin.requirements.field.key")}
                value={fieldDraft.key}
                maxLength={60}
                onChange={(e) => setFieldDraft({ ...fieldDraft, key: e.target.value.toLowerCase() })}
                className="w-44"
              />
              <TextField
                id="field-min"
                label={t("admin.requirements.field.min")}
                type="number"
                value={fieldDraft.min}
                onChange={(e) => setFieldDraft({ ...fieldDraft, min: e.target.value })}
                className="w-24"
              />
              <TextField
                id="field-max"
                label={t("admin.requirements.field.max")}
                type="number"
                value={fieldDraft.max}
                onChange={(e) => setFieldDraft({ ...fieldDraft, max: e.target.value })}
                className="w-24"
              />
              <TextField
                id="field-pattern"
                label={t("admin.requirements.field.pattern")}
                value={fieldDraft.pattern}
                maxLength={200}
                onChange={(e) => setFieldDraft({ ...fieldDraft, pattern: e.target.value })}
                className="w-48"
              />
              <label className="flex items-center gap-2 pb-1.5 text-sm">
                <Switch
                  checked={fieldDraft.required}
                  label={t("admin.requirements.field.required")}
                  onChange={(next) => setFieldDraft({ ...fieldDraft, required: next })}
                />
                {t("admin.requirements.field.required")}
              </label>
              {canManage && (
                <Button onClick={() => void saveField(fieldArea)} disabled={saving || fieldDraft.key.length === 0}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t("admin.requirements.field.add")}
                </Button>
              )}
            </CardBody>
          </Card>

          {(fieldRows ?? []).length === 0 ? (
            <Card><CardBody><p className="text-sm text-cova-mute">{t("admin.requirements.field.none")}</p></CardBody></Card>
          ) : (
            (fieldRows ?? []).map((row) => (
              <Card key={row.id}>
                <CardBody className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-cova-ink">{row.area}/{row.key}</span>
                    <span className="text-xs text-cova-mute">
                      min {row.min_length ?? "—"} · max {row.max_length ?? "—"} · {row.required ? "required" : "optional"}
                    </span>
                  </div>
                  {row.pattern && <p className="font-mono text-xs text-cova-mute">{row.pattern}</p>}
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <input
                        value={fieldDeleteConfirm}
                        onChange={(e) => setFieldDeleteConfirm(e.target.value)}
                        placeholder={row.key}
                        aria-label={t("admin.requirements.field.deleteConfirm")}
                        className="h-8 w-36 rounded-lg border border-cova-line bg-white px-2 text-xs"
                      />
                      <Button
                        variant="secondary"
                        className="text-cova-error"
                        disabled={fieldDeleteConfirm !== row.key}
                        onClick={() => void deleteField(row)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {t("admin.requirements.delete")}
                      </Button>
                    </div>
                  )}
                </CardBody>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "providers" && (
        <Card>
          <CardHeader
            title={t("admin.requirements.providers.title")}
            description={t("admin.requirements.providers.desc")}
          />
          <CardBody className="space-y-4">
            {providers === null ? (
              <Loader2 className="h-5 w-5 animate-spin text-cova-muted" aria-hidden="true" />
            ) : (
              <>
                {PROVIDER_KEYS.map((provider) => (
                  <div key={provider} className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium capitalize text-cova-ink">{provider}</span>
                    {canManage ? (
                      <Switch
                        checked={providers[provider]}
                        label={`${provider} — ${t("admin.requirements.providers.enabled")}`}
                        onChange={(next) => void toggleProvider(provider, next)}
                      />
                    ) : (
                      <span className="text-xs text-cova-mute">
                        {providers[provider] ? t("admin.requirements.providers.enabled") : t("admin.requirements.providers.disabled")}
                      </span>
                    )}
                  </div>
                ))}
                <p className="rounded-lg bg-cova-pale px-3 py-2 text-xs text-cova-ink">
                  {t("admin.requirements.providers.configHint")} {t("admin.requirements.providers.emailNote")}
                </p>
              </>
            )}
          </CardBody>
        </Card>
      )}

      {tab === "history" && (
        <Card>
          <CardHeader title={t("admin.requirements.tabHistory")} />
          <CardBody>
            {(history ?? []).length === 0 ? (
              <p className="text-sm text-cova-mute">{t("admin.requirements.history.empty")}</p>
            ) : (
              <ul className="space-y-2">
                {(history ?? []).map((row) => (
                  <li key={row.id} className="rounded-lg border border-cova-line bg-cova-bg px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-cova-ink">{row.action}</span>
                      <span className="text-xs text-cova-mute">{new Date(row.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 text-xs text-cova-mute">
                      {row.target_type}/{row.target_id} — {row.reason}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
