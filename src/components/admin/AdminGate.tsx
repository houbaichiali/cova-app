"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { QrCode, ShieldOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { TextField } from "@/components/ui/FormField";
import { useAdminAccess } from "@/lib/admin-client";
import { getSupabase } from "@/lib/supabase/client";
import { useT } from "@/i18n/client";
import { useToast } from "@/components/ui/Toast";

/** Enrollment flow for the mandatory TOTP second factor. On success the
 * session AAL upgrades and access re-checks through admin_my_access. */
function MfaEnroll({ onDone }: { onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    setRawError(null);
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "COVA Admin",
      });
      if (error) throw error;
      if (data.type !== "totp") throw new Error("unexpected factor");
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: data.id,
      });
      if (challengeError) throw challengeError;
      setChallengeId(challenge.id);
    } catch (e) {
      setError(t("admin.mfa.error"));
      // Surface the real reason (e.g. "MFA is disabled for this project").
      setRawError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!factorId || !challengeId) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await getSupabase().auth.mfa.verify({
        challengeId,
        factorId,
        code: code.replace(/\D/g, ""),
      });
      if (error) throw error;
      toast.push(t("admin.mfa.done"));
      onDone();
    } catch {
      setError(t("admin.mfa.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardBody className="space-y-4 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cova-pale text-cova-ink">
          <QrCode className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="text-xl font-semibold text-cova-ink">{t("admin.mfa.title")}</h1>
        <p className="text-sm text-cova-mute">{t("admin.mfa.body")}</p>

        {!qr ? (
          <Button className="w-full" onClick={() => void start()} disabled={busy}>
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {busy ? t("admin.mfa.verifying") : t("admin.mfa.start")}
          </Button>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG QR data URI from Supabase */}
            <img src={qr} alt="TOTP QR code" className="mx-auto h-48 w-48 rounded-xl bg-white p-2" />
            <p className="text-xs text-cova-mute">
              {t("admin.mfa.manual")} <code className="break-all font-mono">{secret}</code>
            </p>
            <TextField
              id="admin-mfa-code"
              label={t("admin.mfa.codeLabel")}
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              error={error ?? undefined}
            />
            <Button className="w-full" onClick={() => void verify()} disabled={busy || code.length !== 6}>
              {busy ? t("admin.mfa.verifying") : t("admin.mfa.verify")}
            </Button>
          </>
        )}
        {error && !qr && (
          <div className="text-xs">
            <p role="alert" className="font-medium text-red-800">
              {error}
            </p>
            {rawError && (
              <p className="mt-1 rounded bg-red-50 px-2 py-1 font-mono text-[11px] text-red-900">
                {rawError}
              </p>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** Server-decision mirror for routing: renders children only for admins with
 * a verified second factor. The real enforcement stays in the database
 * (is_admin_user / admin_my_access) and in every admin API gate. */
export function AdminGate({ children }: { children: ReactNode }) {
  const t = useT();
  const access = useAdminAccess();

  if (access.loading) {
    return (
      <div className="min-h-screen bg-cova-bg p-6" aria-busy="true">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="h-8 w-56 animate-pulse rounded-lg bg-cova-pale" />
          <div className="h-64 animate-pulse rounded-xl bg-cova-pale" />
        </div>
      </div>
    );
  }

  if (!access.isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cova-bg p-6">
        <Card className="w-full max-w-md">
          <CardBody className="space-y-4 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-800">
              <ShieldOff className="h-7 w-7" aria-hidden="true" />
            </span>
            <h1 className="text-xl font-semibold text-cova-ink">{t("admin.gate.denied")}</h1>
            <p className="text-sm text-cova-mute">{t("admin.gate.deniedBody")}</p>
            <Link href="/dashboard">
              <Button variant="secondary" className="w-full">
                {t("admin.gate.back")}
              </Button>
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (!access.mfaOk) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cova-bg p-6">
        <div className="w-full max-w-md space-y-4">
          <MfaEnroll onDone={access.reload} />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
