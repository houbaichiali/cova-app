"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/FormField";
import { useT } from "@/i18n/client";
import { authActions } from "@/lib/auth";
import { validateLogin, type FieldErrors } from "@/lib/validation";

export function LoginForm() {
  const router = useRouter();
  const t = useT();

  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors<"email" | "password">>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (submitting) return;

    const found = validateLogin(values);
    setErrors(found);

    if (Object.keys(found).length > 0) return;

    setSubmitting(true);

    try {
      const result = await authActions.signIn(
        values.email.trim(),
        values.password,
      );

      if (result && !result.ok) {
        window.alert(result.error);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      console.error("Erreur de connexion :", error);
      window.alert("Connexion impossible. Vérifie tes identifiants et réessaie.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t("auth.login.title")}</h1>
        <p className="mt-1 text-sm text-cova-mute">
          {t("auth.login.subtitle")}
        </p>
      </div>

      <TextField
        id="email"
        label={t("auth.field.email")}
        type="email"
        autoComplete="email"
        placeholder="name@school.edu"
        value={values.email}
        error={errors.email ? t(errors.email) : undefined}
        onChange={(e) =>
          setValues((v) => ({ ...v, email: e.target.value }))
        }
      />

      <TextField
        id="password"
        label={t("auth.field.password")}
        type="password"
        autoComplete="current-password"
        value={values.password}
        error={errors.password ? t(errors.password) : undefined}
        onChange={(e) =>
          setValues((v) => ({ ...v, password: e.target.value }))
        }
      />

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting && (
          <Loader2
            className="h-4 w-4 animate-spin"
            aria-hidden="true"
          />
        )}
        {submitting ? t("auth.login.submitting") : t("common.logIn")}
      </Button>

      <p className="text-center text-sm text-cova-mute">
        {t("auth.login.newHere")}{" "}
        <Link
          href="/register"
          className="font-medium text-cova-ink underline underline-offset-2"
        >
          {t("common.createAccount")}
        </Link>
      </p>
    </form>
  );
}