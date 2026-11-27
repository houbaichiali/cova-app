"use client";

import { Check, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { passwordChecks } from "@/lib/validation";
import { cn } from "@/lib/utils";

/**
 * Dynamic password requirements checklist (spec 3.4): all requirements are
 * visible above the field, each one updates independently as the user types,
 * colors are paired with an icon and accessible status text (never color
 * alone), and the list is announced politely through aria-live. Submission
 * stays blocked until every requirement passes — the parent checks
 * isPasswordValid() before calling Supabase.
 */
export function PasswordRequirements({ value }: { value: string }) {
  const t = useT();
  const checks = passwordChecks(value);

  return (
    <div
      aria-live="polite"
      className="mt-2 rounded-lg border border-cova-line bg-cova-bg px-3 py-2.5"
    >
      <p className="text-xs font-semibold text-cova-ink">{t("validation.password.title")}</p>
      <ul className="mt-1.5 space-y-1">
        {checks.map((check) => (
          <li
            key={check.key}
            className={cn(
              "flex items-center gap-2 text-xs",
              check.ok ? "text-cova-ink" : "text-cova-mute",
            )}
          >
            {check.ok ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-cova-success" aria-hidden="true" />
            ) : (
              <X className="h-3.5 w-3.5 shrink-0 text-cova-error" aria-hidden="true" />
            )}
            <span aria-hidden="true">{t(check.key)}</span>
            <span className="sr-only">{`${t(check.key)} — ${
              check.ok ? t("validation.status.ok") : t("validation.status.pending")
            }`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
