"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PasswordRequirements } from "@/components/auth/PasswordRequirements";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/FormField";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { isPasswordValid, validatePasswordConfirmation } from "@/lib/validation";

/**
 * Password reset landing (spec 5.3): the recovery link from Supabase signs the
 * person in with a recovery session on this page; the new password (with the
 * dynamic requirements checklist) is then set through updateUser. No plaintext
 * password is ever stored or logged outside Supabase Auth.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const t = useT();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isPasswordValid(password)) {
      setError(t("validation.password.min"));
      return;
    }
    const mismatch = validatePasswordConfirmation(password, confirm);
    if (!mismatch.ok) {
      setError(t(mismatch.error.key));
      return;
    }
    setBusy(true);
    setError(null);
    const { error: updateError } = await getSupabase().auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      if (/session|auth|token/i.test(updateError.message)) setInvalidLink(true);
      else setError(updateError.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 1800);
  }

  if (invalidLink) {
    return (
      <div className="space-y-4" role="alert">
        <h1 className="text-2xl font-semibold">{t("auth.reset.invalidTitle")}</h1>
        <p className="text-sm text-cova-mute">{t("auth.reset.invalidLink")}</p>
        <Link href="/forgot-password" className="inline-block text-sm font-medium text-cova-ink underline underline-offset-2">
          {t("auth.reset.requestAgain")}
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4" role="status">
        <h1 className="text-2xl font-semibold">{t("auth.reset.successTitle")}</h1>
        <p className="text-sm text-cova-mute">{t("auth.reset.success")}</p>
        <Link href="/login" className="inline-block text-sm font-medium text-cova-ink underline underline-offset-2">
          {t("auth.forgot.backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t("auth.reset.title")}</h1>
        <p className="mt-1 text-sm text-cova-mute">{t("auth.reset.subtitle")}</p>
      </div>
      <div>
        <TextField
          id="reset-password"
          label={t("auth.field.password")}
          type="password"
          autoComplete="new-password"
          maxLength={50}
          value={password}
          error={error ?? undefined}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordRequirements value={password} />
      </div>
      <TextField
        id="reset-confirm"
        label={t("auth.field.confirm")}
        type="password"
        autoComplete="new-password"
        maxLength={50}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? t("auth.reset.submitting") : t("auth.reset.submit")}
      </Button>
    </form>
  );
}
