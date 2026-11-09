"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Pencil, Plus, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { SearchInput } from "@/components/ui/SearchInput";
import { SelectFilter, TextAreaField, TextField } from "@/components/ui/FormField";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useI18n, useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface RuleRow {
  id: string;
  category: string;
  title: string;
  description: string;
  severity: string;
  action_guidance: string;
  status: string;
  version: number;
  effective_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface RuleVersion {
  version: number;
  category: string;
  title: string;
  description: string;
  severity: string;
  action_guidance: string;
  status: string;
  change_note: string;
  changed_by: string;
  changed_at: string;
}

const CATEGORIES = ["general", "respect", "content", "academic", "safety", "privacy", "other"];
const SEVERITIES = ["info", "low", "medium", "high", "critical"];
const STATUS_TABS = ["", "active", "draft", "archived"];

const SEVERITY_TONE: Record<string, string> = {
  info: "bg-cova-pale text-cova-ink",
  low: "bg-emerald-50 text-emerald-800",
  medium: "bg-amber-50 text-amber-800",
  high: "bg-orange-50 text-orange-800",
  critical: "bg-red-50 text-red-800",
};

const STATUS_TONE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  active: "bg-emerald-50 text-emerald-800",
  archived: "bg-cova-pale text-cova-mute",
};

function fmtDate(value: string | null, formatTag: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(formatTag, { dateStyle: "medium" }).format(new Date(value));
}

interface EditorState {
  id: string | null; // null = create
  title: string;
  description: string;
  category: string;
  severity: string;
  action_guidance: string;
  effective_at: string;
  change_note: string;
}

const EMPTY_EDITOR: EditorState = {
  id: null,
  title: "",
  description: "",
  category: "general",
  severity: "low",
  action_guidance: "",
  effective_at: "",
  change_note: "",
};

/** Rules & policies: the community rulebook with version history. Every write
 * goes through the audited admin_rule_* RPCs; the UI only renders what the
 * database returns. */
export function RulesManager() {
  const t = useT();
  const { formatTag } = useI18n();
  const toast = useToast();

  const [rows, setRows] = useState<RuleRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [history, setHistory] = useState<{ rule: RuleRow; versions: RuleVersion[] } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setAppliedQuery(query.trim()), 350);
    return () => window.clearTimeout(id);
  }, [query]);

  const load = useCallback(async () => {
    setError(false);
    const { data, error: rpcError } = await getSupabase().rpc("admin_rules_list", {
      p_query: appliedQuery.replace(/[,()%]/g, ""),
      p_category: category,
      p_status: status,
    });
    if (rpcError) {
      setError(true);
      setRows([]);
      return;
    }
    setRows((data ?? []) as RuleRow[]);
  }, [appliedQuery, category, status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount/filter change (same pattern as AdminUsers)
    void load();
  }, [load]);

  const openHistory = useCallback(
    async (rule: RuleRow) => {
      setHistory({ rule, versions: [] });
      setHistoryLoading(true);
      const { data, error: rpcError } = await getSupabase().rpc("admin_rule_versions", {
        p_rule: rule.id,
      });
      if (rpcError) {
        toast.push(t("admin.rules.historyError"));
        setHistory(null);
      } else {
        setHistory({ rule, versions: (data ?? []) as RuleVersion[] });
      }
      setHistoryLoading(false);
    },
    [t, toast],
  );

  async function saveEditor() {
    if (!editor) return;
    setEditorBusy(true);
    const supabase = getSupabase();
    const effective = editor.effective_at ? editor.effective_at : null;
    if (editor.id === null) {
      const { error: rpcError } = await supabase.rpc("admin_rule_create", {
        p_title: editor.title,
        p_description: editor.description,
        p_category: editor.category,
        p_severity: editor.severity,
        p_action_guidance: editor.action_guidance,
        p_effective_at: effective,
      });
      if (rpcError) {
        toast.push(t("admin.rules.saveError"));
        setEditorBusy(false);
        return;
      }
      toast.push(t("admin.rules.created"));
    } else {
      const { error: rpcError } = await supabase.rpc("admin_rule_update", {
        p_rule: editor.id,
        p_title: editor.title,
        p_description: editor.description,
        p_category: editor.category,
        p_severity: editor.severity,
        p_action_guidance: editor.action_guidance,
        p_effective_at: effective,
        p_change_note: editor.change_note,
      });
      if (rpcError) {
        toast.push(t("admin.rules.saveError"));
        setEditorBusy(false);
        return;
      }
      toast.push(t("admin.rules.updated"));
    }
    setEditor(null);
    setEditorBusy(false);
    await load();
  }

  async function changeStatus(rule: RuleRow, action: string) {
    const { error: rpcError } = await getSupabase().rpc("admin_rule_status", {
      p_rule: rule.id,
      p_action: action,
    });
    if (rpcError) {
      toast.push(t("admin.rules.statusError"));
      return;
    }
    toast.push(t("admin.rules.statusChanged"));
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={t("admin.rules.search")}
          className="sm:max-w-xs"
        />
        <SelectFilter
          id="rules-category-filter"
          label={t("admin.rules.categoryFilter")}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={[{ value: "", label: t("admin.rules.allCategories") }].concat(
            CATEGORIES.map((c) => ({ value: c, label: t(`admin.rules.cat.${c}` as never) })),
          )}
        />
        <div className="flex gap-1.5 overflow-x-auto">
          {STATUS_TABS.map((s) => (
            <button
              key={s || "all"}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                status === s ? "bg-cova-ink text-white" : "bg-white text-cova-mute hover:bg-cova-pale",
              )}
            >
              {s === "" ? t("admin.rules.allStatuses") : t(`admin.rules.status.${s}` as never)}
            </button>
          ))}
        </div>
        <div className="sm:ml-auto">
          <Button onClick={() => setEditor({ ...EMPTY_EDITOR })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("admin.rules.new")}
          </Button>
        </div>
      </div>

      {rows === null ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardBody>
            <p role="alert" className="text-sm font-medium text-red-800">
              {t("admin.rules.loadError")}
            </p>
          </CardBody>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={ScrollText}
              title={t("admin.rules.emptyTitle")}
              description={t("admin.rules.emptyBody")}
            />
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((rule) => (
            <li key={rule.id}>
              <Card>
                <CardBody className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", SEVERITY_TONE[rule.severity])}>
                      {t(`admin.rules.severity.${rule.severity}` as never)}
                    </span>
                    <span className="rounded-full bg-cova-pale px-2 py-0.5 text-[11px] font-semibold text-cova-ink">
                      {t(`admin.rules.cat.${rule.category}` as never)}
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_TONE[rule.status])}>
                      {t(`admin.rules.status.${rule.status}` as never)}
                    </span>
                    <span className="text-[11px] font-medium text-cova-mute">v{rule.version}</span>
                    <span className="ml-auto text-xs text-cova-mute">
                      {t("admin.rules.effective")}: {fmtDate(rule.effective_at, formatTag)}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-cova-ink">{rule.title}</h3>
                  {rule.description && (
                    <p className="whitespace-pre-line text-sm text-cova-mute">{rule.description}</p>
                  )}
                  {rule.action_guidance && (
                    <p className="rounded-lg bg-cova-bg px-3 py-2 text-xs text-cova-mute">
                      {t("admin.rules.actionGuidance")}: {rule.action_guidance}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {rule.status === "draft" && (
                      <Button variant="secondary" onClick={() => void changeStatus(rule, "publish")}>
                        {t("admin.rules.publish")}
                      </Button>
                    )}
                    {rule.status === "active" && (
                      <Button variant="secondary" onClick={() => void changeStatus(rule, "unpublish")}>
                        {t("admin.rules.unpublish")}
                      </Button>
                    )}
                    {rule.status === "archived" && (
                      <Button variant="secondary" onClick={() => void changeStatus(rule, "reactivate")}>
                        {t("admin.rules.reactivate")}
                      </Button>
                    )}
                    {rule.status !== "archived" && (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setEditor({
                            id: rule.id,
                            title: rule.title,
                            description: rule.description,
                            category: rule.category,
                            severity: rule.severity,
                            action_guidance: rule.action_guidance,
                            effective_at: rule.effective_at ?? "",
                            change_note: "",
                          })
                        }
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        {t("admin.rules.edit")}
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => void openHistory(rule)}>
                      <History className="h-4 w-4" aria-hidden="true" />
                      {t("admin.rules.history")}
                    </Button>
                    <span className="ml-auto text-xs text-cova-mute">
                      {t("admin.rules.updatedAt")}: {fmtDate(rule.updated_at, formatTag)}
                    </span>
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* create / edit modal */}
      {editor && (
        <Modal
          open
          onClose={() => setEditor(null)}
          title={editor.id === null ? t("admin.rules.newTitle") : t("admin.rules.editTitle")}
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEditor();
            }}
          >
            <TextField
              id="rule-title"
              label={t("admin.rules.titleLabel")}
              value={editor.title}
              onChange={(e) => setEditor({ ...editor, title: e.target.value })}
              required
              maxLength={160}
            />
            <TextAreaField
              id="rule-description"
              label={t("admin.rules.descLabel")}
              value={editor.description}
              onChange={(e) => setEditor({ ...editor, description: e.target.value })}
              maxLength={4000}
              rows={4}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectFilter
                id="rule-category"
                label={t("admin.rules.categoryFilter")}
                value={editor.category}
                onChange={(e) => setEditor({ ...editor, category: e.target.value })}
                options={CATEGORIES.map((c) => ({ value: c, label: t(`admin.rules.cat.${c}` as never) }))}
              />
              <SelectFilter
                id="rule-severity"
                label={t("admin.rules.severityLabel")}
                value={editor.severity}
                onChange={(e) => setEditor({ ...editor, severity: e.target.value })}
                options={SEVERITIES.map((s) => ({ value: s, label: t(`admin.rules.severity.${s}` as never) }))}
              />
            </div>
            <TextAreaField
              id="rule-action"
              label={t("admin.rules.actionLabel")}
              value={editor.action_guidance}
              onChange={(e) => setEditor({ ...editor, action_guidance: e.target.value })}
              maxLength={1000}
              rows={2}
            />
            <TextField
              id="rule-effective"
              label={t("admin.rules.effectiveLabel")}
              type="date"
              value={editor.effective_at}
              onChange={(e) => setEditor({ ...editor, effective_at: e.target.value })}
            />
            {editor.id !== null && (
              <TextField
                id="rule-change-note"
                label={t("admin.rules.changeNote")}
                value={editor.change_note}
                onChange={(e) => setEditor({ ...editor, change_note: e.target.value })}
                maxLength={200}
                placeholder={t("admin.rules.changeNoteHint")}
              />
            )}
            <p className="rounded-lg bg-cova-bg px-3 py-2 text-xs text-cova-mute">
              {editor.id === null ? t("admin.rules.createNote") : t("admin.rules.versionNote")}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditor(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={editorBusy || !editor.title.trim()}>
                {editorBusy ? t("admin.rules.saving") : t("common.save")}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* version history modal */}
      {history && (
        <Modal open onClose={() => setHistory(null)} title={t("admin.rules.historyTitle")}>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-cova-ink">{history.rule.title}</p>
            {historyLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : history.versions.length === 0 ? (
              <p className="text-sm text-cova-mute">{t("admin.rules.noHistory")}</p>
            ) : (
              <ol className="space-y-2">
                {history.versions.map((v) => (
                  <li key={v.version} className="rounded-lg border border-cova-line p-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-cova-ink">v{v.version}</span>
                      <span className={cn("rounded-full px-2 py-0.5 font-semibold", STATUS_TONE[v.status])}>
                        {t(`admin.rules.status.${v.status}` as never)}
                      </span>
                      <span className="ml-auto text-cova-mute">{fmtDate(v.changed_at, formatTag)}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-cova-ink">{v.title}</p>
                    {v.change_note && (
                      <p className="text-xs text-cova-mute">
                        {t("admin.rules.changeNote")}: {v.change_note}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
