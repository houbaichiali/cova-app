"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/FormField";
import { useT } from "@/i18n/client";
import { demoActions } from "@/lib/demo-store";
import { validateRegister, type FieldErrors, type RegisterValues } from "@/lib/validation";

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

  const set = <K extends keyof RegisterValues>(key: K, value: RegisterValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validateRegister(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    // Simulated request. Replace with a real registration call in the backend phase.
    window.setTimeout(() => {
      demoActions.signIn({ name: values.name.trim(), email: values.email.trim() });
      router.push("/dashboard");
    }, 600);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t("auth.register.title")}</h1>
        <p className="mt-1 text-sm text-cova-mute">{t("auth.register.subtitle")}</p>
      </div>
      <TextField
        id="name"
        label={t("auth.field.name")}
        autoComplete="name"
        value={values.name}
        error={errors.name && t(errors.name)}
        onChange={(e) => set("name", e.target.value)}
      />
      <TextField
        id="email"
        label={t("auth.field.email")}
        type="email"
        autoComplete="email"
        placeholder="name@school.edu"
        value={values.email}
        error={errors.email && t(errors.email)}
        onChange={(e) => set("email", e.target.value)}
      />
      <TextField
        id="password"
        label={t("auth.field.password")}
        type="password"
        autoComplete="new-password"
        hint={t("auth.field.passwordHint")}
        value={values.password}
        error={errors.password && t(errors.password)}
        onChange={(e) => set("password", e.target.value)}
      />
      <TextField
        id="confirm"
        label={t("auth.field.confirm")}
        type="password"
        autoComplete="new-password"
        value={values.confirm}
        error={errors.confirm && t(errors.confirm)}
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
        {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {submitting ? t("auth.register.submitting") : t("common.createAccount")}
      </Button>
      <p className="text-center text-sm text-cova-mute">
        {t("auth.register.haveAccount")}{" "}
        <Link href="/login" className="font-medium text-cova-ink underline underline-offset-2">
          {t("common.logIn")}
        </Link>
      </p>
    </form>
  );
}
