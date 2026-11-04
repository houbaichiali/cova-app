"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { TextField, TextAreaField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { useS } from "@/i18n/spaces";
import { cn } from "@/lib/utils";

const CATEGORIES = ["harassment", "spam", "inappropriate", "misinformation", "other"];
const TYPES = ["warning", "content_removal", "restriction", "suspension", "ban"];

type Report = {
  id: string; reporter_id: string | null; reported_user_id: string | null;
  subject: string; category: string; description: string; content_ref: string;
  status: string; assigned_to: string | null; resolution: string;
  created_at: string; updated_at: string;
};
type Sanction = {
  id: string; user_id: string; user_code: string | null; user_name: string | null;
  type: string; reason: string; rule_ref: string; starts_at: string; ends_at: string | null;
  status: string; issued_by: string | null; related_report_id: string | null; created_at: string;
};
type Appeal = {
  id: string; sanction_id: string; user_id: string; user_code: string | null;
  user_name: string | null; sanction_type: string | null; statement: string;
  status: string; decision_reason: string; created_at: string; decided_at: string | null;
};

const STATUS_TONE: Record<string, string> = {
  pending: "text-amber-700", under_review: "text-cova-muted", resolved: "text-emerald-700",
  rejected: "text-cova-mute", escalated: "text-red-800", active: "text-red-800",
  pending_approval: "text-amber-700", refused: "text-cova-mute", lifted: "text-emerald-700",
  accepted: "text-emerald-700",
};

function StatusChip({ status }: { status: string }) {
  const s = useS();
  return (
    <span className={cn("text-xs font-semibold", STATUS_TONE[status] ?? "text-cova-mute")}>
      {s(`lb.mod.status.${status}` as never)}
    </span>
  );
}

function fmt(date: string, formatTag: string) {
  return new Intl.DateTimeFormat(formatTag, { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
}

/** Issue-sanction modal: user found by COVA code, type, reason, duration. */
function IssueSanctionModal({
  presetUser, onClose, onIssued,
}: {
  presetUser?: { id: string; code: string; name: string } | null;
  onClose: () => void;
  onIssued: () => void;
}) {
  const s = useS();
  const toast = useToast();
  const [code, setCode] = useState(presetUser?.code ?? "");
  const [found, setFound] = useState<{ id: string; name: string } | null>(
    presetUser ? { id: presetUser.id, name: presetUser.name } : null,
  );
  const [type, setType] = useState("warning");
  const [reason, setReason] = useState("");
  const [ruleRef, setRuleRef] = useState("");
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function findUser() {
    const clean = code.replace(/[,()%]/g, "").trim();
    if (!clean) return;
    const { data, error } = await getSupabase()
      .from("profiles")
      .select("id,display_name,user_code")
      .eq("user_code", clean)
      .maybeSingle();
    if (error || !data) {
      setFound(null);
      toast.push(s("lb.mod.userNotFound"));
      return;
    }
    setFound({ id: data.id, name: data.display_name });
  }

  async function issue() {
    if (!found) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await getSupabase().rpc("admin_sanction_issue", {
        p_user: found.id,
        p_type: type,
        p_reason: reason.trim(),
        p_rule_ref: ruleRef.trim(),
        p_days: type === "suspension" && days ? Number(days) : null,
        p_related_report: null,
      });
      if (error) throw error;
      const result = data as { status: string };
      if (result.status === "pending_approval") toast.push(s("lb.mod.banPending"));
      else toast.push(s("lb.mod.sanctionIssued"));
      onIssued();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : s("lb.mod.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={s("lb.mod.issueTitle")} description={s("lb.mod.issueDesc")}>
      <div className="space-y-4">
        <TextField
          id="mod-user-code"
          label={s("lb.mod.userCode")}
          value={code}
          onChange={(e) => { setCode(e.target.value); setFound(null); }}
          placeholder="CV-XXXXXXXX"
        />
        {!found && (
          <Button variant="secondary" size="sm" onClick={() => void findUser()} disabled={!code.trim()}>
            {s("lb.mod.findUser")}
          </Button>
        )}
        {found && (
          <div className="flex items-center gap-3 rounded-lg border border-cova-line bg-cova-bg px-3 py-2">
            <Avatar name={found.name} size="sm" />
            <span className="text-sm font-medium text-cova-ink">{found.name}</span>
            <span className="ms-auto font-mono text-xs text-cova-mute">{code}</span>
          </div>
        )}
        <div>
          <p className="mb-1.5 text-sm font-medium text-cova-ink">{s("lb.mod.type")}</p>
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                aria-pressed={type === t}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  type === t ? "bg-cova-soft text-cova-ink" : "bg-cova-bg text-cova-mute hover:text-cova-ink",
                )}
              >
                {s(`lb.mod.type.${t}` as never)}
              </button>
            ))}
          </div>
        </div>
        <TextAreaField
          id="mod-reason"
          label={s("lb.mod.reason")}
          value={reason}
          maxLength={1000}
          onChange={(e) => setReason(e.target.value)}
        />
        <TextField
          id="mod-rule"
          label={s("lb.mod.ruleRef")}
          value={ruleRef}
          onChange={(e) => setRuleRef(e.target.value)}
          placeholder={s("lb.mod.ruleRefHint")}
        />
        {type === "suspension" && (
          <TextField
            id="mod-days"
            label={s("lb.mod.days")}
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        )}
        {type === "ban" && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            {s("lb.mod.banApprovalNote")}
          </p>
        )}
        {error && <p role="alert" className="text-xs font-medium text-red-800">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{s("lb.mod.cancel")}</Button>
          <Button onClick={() => void issue()} disabled={!found || !reason.trim() || busy}>
            {busy ? s("lb.mod.working") : s("lb.mod.issue")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** New staff-created report (complaint received by email, ticket…). */
function NewReportModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const s = useS();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("other");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const { error } = await getSupabase().rpc("admin_report_create", {
      p_subject: subject.trim(),
      p_category: category,
      p_description: description.trim(),
      p_reported_user: null,
      p_content_ref: "",
    });
    setBusy(false);
    if (error) return;
    onCreated();
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={s("lb.mod.newReport")}>
      <div className="space-y-4">
        <TextField id="rep-subject" label={s("lb.mod.subject")} value={subject} maxLength={160} onChange={(e) => setSubject(e.target.value)} />
        <div>
          <p className="mb-1.5 text-sm font-medium text-cova-ink">{s("lb.mod.category")}</p>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  category === c ? "bg-cova-soft text-cova-ink" : "bg-cova-bg text-cova-mute hover:text-cova-ink",
                )}
              >
                {s(`lb.mod.cat.${c}` as never)}
              </button>
            ))}
          </div>
        </div>
        <TextAreaField id="rep-desc" label={s("lb.mod.description")} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{s("lb.mod.cancel")}</Button>
          <Button onClick={() => void create()} disabled={!subject.trim() || busy}>
            {busy ? s("lb.mod.working") : s("lb.mod.create")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function ModerationCenter() {
  const s = useS();
  const toast = useToast();
  const { formatTag } = useI18nFormatter();
  const [tab, setTab] = useState<"reports" | "sanctions" | "appeals">("reports");

  const [reports, setReports] = useState<Report[] | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [sanctions, setSanctions] = useState<Sanction[] | null>(null);
  const [appeals, setAppeals] = useState<Appeal[] | null>(null);
  const [showNewReport, setShowNewReport] = useState(false);
  const [showIssue, setShowIssue] = useState(false);
  const [preset, setPreset] = useState<{ id: string; code: string; name: string } | null>(null);

  const loadReports = useCallback(async () => {
    const { data } = await getSupabase().rpc("admin_reports_list", { p_status: statusFilter });
    setReports((data ?? []) as Report[]);
  }, [statusFilter]);
  const loadSanctions = useCallback(async () => {
    const { data } = await getSupabase().rpc("admin_sanctions_list");
    setSanctions((data ?? []) as Sanction[]);
  }, []);
  const loadAppeals = useCallback(async () => {
    const { data } = await getSupabase().rpc("admin_appeals_list");
    setAppeals((data ?? []) as Appeal[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount into component state (same pattern as lib/gamification)
    void loadReports();
  }, [loadReports]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- same data-fetch pattern
    void loadSanctions();
  }, [loadSanctions]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- same data-fetch pattern
    void loadAppeals();
  }, [loadAppeals]);

  async function act(reportId: string, action: string) {
    const { error } = await getSupabase().rpc("admin_report_action", {
      p_report: reportId,
      p_action: action,
      p_note: "",
    });
    if (error) { toast.push(s("lb.mod.error")); return; }
    await loadReports();
  }

  async function approve(sanctionId: string, doApprove: boolean) {
    const { error } = await getSupabase().rpc("admin_sanction_approve", { p_sanction: sanctionId, p_approve: doApprove });
    if (error) { toast.push(s("lb.mod.error")); return; }
    await loadSanctions();
  }

  async function lift(sanctionId: string) {
    const { error } = await getSupabase().rpc("admin_sanction_lift", { p_sanction: sanctionId, p_reason: "" });
    if (error) { toast.push(s("lb.mod.error")); return; }
    await loadSanctions();
  }

  async function decide(appealId: string, decision: "accepted" | "rejected", doLift: boolean) {
    const { error } = await getSupabase().rpc("admin_appeal_decide", {
      p_appeal: appealId, p_decision: decision, p_reason: "", p_lift: doLift,
    });
    if (error) { toast.push(s("lb.mod.error")); return; }
    await loadAppeals();
  }

  const kindLabels = {
    reports: s("lb.mod.tab.reports"),
    sanctions: s("lb.mod.tab.sanctions"),
    appeals: s("lb.mod.tab.appeals"),
  };
  const tabs = [kindLabels.reports, kindLabels.sanctions, kindLabels.appeals];
  const tabValue = kindLabels[tab];

  function onKindChange(next: string) {
    setTab(next === kindLabels.sanctions ? "sanctions" : next === kindLabels.appeals ? "appeals" : "reports");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={tabs} value={tabValue} onChange={onKindChange} label={s("lb.mod.title")} />
        {tab === "reports" && (
          <Button size="sm" onClick={() => setShowNewReport(true)}>
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            {s("lb.mod.newReport")}
          </Button>
        )}
        {tab === "sanctions" && (
          <Button size="sm" onClick={() => { setPreset(null); setShowIssue(true); }}>
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            {s("lb.mod.issue")}
          </Button>
        )}
      </div>

      {/* ------------------------------------------------------------ reports */}
      {tab === "reports" && (
        <Card className="overflow-hidden">
          <CardHeader
            title={s("lb.mod.tab.reports")}
            action={
              <div className="w-44">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label={s("lb.mod.filterStatus")}
                  className="h-9 w-full rounded-lg border border-cova-line bg-white px-2 text-sm"
                >
                  <option value="">{s("lb.mod.allStatuses")}</option>
                  {["pending", "under_review", "resolved", "rejected", "escalated"].map((st) => (
                    <option key={st} value={st}>{s(`lb.mod.status.${st}` as never)}</option>
                  ))}
                </select>
              </div>
            }
          />
          <CardBody className="p-0">
            {reports === null ? (
              <div className="space-y-2 p-5" aria-busy="true">
                {Array.from({ length: 3 }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-cova-pale" />)}
              </div>
            ) : reports.length === 0 ? (
              <p className="p-5 text-sm text-cova-mute">{s("lb.mod.noReports")}</p>
            ) : (
              <ul className="divide-y divide-cova-line">
                {reports.map((report) => (
                  <li key={report.id} className="space-y-2 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-cova-ink">{report.subject}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-xs text-cova-mute">{fmt(report.created_at, formatTag)}</span>
                        <StatusChip status={report.status} />
                      </span>
                    </div>
                    <p className="text-sm text-cova-mute">{report.description || "—"}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-cova-pale px-2 py-0.5 font-medium text-cova-ink">
                        {s(`lb.mod.cat.${report.category}` as never)}
                      </span>
                      {report.assigned_to && <span className="text-cova-mute">{s("lb.mod.assigned")}</span>}
                      {(report.status === "pending" || report.status === "escalated") && (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => void act(report.id, "assign")}>
                            {s("lb.mod.assign")}
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => void act(report.id, "resolve")}>
                            {s("lb.mod.resolve")}
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => void act(report.id, "reject")}>
                            {s("lb.mod.reject")}
                          </Button>
                          {report.status === "pending" && (
                            <Button size="sm" variant="danger" onClick={() => void act(report.id, "escalate")}>
                              {s("lb.mod.escalate")}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {/* ---------------------------------------------------------- sanctions */}
      {tab === "sanctions" && (
        <Card className="overflow-hidden">
          <CardHeader title={s("lb.mod.tab.sanctions")} />
          <CardBody className="p-0">
            {sanctions === null ? (
              <div className="space-y-2 p-5" aria-busy="true">
                {Array.from({ length: 3 }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-cova-pale" />)}
              </div>
            ) : sanctions.length === 0 ? (
              <p className="p-5 text-sm text-cova-mute">{s("lb.mod.noSanctions")}</p>
            ) : (
              <ul className="divide-y divide-cova-line">
                {sanctions.map((sanction) => {
                  return (
                    <li key={sanction.id} className="space-y-1.5 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={sanction.user_name ?? "?"} size="sm" />
                          <span className="text-sm font-semibold text-cova-ink">{sanction.user_name ?? sanction.user_code}</span>
                          <span className="text-xs text-cova-mute">{sanction.user_code}</span>
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="text-xs text-cova-mute">{fmt(sanction.created_at, formatTag)}</span>
                          <StatusChip status={sanction.status} />
                        </span>
                      </div>
                      <p className="text-sm text-cova-mute">
                        <span className="font-medium">{s(`lb.mod.type.${sanction.type}` as never)}</span>
                        {" — "}
                        {sanction.reason}
                        {sanction.ends_at && ` · ${s("lb.mod.until")} ${fmt(sanction.ends_at, formatTag)}`}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {sanction.status === "pending_approval" && (
                          <>
                            <Button size="sm" onClick={() => void approve(sanction.id, true)}>{s("lb.mod.approve")}</Button>
                            <Button size="sm" variant="danger" onClick={() => void approve(sanction.id, false)}>{s("lb.mod.refuse")}</Button>
                          </>
                        )}
                        {sanction.status === "active" && (
                          <Button size="sm" variant="secondary" onClick={() => void lift(sanction.id)}>{s("lb.mod.lift")}</Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {/* ------------------------------------------------------------ appeals */}
      {tab === "appeals" && (
        <Card className="overflow-hidden">
          <CardHeader title={s("lb.mod.tab.appeals")} />
          <CardBody className="p-0">
            {appeals === null ? (
              <div className="space-y-2 p-5" aria-busy="true">
                {Array.from({ length: 2 }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-cova-pale" />)}
              </div>
            ) : appeals.length === 0 ? (
              <p className="p-5 text-sm text-cova-mute">{s("lb.mod.noAppeals")}</p>
            ) : (
              <ul className="divide-y divide-cova-line">
                {appeals.map((appeal) => (
                  <li key={appeal.id} className="space-y-2 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={appeal.user_name ?? "?"} size="sm" />
                        <span className="text-sm font-semibold text-cova-ink">{appeal.user_name ?? appeal.user_code}</span>
                        {appeal.sanction_type && (
                          <span className="text-xs text-cova-mute">
                            {s("lb.mod.appealAgainst")} {s(`lb.mod.type.${appeal.sanction_type}` as never)}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-xs text-cova-mute">{fmt(appeal.created_at, formatTag)}</span>
                        <StatusChip status={appeal.status} />
                      </span>
                    </div>
                    <p className="text-sm text-cova-mute">{appeal.statement}</p>
                    {appeal.status === "pending" && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" onClick={() => void decide(appeal.id, "accepted", true)}>{s("lb.mod.acceptLift")}</Button>
                        <Button size="sm" variant="secondary" onClick={() => void decide(appeal.id, "accepted", false)}>{s("lb.mod.acceptKeep")}</Button>
                        <Button size="sm" variant="danger" onClick={() => void decide(appeal.id, "rejected", false)}>{s("lb.mod.rejectAppeal")}</Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {showNewReport && (
        <NewReportModal
          onClose={() => setShowNewReport(false)}
          onCreated={() => void loadReports()}
        />
      )}
      {showIssue && (
        <IssueSanctionModal
          presetUser={preset}
          onClose={() => setShowIssue(false)}
          onIssued={() => void loadSanctions()}
        />
      )}
    </div>
  );
}

function useI18nFormatter() {
  const { formatTag } = useI18n();
  return { formatTag };
}
