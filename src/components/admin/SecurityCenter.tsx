"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, ShieldAlert, ShieldCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextAreaField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { useI18n, useT } from "@/i18n/client";
import { useAdminAccess } from "@/lib/admin-client";
import { getSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface AdminRow {
  user_id: string;
  display_name: string | null;
  user_code: string | null;
  role_key: string;
  granted_at: string;
  mfa_ok: boolean;
}

interface AuditRow {
  action: string;
  actor: string | null;
  target_id: string;
  target_type?: string;
  reason: string;
  created_at: string;
}

interface SecurityOverview {
  admins: AdminRow[];
  role_changes: AuditRow[];
  sensitive_actions: AuditRow[];
  audit_volume: { day: string; n: number }[];
  roles: { key: string; label: string; rank: number; holders: number; permissions: number }[];
}

function fmtDate(value: string, formatTag: string): string {
  return new Intl.DateTimeFormat(formatTag, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

/** Security center. Shows ONLY what COVA actually records (audit log, MFA
 * factors, role grants). Login activity / session lists / attack detection
 * are not collected anywhere in the stack, so they are not displayed — the
 * panel says so instead of inventing data. */
export function SecurityCenter() {
  const t = useT();
  const { formatTag } = useI18n();
  const toast = useToast();
  const access = useAdminAccess();

  const [data, setData] = useState<SecurityOverview | null>(null);
  const [error, setError] = useState(false);
  const [revoke, setRevoke] = useState<AdminRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    setData(null);
    const { data: result, error: rpcError } = await getSupabase().rpc("admin_security_overview");
    if (rpcError) {
      setError(true);
      return;
    }
    setData(result as SecurityOverview);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount (same pattern as AdminUsers)
    void load();
  }, [load]);

  async function submitRevoke() {
    if (!revoke) return;
    setBusy(true);
    const { error: rpcError } = await getSupabase().rpc("admin_security_revoke_access", {
      p_user: revoke.user_id,
      p_reason: reason,
    });
    setBusy(false);
    if (rpcError) {
      toast.push(t("admin.security.revokeError"));
      return;
    }
    toast.push(t("admin.security.revoked"));
    setRevoke(null);
    setReason("");
    await load();
  }

  const maxVolume = Math.max(1, ...(data?.audit_volume ?? []).map((v) => v.n));
  const noMfa = (data?.admins ?? []).filter((a) => !a.mfa_ok);

  return (
    <div className="space-y-4">
      {error ? (
        <Card>
          <CardBody>
            <p role="alert" className="text-sm font-medium text-red-800">{t("admin.security.loadError")}</p>
          </CardBody>
        </Card>
      ) : !data ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          {/* honesty notice: what this panel does and does not show */}
          <Card>
            <CardBody className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cova-muted" aria-hidden="true" />
              <p className="text-xs text-cova-mute">{t("admin.security.honestyNote")}</p>
            </CardBody>
          </Card>

          {/* admins & MFA */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-cova-mute">{t("admin.security.admins")}</h2>
              {noMfa.length > 0 && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  {t("admin.security.noMfaCount", { count: noMfa.length })}
                </span>
              )}
            </div>
            <Card>
              <CardBody className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-cova-line text-left text-xs uppercase tracking-wide text-cova-mute">
                      <th className="px-4 py-3 font-semibold">{t("admin.security.admin")}</th>
                      <th className="px-4 py-3 font-semibold">{t("admin.users.role")}</th>
                      <th className="px-4 py-3 font-semibold">{t("admin.security.mfa")}</th>
                      <th className="hidden px-4 py-3 font-semibold md:table-cell">{t("admin.security.granted")}</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.admins.map((a) => (
                      <tr key={`${a.user_id}-${a.role_key}`} className="border-b border-cova-line/60 last:border-0">
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-cova-ink">{a.display_name ?? "—"}</span>
                          {a.user_code && <span className="block text-xs text-cova-mute">{a.user_code}</span>}
                        </td>
                        <td className="px-4 py-2.5">{t(`admin.roles.${a.role_key}` as never)}</td>
                        <td className="px-4 py-2.5">
                          {a.mfa_ok ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                              {t("admin.home.mfaOn")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800">
                              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                              {t("admin.home.mfaOff")}
                            </span>
                          )}
                        </td>
                        <td className="hidden px-4 py-2.5 text-xs text-cova-mute md:table-cell">{fmtDate(a.granted_at, formatTag)}</td>
                        <td className="px-4 py-2.5 text-right">
                          {access.role === "founder" && a.role_key !== "founder" && (
                            <Button variant="ghost" onClick={() => setRevoke(a)}>
                              <UserX className="h-4 w-4" aria-hidden="true" />
                              {t("admin.security.revoke")}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          </section>

          {/* roles summary */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cova-mute">{t("admin.security.roles")}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.roles.map((r) => (
                <Card key={r.key}>
                  <CardBody className="flex items-center gap-3 p-4">
                    <KeyRound className="h-4 w-4 shrink-0 text-cova-muted" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-cova-ink">{r.label}</p>
                      <p className="text-xs text-cova-mute">
                        {t("admin.security.holders")}: {r.holders} · {t("admin.security.permissions")}: {r.permissions}
                      </p>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          </section>

          {/* audit volume */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cova-mute">{t("admin.security.auditVolume")}</h2>
            <Card>
              <CardBody>
                <svg viewBox="0 0 640 100" role="img" aria-label={t("admin.security.auditVolume")} className="h-auto w-full">
                  {data.audit_volume.map((v, i) => {
                    const step = 606 / data.audit_volume.length;
                    const h = (v.n / maxVolume) * 76;
                    return (
                      <rect key={v.day} x={34 + i * step} y={84 - h} width={Math.max(2, step * 0.7)} height={Math.max(v.n > 0 ? 1.5 : 0, h)} rx={1.5} fill="#6F9FBA">
                        <title>{`${v.day}: ${v.n}`}</title>
                      </rect>
                    );
                  })}
                </svg>
                <p className="mt-1 text-xs text-cova-mute">{t("admin.security.auditVolumeHint")}</p>
              </CardBody>
            </Card>
          </section>

          {/* role changes */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cova-mute">{t("admin.security.roleChanges")}</h2>
            <AuditList rows={data.role_changes} emptyKey="admin.security.noRoleChanges" />
          </section>

          {/* sensitive actions */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cova-mute">{t("admin.security.sensitive")}</h2>
            <AuditList rows={data.sensitive_actions} emptyKey="admin.security.noSensitive" />
          </section>
        </>
      )}

      {/* revoke modal */}
      {revoke && (
        <Modal open onClose={() => setRevoke(null)} title={t("admin.security.revokeTitle")} description={revoke.display_name ?? undefined}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submitRevoke();
            }}
          >
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{t("admin.security.revokeWarn")}</p>
            <TextAreaField
              id="revoke-reason"
              label={t("admin.gamif.reasonLabel")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={5}
              rows={2}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setRevoke(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant="danger" disabled={busy || reason.trim().length < 5}>
                {busy ? t("admin.content.working") : t("admin.security.revokeConfirm")}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function AuditList({ rows, emptyKey }: { rows: AuditRow[]; emptyKey: Parameters<ReturnType<typeof useT>>[0] }) {
  const t = useT();
  const { formatTag } = useI18n();
  if (rows.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState icon={ShieldCheck} title={t(emptyKey)} description="" />
        </CardBody>
      </Card>
    );
  }
  return (
    <Card>
      <CardBody className="p-0">
        <ul className="divide-y divide-cova-line/60">
          {rows.map((r, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
              <span className={cn("font-mono text-xs")}>{r.action}</span>
              <span className="text-cova-mute">—</span>
              <span className="text-cova-ink">{r.actor ?? "—"}</span>
              {r.reason && <span className="max-w-60 truncate text-xs text-cova-mute">{r.reason}</span>}
              <span className="ml-auto text-xs text-cova-mute">{fmtDate(r.created_at, formatTag)}</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
