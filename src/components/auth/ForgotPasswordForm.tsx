"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/FormField";
import { useT } from "@/i18n/client";
import { authActions } from "@/lib/auth";
import { validateEmail } from "@/lib/validation";

/** Forgot password (spec 5.3): sends the Supabase recovery email whose link
 * lands on /reset-password. The response never reveals whether the address
 * exists — the same confirmation is shown either way. */
export function ForgotPasswordForm() {
  const router = useRouter();
  const t = useT();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const check = validateEmail(email);
    if (!check.ok) {
      setError(t(check.error.key));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await authActions.requestPasswordReset(email);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
    void router.prefetch("/login");
  }

  if (sent) {
    return (
      <div className="space-y-4" role="status">
        <h1 className="text-2xl font-semibold">{t("auth.forgot.sentTitle")}</h1>
        <p className="text-sm text-cova-mute">{t("auth.forgot.sent")}</p>
        <Link href="/login" className="inline-block text-sm font-medium text-cova-ink underline underline-offset-2">
          {t("auth.forgot.backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t("auth.forgot.title")}</h1>
        <p className="mt-1 text-sm text-cova-mute">{t("auth.forgot.subtitle")}</p>
      </div>
      <TextField
        id="forgot-email"
        label={t("auth.field.email")}
        type="email"
        autoComplete="email"
        maxLength={254}
        value={email}
        error={error ?? undefined}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? t("auth.forgot.submitting") : t("auth.forgot.submit")}
      </Button>
      <p className="text-center text-sm text-cova-mute">
        <Link href="/login" className="font-medium text-cova-ink underline underline-offset-2">
          {t("auth.forgot.backToLogin")}
        </Link>
      </p>
    </form>
  );
}
