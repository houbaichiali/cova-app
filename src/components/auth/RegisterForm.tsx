"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/FormField";
import { PasswordRequirements } from "@/components/auth/PasswordRequirements";
import { SocialAuthButtons } from "@/components/auth/SocialAuthButtons";
import { useT } from "@/i18n/client";
import { authActions } from "@/lib/auth";
import {
  validateRegister,
  type FieldErrors,
  type RegisterValues,
} from "@/lib/validation";

export function RegisterForm() {
  const router = useRouter();
  const t = useT();

  const [values, setValues] = useState<RegisterValues>({
    name: "",
    email: "",
    password: "",
    confirm: "",
    accepted: false,
  });

  const [errors, setErrors] = useState<FieldErrors<keyof RegisterValues>>({});
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof RegisterValues>(
    key: K,
    value: RegisterValues[K],
  ) => {
    setValues((previous) => ({ ...previous, [key]: value }));
  };

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (submitting) return;

    const found = validateRegister(values);
    setErrors(found);

    if (Object.keys(found).length > 0) return;

    setSubmitting(true);

    try {
      const result = await authActions.signUp({
        displayName: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
      });

      if (!result.ok) {
        console.error("Erreur d'inscription :", result.error);
        window.alert(result.error);
        return;
      }

      if (result.value.needsEmailConfirmation) {
        // Verification hub (spec 5.1/5.3) instead of a bare browser alert.
        router.push(`/verify-email?email=${encodeURIComponent(values.email.trim())}`);
        return;
      }

      router.push("/dashboard");
    } catch (error) {
      console.error("Erreur inattendue lors de l'inscription :", error);
      window.alert("Inscription impossible. Réessaie.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">
          {t("auth.register.title")}
        </h1>
        <p className="mt-1 text-sm text-cova-mute">
          {t("auth.register.subtitle")}
        </p>
      </div>

      <TextField
        id="name"
        label={t("auth.field.name")}
        autoComplete="name"
        maxLength={60}
        value={values.name}
        error={errors.name ? t(errors.name) : undefined}
        onChange={(e) => set("name", e.target.value)}
      />

      <TextField
        id="email"
        label={t("auth.field.email")}
        type="email"
        autoComplete="email"
        placeholder="name@school.edu"
        maxLength={254}
        value={values.email}
        error={errors.email ? t(errors.email) : undefined}
        onChange={(e) => set("email", e.target.value)}
      />

      <div>
        <TextField
          id="password"
          label={t("auth.field.password")}
          type="password"
          autoComplete="new-password"
          maxLength={50}
          value={values.password}
          error={errors.password ? t(errors.password) : undefined}
          onChange={(e) => set("password", e.target.value)}
        />
        {/* Spec 3.4: every requirement visible above the field, updating
            independently; submission stays blocked until all pass. */}
        <PasswordRequirements value={values.password} />
      </div>

      <TextField
        id="confirm"
        label={t("auth.field.confirm")}
        type="password"
        autoComplete="new-password"
        maxLength={50}
        value={values.confirm}
        error={errors.confirm ? t(errors.confirm) : undefined}
        onChange={(e) => set("confirm", e.target.value)}
      />

      <div>
        <label className="flex items-start gap-2 text-sm text-cova-ink">
          <input
            type="checkbox"
            checked={values.accepted}
            onChange={(e) => set("accepted", e.target.checked)}
            aria-invalid={errors.accepted ? true : undefined}
            className="mt-0.5 h-4 w-4 accent-cova-muted"
          />
          {t("auth.field.accept")}
        </label>

        {errors.accepted && (
          <p role="alert" className="mt-1.5 text-xs font-medium text-red-800">
            {t(errors.accepted)}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting && (
          <Loader2
            className="h-4 w-4 animate-spin"
            aria-hidden="true"
          />
        )}
        {submitting
          ? t("auth.register.submitting")
          : t("common.createAccount")}
      </Button>

      <SocialAuthButtons />

      <p className="text-center text-sm text-cova-mute">
        {t("auth.register.haveAccount")}{" "}
        <Link
          href="/login"
          className="font-medium text-cova-ink underline underline-offset-2"
        >
          {t("common.logIn")}
        </Link>
      </p>
    </form>
  );
}