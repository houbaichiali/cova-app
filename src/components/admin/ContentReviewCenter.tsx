"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, CheckCircle2, EyeOff, Flag, FolderOpen, Plus, RotateCcw, ShieldCheck, UserCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { SearchInput } from "@/components/ui/SearchInput";
import { SelectFilter, TextAreaField } from "@/components/ui/FormField";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { useI18n, useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface ReviewRow {
  id: string;
  content_type: string;
  content_id: string;
  title: string;
  category: string;
  author_id: string | null;
  status: string;
  reviewer_id: string | null;
  review_note: string;
  created_at: string;
  reviewed_at: string | null;
  live_title: string | null;
  live_exists: boolean;
}

interface BrowseRow {
  content_id: string;
  title: string;
  category: string;
  author_id: string | null;
  created_at: string;
  extra: string;
}

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800",
  approved: "bg-emerald-50 text-emerald-800",
  correction_requested: "bg-slate-100 text-slate-700",
  flagged: "bg-orange-50 text-orange-800",
  hidden: "bg-cova-pale text-cova-mute",
  removed: "bg-red-50 text-red-800",
};

function fmtDate(value: string | null, formatTag: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(formatTag, { dateStyle: "medium" }).format(new Date(value));
}

/** Educational content quality review. The queue records decisions; content
 * itself is never edited here (hide/remove are reversible visibility changes
 * only, enforced and audited server-side). */
export function ContentReviewCenter() {
  const t = useT();
  const { formatTag } = useI18n();
  const toast = useToast();

  const [tab, setTab] = useState<"queue" | "browse">("queue");
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("pending");
  const [error, setError] = useState(false);

  const [browseType, setBrowseType] = useState("quiz");
  const [browseQuery, setBrowseQuery] = useState("");
  const [browseRows, setBrowseRows] = useState<BrowseRow[] | null>(null);
  const [browseError, setBrowseError] = useState(false);

  const [decision, setDecision] = useState<{ row: ReviewRow; action: string } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    const { data, error: rpcError } = await getSupabase().rpc("admin_content_queue", {
      p_type: type,
      p_status: status,
    });
    if (rpcError) {
      setError(true);
      setRows([]);
      return;
    }
    setRows((data ?? []) as ReviewRow[]);
  }, [type, status]);

  const loadBrowse = useCallback(async () => {
    setBrowseError(false);
    const { data, error: rpcError } = await getSupabase().rpc("admin_content_browse", {
      p_type: browseType,
      p_query: browseQuery.trim().replace(/[,()%]/g, ""),
    });
    if (rpcError) {
      setBrowseError(true);
      setBrowseRows([]);
      return;
    }
    setBrowseRows((data ?? []) as BrowseRow[]);
  }, [browseType, browseQuery]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on filter change (same pattern as AdminUsers)
    void load();
  }, [load]);

  useEffect(() => {
    if (tab !== "browse") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on filter change (same pattern as AdminUsers)
    void loadBrowse();
  }, [tab, loadBrowse]);

  async function enqueue(contentType: string, contentId: string) {
    const { error: rpcError } = await getSupabase().rpc("admin_content_enqueue", {
      p_type: contentType,
      p_content: contentId,
    });
    if (rpcError) {
      toast.push(t("admin.content.enqueueError"));
      return;
    }
    toast.push(t("admin.content.enqueued"));
    await Promise.all([load(), loadBrowse()]);
  }

  async function assign(row: ReviewRow) {
    const { error: rpcError } = await getSupabase().rpc("admin_content_assign", { p_review: row.id });
    if (rpcError) {
      toast.push(t("admin.content.error"));
      return;
    }
    toast.push(t("admin.content.assigned"));
    await load();
  }

  async function decide() {
    if (!decision) return;
    setBusy(true);
    const { error: rpcError } = await getSupabase().rpc("admin_content_decide", {
      p_review: decision.row.id,
      p_action: decision.action,
      p_note: note,
    });
    setBusy(false);
    if (rpcError) {
      toast.push(t("admin.content.error"));
      return;
    }
    toast.push(t("admin.content.decided"));
    setDecision(null);
    setNote("");
    await load();
  }

  return (
    <div className="space-y-4">
      <Tabs
        tabs={["queue", "browse"] as const}
        value={tab}
        onChange={setTab}
        label={t("admin.content.tabQueue")}
        labels={{ queue: t("admin.content.tabQueue"), browse: t("admin.content.tabBrowse") }}
      />

      {tab === "queue" ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SelectFilter
              id="content-type-filter"
              label={t("admin.content.type")}
              value={type}
              onChange={(e) => setType(e.target.value)}
              options={[
                { value: "", label: t("admin.content.allTypes") },
                { value: "quiz", label: t("admin.content.quiz") },
                { value: "resource", label: t("admin.content.resource") },
              ]}
            />
            <SelectFilter
              id="content-status-filter"
              label={t("admin.content.statusLabel")}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={[
                { value: "pending", label: t("admin.content.st.pending") },
                { value: "approved", label: t("admin.content.st.approved") },
                { value: "correction_requested", label: t("admin.content.st.correction_requested") },
                { value: "flagged", label: t("admin.content.st.flagged") },
                { value: "hidden", label: t("admin.content.st.hidden") },
                { value: "removed", label: t("admin.content.st.removed") },
                { value: "", label: t("admin.content.allStatuses") },
              ]}
            />
          </div>

          {rows === null ? (
            <div className="space-y-3" aria-busy="true">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : error ? (
            <Card>
              <CardBody>
                <p role="alert" className="text-sm font-medium text-red-800">
                  {t("admin.content.loadError")}
                </p>
              </CardBody>
            </Card>
          ) : rows.length === 0 ? (
            <Card>
              <CardBody>
                <EmptyState
                  icon={ShieldCheck}
                  title={t("admin.content.emptyTitle")}
                  description={t("admin.content.emptyBody")}
                />
              </CardBody>
            </Card>
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => (
                <li key={row.id}>
                  <Card>
                    <CardBody className="space-y-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-cova-pale px-2 py-0.5 text-[11px] font-semibold text-cova-ink">
                          {row.content_type === "quiz" ? t("admin.content.quiz") : t("admin.content.resource")}
                        </span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_TONE[row.status])}>
                          {t(`admin.content.st.${row.status}` as never)}
                        </span>
                        {!row.live_exists && (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-800">
                            {t("admin.content.deleted")}
                          </span>
                        )}
                        <span className="ml-auto text-xs text-cova-mute">{fmtDate(row.created_at, formatTag)}</span>
                      </div>
                      <h3 className="text-sm font-semibold text-cova-ink">{row.live_title ?? row.title}</h3>
                      {row.category && <p className="text-xs text-cova-mute">{row.category}</p>}
                      {row.review_note && (
                        <p className="rounded-lg bg-cova-bg px-3 py-2 text-xs text-cova-mute">
                          {t("admin.content.note")}: {row.review_note}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {row.status === "pending" && (
                          <Button variant="secondary" onClick={() => void assign(row)}>
                            <UserCheck className="h-4 w-4" aria-hidden="true" />
                            {t("admin.content.assign")}
                          </Button>
                        )}
                        {row.status !== "approved" && row.status !== "removed" && (
                          <Button variant="secondary" onClick={() => setDecision({ row, action: "approve" })}>
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                            {t("admin.content.approve")}
                          </Button>
                        )}
                        {row.status === "pending" && (
                          <>
                            <Button variant="secondary" onClick={() => setDecision({ row, action: "request_correction" })}>
                              {t("admin.content.correction")}
                            </Button>
                            <Button variant="secondary" onClick={() => setDecision({ row, action: "flag" })}>
                              <Flag className="h-4 w-4" aria-hidden="true" />
                              {t("admin.content.flag")}
                            </Button>
                          </>
                        )}
                        {row.content_type === "quiz" && row.status !== "hidden" && row.status !== "removed" && (
                          <Button variant="secondary" onClick={() => setDecision({ row, action: "hide" })}>
                            <EyeOff className="h-4 w-4" aria-hidden="true" />
                            {t("admin.content.hide")}
                          </Button>
                        )}
                        {(row.status === "hidden" || row.status === "removed") && (
                          <Button variant="secondary" onClick={() => setDecision({ row, action: "unhide" })}>
                            <RotateCcw className="h-4 w-4" aria-hidden="true" />
                            {t("admin.content.unhide")}
                          </Button>
                        )}
                        {row.status !== "removed" && row.status !== "hidden" && (
                          <Button variant="danger" onClick={() => setDecision({ row, action: "remove" })}>
                            <XCircle className="h-4 w-4" aria-hidden="true" />
                            {t("admin.content.remove")}
                          </Button>
                        )}
                      </div>
                    </CardBody>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SelectFilter
              id="browse-type-filter"
              label={t("admin.content.type")}
              value={browseType}
              onChange={(e) => setBrowseType(e.target.value)}
              options={[
                { value: "quiz", label: t("admin.content.quiz") },
                { value: "resource", label: t("admin.content.resource") },
              ]}
            />
            <SearchInput
              value={browseQuery}
              onChange={setBrowseQuery}
              placeholder={t("admin.content.search")}
              className="sm:max-w-xs"
            />
          </div>

          {browseRows === null ? (
            <div className="space-y-3" aria-busy="true">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : browseError ? (
            <Card>
              <CardBody>
                <p role="alert" className="text-sm font-medium text-red-800">
                  {t("admin.content.loadError")}
                </p>
              </CardBody>
            </Card>
          ) : browseRows.length === 0 ? (
            <Card>
              <CardBody>
                <EmptyState
                  icon={FolderOpen}
                  title={t("admin.content.browseEmptyTitle")}
                  description={t("admin.content.browseEmptyBody")}
                />
              </CardBody>
            </Card>
          ) : (
            <ul className="space-y-2">
              {browseRows.map((row) => (
                <li key={row.content_id}>
                  <Card>
                    <CardBody className="flex flex-wrap items-center gap-3">
                      <BookOpen className="h-4 w-4 shrink-0 text-cova-muted" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-cova-ink">{row.title}</p>
                        <p className="text-xs text-cova-mute">
                          {row.category} · {row.extra} · {fmtDate(row.created_at, formatTag)}
                        </p>
                      </div>
                      <Button onClick={() => void enqueue(browseType, row.content_id)}>
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        {t("admin.content.addToQueue")}
                      </Button>
                    </CardBody>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* decision modal */}
      {decision && (
        <Modal
          open
          onClose={() => setDecision(null)}
          title={t(`admin.content.decideTitle.${decision.action}` as never)}
          description={decision.row.live_title ?? decision.row.title}
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void decide();
            }}
          >
            {(decision.action === "hide" || decision.action === "remove" || decision.action === "request_correction" || decision.action === "flag") && (
              <TextAreaField
                id="content-note"
                label={t("admin.content.noteLabel")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
                rows={3}
                required={decision.action === "remove"}
              />
            )}
            <p className="rounded-lg bg-cova-bg px-3 py-2 text-xs text-cova-mute">
              {decision.action === "hide" || decision.action === "remove"
                ? t("admin.content.visibilityNote")
                : t("admin.content.readonlyNote")}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDecision(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={busy} variant={decision.action === "remove" ? "danger" : "primary"}>
                {busy ? t("admin.content.working") : t("common.save")}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
