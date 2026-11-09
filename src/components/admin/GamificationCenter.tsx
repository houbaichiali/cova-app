"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Award, Coins, ImagePlus, Layers, Pencil, Plus, SearchCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { SearchInput } from "@/components/ui/SearchInput";
import { SelectFilter, TextAreaField, TextField } from "@/components/ui/FormField";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { useI18n, useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { levelThreshold } from "@/lib/level-curve";
import { cn } from "@/lib/utils";

interface BadgeRow {
  key: string;
  base_key: string;
  category: string;
  name: string;
  description: string;
  metric: string;
  threshold: number;
  rarity: string;
  xp_reward: number;
  secret: boolean;
  limited: boolean;
  enabled: boolean;
  sort_order: number;
  image_url: string | null;
  unlocked_count: number;
}

interface RecipientRow {
  user_id: string;
  user_code: string | null;
  display_name: string;
  awarded_at: string;
  recipient_number: number | null;
}

interface LedgerRow {
  id: string;
  user_id: string;
  user_code: string | null;
  display_name: string;
  event_key: string;
  amount: number;
  reason: string;
  created_at: string;
  needs_review: boolean;
}

const METRICS = [
  "registered", "profile_complete", "lessons_done", "modules_done", "streak",
  "friends", "challenges_done", "assessments_done", "perfect_scores",
  "high_scores", "code_done", "badges_count",
];
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];
const CATEGORIES = ["getting-started", "learning", "consistency", "excellence", "challenges", "community", "coding", "special"];

const RARITY_TONE: Record<string, string> = {
  common: "bg-slate-100 text-slate-700",
  uncommon: "bg-emerald-50 text-emerald-800",
  rare: "bg-sky-50 text-sky-800",
  epic: "bg-purple-50 text-purple-800",
  legendary: "bg-amber-50 text-amber-800",
};

function fmtDate(value: string | null, formatTag: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(formatTag, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

interface BadgeEditor {
  key: string;
  isNew: boolean;
  name: string;
  description: string;
  category: string;
  metric: string;
  threshold: string;
  rarity: string;
  xp_reward: string;
  secret: boolean;
  limited: boolean;
  enabled: boolean;
  sort_order: string;
  image_url: string | null;
}

/** Badge + XP management. All writes go through the audited gamification
 * RPCs; profiles.xp is never written from the client. */
export function GamificationCenter() {
  const t = useT();
  const { formatTag } = useI18n();
  const toast = useToast();

  const [tab, setTab] = useState<"badges" | "xp" | "levels">("badges");

  // badges
  const [badges, setBadges] = useState<BadgeRow[] | null>(null);
  const [badgesError, setBadgesError] = useState(false);
  const [editor, setEditor] = useState<BadgeEditor | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [recipients, setRecipients] = useState<{ badge: BadgeRow; rows: RecipientRow[] } | null>(null);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [uploadTarget, setUploadTarget] = useState<string>("");

  // xp
  const [ledger, setLedger] = useState<LedgerRow[] | null>(null);
  const [xpError, setXpError] = useState(false);
  const [xpQuery, setXpQuery] = useState("");
  const [appliedXpQuery, setAppliedXpQuery] = useState("");
  const [onlyReview, setOnlyReview] = useState(false);
  const [adjust, setAdjust] = useState<{ target?: LedgerRow } | null>(null);
  const [adjustCode, setAdjustCode] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustBusy, setAdjustBusy] = useState(false);

  const loadBadges = useCallback(async () => {
    setBadgesError(false);
    const { data, error: rpcError } = await getSupabase().rpc("admin_badges_list");
    if (rpcError) {
      setBadgesError(true);
      setBadges([]);
      return;
    }
    setBadges((data ?? []) as BadgeRow[]);
  }, []);

  const loadLedger = useCallback(async () => {
    setXpError(false);
    const { data, error: rpcError } = await getSupabase().rpc("admin_xp_history", {
      p_query: appliedXpQuery.replace(/[,()%]/g, ""),
      p_only_needs_review: onlyReview,
      p_limit: 150,
    });
    if (rpcError) {
      setXpError(true);
      setLedger([]);
      return;
    }
    setLedger((data ?? []) as LedgerRow[]);
  }, [appliedXpQuery, onlyReview]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch (same pattern as AdminUsers)
    void loadBadges();
  }, [loadBadges]);

  useEffect(() => {
    if (tab !== "xp") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch (same pattern as AdminUsers)
    void loadLedger();
  }, [tab, loadLedger]);

  useEffect(() => {
    const id = window.setTimeout(() => setAppliedXpQuery(xpQuery.trim()), 350);
    return () => window.clearTimeout(id);
  }, [xpQuery]);

  function openCreate() {
    setEditor({
      key: "", isNew: true, name: "", description: "", category: "learning",
      metric: "registered", threshold: "1", rarity: "common", xp_reward: "20",
      secret: false, limited: false, enabled: true, sort_order: "0", image_url: null,
    });
  }

  function openEdit(b: BadgeRow) {
    setEditor({
      key: b.key, isNew: false, name: b.name, description: b.description,
      category: b.category, metric: b.metric, threshold: String(b.threshold),
      rarity: b.rarity, xp_reward: String(b.xp_reward), secret: b.secret,
      limited: b.limited, enabled: b.enabled, sort_order: String(b.sort_order),
      image_url: b.image_url,
    });
  }

  async function saveBadge() {
    if (!editor) return;
    setEditorBusy(true);
    const { error: rpcError } = await getSupabase().rpc("admin_badge_save", {
      p_key: editor.key.trim().toLowerCase(),
      p_name: editor.name,
      p_description: editor.description,
      p_category: editor.category,
      p_metric: editor.metric,
      p_threshold: Math.max(1, parseInt(editor.threshold, 10) || 1),
      p_rarity: editor.rarity,
      p_xp_reward: Math.max(0, parseInt(editor.xp_reward, 10) || 0),
      p_secret: editor.secret,
      p_limited: editor.limited,
      p_enabled: editor.enabled,
      p_sort_order: parseInt(editor.sort_order, 10) || 0,
      p_image_url: editor.image_url,
    });
    setEditorBusy(false);
    if (rpcError) {
      toast.push(t("admin.gamif.saveError"));
      return;
    }
    toast.push(t("admin.gamif.saved"));
    setEditor(null);
    await loadBadges();
  }

  async function uploadImage(file: File) {
    if (!editor) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = `badges/${editor.key || "draft"}-${Date.now()}.${ext}`;
    const supabase = getSupabase();
    const { error: upError } = await supabase.storage
      .from("badge-images")
      .upload(path, file, { contentType: file.type, upsert: true });
    if (upError) {
      toast.push(t("admin.gamif.uploadError"));
      return;
    }
    const { data } = supabase.storage.from("badge-images").getPublicUrl(path);
    setEditor({ ...editor, image_url: data.publicUrl });
  }

  async function openRecipients(b: BadgeRow) {
    setRecipients({ badge: b, rows: [] });
    setRecipientsLoading(true);
    const { data, error: rpcError } = await getSupabase().rpc("admin_badge_recipients", {
      p_key: b.key, p_limit: 200,
    });
    setRecipientsLoading(false);
    if (rpcError) {
      toast.push(t("admin.gamif.loadError"));
      setRecipients(null);
      return;
    }
    setRecipients({ badge: b, rows: (data ?? []) as RecipientRow[] });
  }

  async function submitAdjust() {
    setAdjustBusy(true);
    const amount = parseInt(adjustAmount, 10);
    const idem = (crypto?.randomUUID?.() ?? `adj-${Date.now()}`).replace(/-/g, "").slice(0, 32);
    const { data, error: rpcError } = await getSupabase().rpc("admin_xp_adjust", {
      p_user: adjust?.target?.user_id ?? null,
      p_amount: amount,
      p_reason: adjustReason,
      p_idempotency_key: idem,
    });
    setAdjustBusy(false);
    if (rpcError || data === null) {
      toast.push(t("admin.gamif.adjustError"));
      return;
    }
    toast.push(t("admin.gamif.adjusted"));
    setAdjust(null);
    setAdjustCode("");
    setAdjustAmount("");
    setAdjustReason("");
    await loadLedger();
  }

  async function findUserByCode(code: string) {
    const clean = code.trim().replace(/[,()%]/g, "");
    if (!clean) return null;
    const { data, error: rpcError } = await getSupabase()
      .from("profiles")
      .select("id,user_code,display_name")
      .eq("is_sample", false)
      .or(`user_code.ilike.%${clean}%,display_name.ilike.%${clean}%`)
      .limit(1);
    if (rpcError || !data || data.length === 0) return null;
    return data[0] as { id: string; user_code: string | null; display_name: string };
  }

  async function submitAdjustByCode() {
    const found = await findUserByCode(adjustCode);
    if (!found) {
      toast.push(t("admin.gamif.userNotFound"));
      return;
    }
    setAdjustBusy(true);
    const amount = parseInt(adjustAmount, 10);
    const idem = (crypto?.randomUUID?.() ?? `adj-${Date.now()}`).replace(/-/g, "").slice(0, 32);
    const { data, error: rpcError } = await getSupabase().rpc("admin_xp_adjust", {
      p_user: found.id,
      p_amount: amount,
      p_reason: adjustReason,
      p_idempotency_key: idem,
    });
    setAdjustBusy(false);
    if (rpcError || data === null) {
      toast.push(t("admin.gamif.adjustError"));
      return;
    }
    toast.push(t("admin.gamif.adjusted"));
    setAdjust(null);
    setAdjustCode("");
    setAdjustAmount("");
    setAdjustReason("");
    await loadLedger();
  }

  const LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20];

  return (
    <div className="space-y-4">
      <Tabs
        tabs={["badges", "xp", "levels"] as const}
        value={tab}
        onChange={setTab}
        label={t("admin.gamif.tabBadges")}
        labels={{
          badges: t("admin.gamif.tabBadges"),
          xp: t("admin.gamif.tabXp"),
          levels: t("admin.gamif.tabLevels"),
        }}
      />

      {tab === "badges" && (
        <>
          <div className="flex justify-end">
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("admin.gamif.newBadge")}
            </Button>
          </div>
          {badges === null ? (
            <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : badgesError ? (
            <Card>
              <CardBody>
                <p role="alert" className="text-sm font-medium text-red-800">{t("admin.gamif.loadError")}</p>
              </CardBody>
            </Card>
          ) : badges.length === 0 ? (
            <Card>
              <CardBody>
                <EmptyState icon={Award} title={t("admin.gamif.noBadges")} description={t("admin.gamif.noBadgesBody")} />
              </CardBody>
            </Card>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {badges.map((b) => (
                <li key={b.key}>
                  <Card>
                    <CardBody className="space-y-2">
                      <div className="flex items-start gap-3">
                        {b.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- badge images live in the badge-images bucket (SVG/PNG allowed)
                          <img src={b.image_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cova-pale">
                            <Award className="h-5 w-5 text-cova-muted" aria-hidden="true" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-semibold text-cova-ink">{b.name}</span>
                            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", RARITY_TONE[b.rarity])}>
                              {t(`admin.gamif.rarity.${b.rarity}` as never)}
                            </span>
                            {!b.enabled && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                {t("admin.gamif.disabled")}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs text-cova-mute">{b.key} · {t(`admin.gamif.metric.${b.metric}` as never)} ≥ {b.threshold}</p>
                        </div>
                        <span className="ml-auto shrink-0 text-xs font-semibold text-cova-mute">
                          <Users className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                          {b.unlocked_count}
                        </span>
                      </div>
                      {b.description && <p className="line-clamp-2 text-xs text-cova-mute">{b.description}</p>}
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" onClick={() => openEdit(b)}>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          {t("admin.gamif.editBadge")}
                        </Button>
                        <Button variant="ghost" onClick={() => void openRecipients(b)}>
                          <Users className="h-4 w-4" aria-hidden="true" />
                          {t("admin.gamif.recipients")}
                        </Button>
                        <span className="ml-auto text-xs text-cova-mute">+{b.xp_reward} XP</span>
                      </div>
                    </CardBody>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "xp" && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput
              value={xpQuery}
              onChange={setXpQuery}
              placeholder={t("admin.gamif.searchLedger")}
              className="sm:max-w-xs"
            />
            <label className="flex items-center gap-2 text-sm text-cova-mute">
              <span className="sr-only">{t("admin.gamif.onlyReview")}</span>
              <Switch checked={onlyReview} onChange={setOnlyReview} label={t("admin.gamif.onlyReview")} />
            </label>
            <div className="sm:ml-auto">
              <Button onClick={() => setAdjust({})}>
                <Coins className="h-4 w-4" aria-hidden="true" />
                {t("admin.gamif.adjust")}
              </Button>
            </div>
          </div>

          {ledger === null ? (
            <div className="space-y-2" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : xpError ? (
            <Card>
              <CardBody>
                <p role="alert" className="text-sm font-medium text-red-800">{t("admin.gamif.loadError")}</p>
              </CardBody>
            </Card>
          ) : ledger.length === 0 ? (
            <Card>
              <CardBody>
                <EmptyState icon={Coins} title={t("admin.gamif.noLedger")} description={t("admin.gamif.noLedgerBody")} />
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-cova-line text-left text-xs uppercase tracking-wide text-cova-mute">
                      <th className="px-4 py-3 font-semibold">{t("admin.gamif.student")}</th>
                      <th className="px-4 py-3 font-semibold">{t("admin.gamif.event")}</th>
                      <th className="px-4 py-3 font-semibold text-right">{t("admin.gamif.amount")}</th>
                      <th className="hidden px-4 py-3 font-semibold md:table-cell">{t("admin.gamif.reason")}</th>
                      <th className="hidden px-4 py-3 font-semibold lg:table-cell">{t("admin.gamif.when")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((l) => (
                      <tr key={l.id} className="border-b border-cova-line/60 last:border-0">
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-cova-ink">{l.display_name}</span>
                          {l.user_code && <span className="block text-xs text-cova-mute">{l.user_code}</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-xs">{l.event_key}</span>
                          {l.needs_review && (
                            <span className="ml-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                              {t("admin.gamif.reviewFlag")}
                            </span>
                          )}
                        </td>
                        <td className={cn("px-4 py-2.5 text-right font-semibold", l.amount < 0 ? "text-red-800" : "text-emerald-800")}>
                          {l.amount > 0 ? "+" : ""}{l.amount}
                        </td>
                        <td className="hidden max-w-40 truncate px-4 py-2.5 text-cova-mute md:table-cell">{l.reason}</td>
                        <td className="hidden px-4 py-2.5 text-xs text-cova-mute lg:table-cell">{fmtDate(l.created_at, formatTag)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          )}
        </>
      )}

      {tab === "levels" && (
        <Card>
          <CardBody className="space-y-3">
            <p className="text-sm text-cova-mute">{t("admin.gamif.levelsIntro")}</p>
            <table className="w-full max-w-md text-sm">
              <thead>
                <tr className="border-b border-cova-line text-left text-xs uppercase tracking-wide text-cova-mute">
                  <th className="py-2 font-semibold">{t("admin.gamif.level")}</th>
                  <th className="py-2 font-semibold text-right">{t("admin.gamif.xpNeeded")}</th>
                  <th className="py-2 font-semibold text-right">{t("admin.gamif.stepToNext")}</th>
                </tr>
              </thead>
              <tbody>
                {LEVELS.map((lvl) => (
                  <tr key={lvl} className="border-b border-cova-line/60 last:border-0">
                    <td className="py-2 font-medium text-cova-ink">{lvl}</td>
                    <td className="py-2 text-right text-cova-mute">{levelThreshold(lvl).toLocaleString(formatTag)}</td>
                    <td className="py-2 text-right text-cova-mute">
                      {lvl > 0 ? `+${(levelThreshold(lvl) - levelThreshold(lvl - 1)).toLocaleString(formatTag)}` : "+500"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="rounded-lg bg-cova-bg px-3 py-2 text-xs text-cova-mute">{t("admin.gamif.levelsNote")}</p>
          </CardBody>
        </Card>
      )}

      {/* badge editor modal */}
      {editor && (
        <Modal
          open
          onClose={() => setEditor(null)}
          title={editor.isNew ? t("admin.gamif.newBadge") : t("admin.gamif.editBadge")}
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void saveBadge();
            }}
          >
            <TextField
              id="badge-key"
              label={t("admin.gamif.keyLabel")}
              value={editor.key}
              onChange={(e) => setEditor({ ...editor, key: editor.isNew ? e.target.value : editor.key })}
              disabled={!editor.isNew}
              required
              pattern="[a-z0-9_-]{2,60}"
              hint={editor.isNew ? t("admin.gamif.keyHint") : undefined}
            />
            <TextField
              id="badge-name"
              label={t("admin.gamif.nameLabel")}
              value={editor.name}
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              required
              maxLength={80}
            />
            <TextAreaField
              id="badge-desc"
              label={t("admin.gamif.descLabel")}
              value={editor.description}
              onChange={(e) => setEditor({ ...editor, description: e.target.value })}
              maxLength={500}
              rows={2}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectFilter
                id="badge-metric"
                label={t("admin.gamif.metricLabel")}
                value={editor.metric}
                onChange={(e) => setEditor({ ...editor, metric: e.target.value })}
                options={METRICS.map((m) => ({ value: m, label: t(`admin.gamif.metric.${m}` as never) }))}
              />
              <TextField
                id="badge-threshold"
                label={t("admin.gamif.thresholdLabel")}
                type="number"
                min={1}
                value={editor.threshold}
                onChange={(e) => setEditor({ ...editor, threshold: e.target.value })}
                required
              />
              <SelectFilter
                id="badge-rarity"
                label={t("admin.gamif.rarityLabel")}
                value={editor.rarity}
                onChange={(e) => setEditor({ ...editor, rarity: e.target.value })}
                options={RARITIES.map((r) => ({ value: r, label: t(`admin.gamif.rarity.${r}` as never) }))}
              />
              <TextField
                id="badge-xp"
                label={t("admin.gamif.xpRewardLabel")}
                type="number"
                min={0}
                value={editor.xp_reward}
                onChange={(e) => setEditor({ ...editor, xp_reward: e.target.value })}
                required
              />
              <SelectFilter
                id="badge-category"
                label={t("admin.gamif.categoryLabel")}
                value={editor.category}
                onChange={(e) => setEditor({ ...editor, category: e.target.value })}
                options={CATEGORIES.map((c) => ({ value: c, label: c }))}
              />
              <TextField
                id="badge-sort"
                label={t("admin.gamif.sortLabel")}
                type="number"
                value={editor.sort_order}
                onChange={(e) => setEditor({ ...editor, sort_order: e.target.value })}
              />
            </div>

            {/* image upload */}
            <div className="flex items-center gap-3">
              {editor.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- badge preview from our own bucket
                <img src={editor.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-cova-pale">
                  <Award className="h-6 w-6 text-cova-muted" aria-hidden="true" />
                </span>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadImage(f);
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setUploadTarget(editor.key);
                  fileInput.current?.click();
                }}
              >
                <ImagePlus className="h-4 w-4" aria-hidden="true" />
                {t("admin.gamif.uploadImage")}
              </Button>
              {editor.image_url && (
                <Button type="button" variant="ghost" onClick={() => setEditor({ ...editor, image_url: null })}>
                  {t("admin.gamif.removeImage")}
                </Button>
              )}
            </div>
            <input type="hidden" value={uploadTarget} readOnly />

            <div className="grid gap-2 sm:grid-cols-3">
              <Switch checked={editor.secret} onChange={(v) => setEditor({ ...editor, secret: v })} label={t("admin.gamif.secret")} />
              <Switch checked={editor.limited} onChange={(v) => setEditor({ ...editor, limited: v })} label={t("admin.gamif.limited")} />
              <Switch checked={editor.enabled} onChange={(v) => setEditor({ ...editor, enabled: v })} label={t("admin.gamif.enabled")} />
            </div>

            <p className="rounded-lg bg-cova-bg px-3 py-2 text-xs text-cova-mute">{t("admin.gamif.noDeleteNote")}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditor(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={editorBusy || !editor.name.trim() || !editor.key.trim()}>
                {editorBusy ? t("admin.gamif.saving") : t("common.save")}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* recipients modal */}
      {recipients && (
        <Modal open onClose={() => setRecipients(null)} title={`${recipients.badge.name} — ${t("admin.gamif.recipients")}`}>
          {recipientsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : recipients.rows.length === 0 ? (
            <p className="text-sm text-cova-mute">{t("admin.gamif.noRecipients")}</p>
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto">
              {recipients.rows.map((r) => (
                <li key={r.user_id} className="flex items-center gap-2 rounded-lg border border-cova-line px-3 py-2 text-sm">
                  <span className="font-medium text-cova-ink">{r.display_name}</span>
                  {r.user_code && <span className="text-xs text-cova-mute">{r.user_code}</span>}
                  {r.recipient_number !== null && (
                    <span className="ml-1 rounded-full bg-cova-pale px-2 py-0.5 text-[10px] font-semibold text-cova-ink">
                      #{r.recipient_number}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-cova-mute">{fmtDate(r.awarded_at, formatTag)}</span>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {/* XP adjust modal */}
      {adjust && (
        <Modal open onClose={() => setAdjust(null)} title={t("admin.gamif.adjustTitle")}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void (adjust.target ? submitAdjust() : submitAdjustByCode());
            }}
          >
            {adjust.target ? (
              <p className="text-sm text-cova-ink">
                {adjust.target.display_name}
                {adjust.target.user_code && <span className="ml-2 text-xs text-cova-mute">{adjust.target.user_code}</span>}
              </p>
            ) : (
              <TextField
                id="adjust-code"
                label={t("admin.gamif.studentLabel")}
                value={adjustCode}
                onChange={(e) => setAdjustCode(e.target.value)}
                placeholder="CV-…"
                required
              />
            )}
            <TextField
              id="adjust-amount"
              label={t("admin.gamif.amountLabel")}
              type="number"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              required
              hint={t("admin.gamif.amountHint")}
            />
            <TextAreaField
              id="adjust-reason"
              label={t("admin.gamif.reasonLabel")}
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              required
              minLength={5}
              rows={2}
            />
            <p className="rounded-lg bg-cova-bg px-3 py-2 text-xs text-cova-mute">{t("admin.gamif.adjustNote")}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setAdjust(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={adjustBusy || !adjustAmount || adjustReason.trim().length < 5} variant="danger">
                {adjustBusy ? t("admin.gamif.saving") : t("admin.gamif.apply")}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
