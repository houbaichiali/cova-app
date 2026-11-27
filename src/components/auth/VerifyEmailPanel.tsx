"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/FormField";
import { useT } from "@/i18n/client";
import { authActions } from "@/lib/auth";
import { validateEmail } from "@/lib/validation";

/**
 * Email verification hub (spec 5.1/5.3): after signup the person lands here
 * with their email; the confirmation link can be resent while it is pending.
 */
export function VerifyEmailPanel({ initialEmail }: { initialEmail: string }) {
  const t = useT();
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function resend() {
    const check = validateEmail(email);
    if (!check.ok) {
      setError(t(check.error.key));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await authActions.resendConfirmation(email);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setResent(true);
  }

  return (
    <div className="space-y-5" role="status">
      <div>
        <h1 className="text-2xl font-semibold">{t("auth.verify.title")}</h1>
        <p className="mt-1 text-sm text-cova-mute">{t("auth.verify.body", { email: email || "—" })}</p>
      </div>
      <TextField
        id="verify-email"
        label={t("auth.field.email")}
        type="email"
        autoComplete="email"
        maxLength={254}
        value={email}
        error={error ?? undefined}
        onChange={(e) => setEmail(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void resend()} disabled={busy || !email}>
          {busy ? t("auth.verify.sending") : t("auth.verify.resend")}
        </Button>
        {resent && <span className="text-sm text-cova-ink">{t("auth.verify.resent")}</span>}
      </div>
      <p className="text-sm text-cova-mute">
        <Link href="/login" className="font-medium text-cova-ink underline underline-offset-2">
          {t("auth.verify.toLogin")}
        </Link>
      </p>
    </div>
  );
}
