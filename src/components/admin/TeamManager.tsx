"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus, UserX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { SelectFilter, TextField } from "@/components/ui/FormField";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useI18n, useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface TeamRow {
  grant_id: string;
  user_id: string;
  user_code: string | null;
  display_name: string | null;
  role_key: string;
  role_label: string;
  role_rank: number;
  granted_by_name: string | null;
  granted_at: string;
  revoked_at: string | null;
  mfa_ok: boolean;
}

const GRANTABLE_ROLES = ["admin", "moderator", "content_manager", "support", "analyst"];

function fmtDate(value: string | null, formatTag: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(formatTag, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

/** Team management: founder-only. Grant and revoke go through audited
 * founder-only RPCs; founder accounts are never created or demoted here. */
export function TeamManager() {
  const t = useT();
  const { formatTag } = useI18n();
  const toast = useToast();

  const [rows, setRows] = useState<TeamRow[] | null>(null);
  const [error, setError] = useState(false);
  const [granting, setGranting] = useState(false);
  const [code, setCode] = useState("");
  const [role, setRole] = useState("moderator");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<TeamRow | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const load = useCallback(async () => {
    setError(false);
    const { data, error: rpcError } = await getSupabase().rpc("admin_team_list");
    if (rpcError) {
      setError(true);
      setRows([]);
      return;
    }
    setRows((data ?? []) as TeamRow[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount (same pattern as AdminUsers)
    void load();
  }, [load]);

  async function submitGrant() {
    setBusy(true);
    const { error: rpcError } = await getSupabase().rpc("admin_team_grant", {
      p_user_code: code,
      p_role_key: role,
      p_reason: reason,
    });
    setBusy(false);
    if (rpcError) {
      toast.push(t("admin.team.grantError"));
      return;
    }
    toast.push(t("admin.team.granted"));
    setGranting(false);
    setCode("");
    setReason("");
    await load();
  }

  async function submitRevoke() {
    if (!revoking) return;
    setBusy(true);
    const { error: rpcError } = await getSupabase().rpc("admin_team_revoke", {
      p_grant: revoking.grant_id,
      p_reason: revokeReason,
    });
    setBusy(false);
    if (rpcError) {
      toast.push(t("admin.team.revokeError"));
      return;
    }
    toast.push(t("admin.team.revoked"));
    setRevoking(null);
    setRevokeReason("");
    await load();
  }

  const active = (rows ?? []).filter((r) => !r.revoked_at);
  const past = (rows ?? []).filter((r) => r.revoked_at);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-sm text-cova-mute">{t("admin.team.intro")}</p>
        <div className="ml-auto">
          <Button onClick={() => setGranting(true)}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            {t("admin.team.grant")}
          </Button>
        </div>
      </div>

      {error ? (
        <Card>
          <CardBody>
            <p role="alert" className="text-sm font-medium text-red-800">{t("admin.team.loadError")}</p>
          </CardBody>
        </Card>
      ) : rows === null ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <Card>
            <CardBody className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cova-line text-left text-xs uppercase tracking-wide text-cova-mute">
                    <th className="px-4 py-3 font-semibold">{t("admin.gamif.student")}</th>
                    <th className="px-4 py-3 font-semibold">{t("admin.users.role")}</th>
                    <th className="px-4 py-3 font-semibold">{t("admin.security.mfa")}</th>
                    <th className="hidden px-4 py-3 font-semibold md:table-cell">{t("admin.security.granted")}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {active.map((r) => (
                    <tr key={r.grant_id} className="border-b border-cova-line/60 last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-cova-ink">{r.display_name ?? "—"}</span>
                        {r.user_code && <span className="block text-xs text-cova-mute">{r.user_code}</span>}
                      </td>
                      <td className="px-4 py-2.5">{r.role_label}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn("text-xs font-semibold", r.mfa_ok ? "text-emerald-700" : "text-amber-800")}>
                          {r.mfa_ok ? t("admin.home.mfaOn") : t("admin.home.mfaOff")}
                        </span>
                      </td>
                      <td className="hidden px-4 py-2.5 text-xs text-cova-mute md:table-cell">
                        {fmtDate(r.granted_at, formatTag)} · {r.granted_by_name ?? "bootstrap"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {r.role_key !== "founder" && (
                          <Button variant="ghost" onClick={() => setRevoking(r)}>
                            <UserX className="h-4 w-4" aria-hidden="true" />
                            {t("admin.team.revoke")}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          {past.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-cova-mute">{t("admin.team.past")}</h2>
              <Card>
                <CardBody className="p-0">
                  <ul className="divide-y divide-cova-line/60">
                    {past.map((r) => (
                      <li key={r.grant_id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                        <span className="font-medium text-cova-ink">{r.display_name ?? "—"}</span>
                        <span className="text-xs text-cova-mute">{r.role_label}</span>
                        <span className="ml-auto text-xs text-cova-mute">
                          {t("admin.team.revokedOn")} {fmtDate(r.revoked_at, formatTag)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            </section>
          )}
        </>
      )}

      {/* grant modal */}
      {granting && (
        <Modal open onClose={() => setGranting(false)} title={t("admin.team.grantTitle")}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submitGrant();
            }}
          >
            <TextField
              id="team-code"
              label={t("admin.team.codeLabel")}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="CV-…"
              required
            />
            <SelectFilter
              id="team-role"
              label={t("admin.users.role")}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              options={GRANTABLE_ROLES.map((r) => ({ value: r, label: t(`admin.roles.${r}` as never) }))}
            />
            <TextField
              id="team-reason"
              label={t("admin.gamif.reasonLabel")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={5}
            />
            <p className="rounded-lg bg-cova-bg px-3 py-2 text-xs text-cova-mute">{t("admin.team.grantNote")}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setGranting(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={busy || !code.trim() || reason.trim().length < 5}>
                {busy ? t("admin.gamif.saving") : t("admin.team.grantConfirm")}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* revoke modal */}
      {revoking && (
        <Modal open onClose={() => setRevoking(null)} title={t("admin.team.revokeTitle")} description={revoking.display_name ?? undefined}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submitRevoke();
            }}
          >
            <p className="text-sm text-cova-mute">
              {t("admin.users.role")}: <strong>{revoking.role_label}</strong>
            </p>
            <TextField
              id="team-revoke-reason"
              label={t("admin.gamif.reasonLabel")}
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              required
              minLength={5}
            />
            <p className="rounded-lg bg-cova-bg px-3 py-2 text-xs text-cova-mute">{t("admin.team.revokeNote")}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setRevoking(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant="danger" disabled={busy || revokeReason.trim().length < 5}>
                {busy ? t("admin.content.working") : t("admin.team.revokeConfirm")}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
