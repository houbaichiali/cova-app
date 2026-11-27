"use client";

import { ExternalLink, FileWarning, FileX, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useI18n, useT } from "@/i18n/client";
import { fileMasterUrl, formatKB, type FileIssue } from "@/lib/file-policy";

/**
 * Rich upload-rejection cards (spec 4.4–4.6): the size problem and the type
 * problem are clearly separated, with the real numbers (actual KB, allowed
 * KB, difference), the detected type (content signature) and the destination.
 * Compression and conversion point to File Master in a NEW tab — COVA never
 * transmits the file anywhere and never claims the conversion happened; the
 * returned file is revalidated from scratch. "Choose another file" re-opens
 * the original picker without losing any form state.
 */
export function FileWarningCard({
  issue,
  onChooseAnother,
  onDismiss,
}: {
  issue: FileIssue;
  /** Re-opens the file picker so the user can select a valid file. */
  onChooseAnother?: () => void;
  /** Removes the card once handled. */
  onDismiss?: () => void;
}) {
  const t = useT();
  const { locale } = useI18n();
  const destination = t(`file.area.${issue.area}` as Parameters<typeof t>[0]);

  const titleKey =
    issue.kind === "too_large" ? "file.tooLarge.title" : issue.kind === "wrong_type" ? "file.wrongType.title" : "file.both.title";
  const messageKey =
    issue.kind === "too_large" ? "file.tooLarge.message" : issue.kind === "wrong_type" ? "file.wrongType.message" : "file.both.message";
  const hintKey =
    issue.kind === "too_large" ? "file.tooLarge.hint" : issue.kind === "wrong_type" ? "file.master.explain" : "file.both.hint";

  return (
    <div
      role="alert"
      className="mt-3 rounded-xl border border-cova-error/30 bg-cova-bg p-4 text-sm shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {issue.kind === "wrong_type" ? (
            <FileX className="mt-0.5 h-5 w-5 shrink-0 text-cova-error" aria-hidden="true" />
          ) : (
            <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-cova-error" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <p className="font-semibold text-cova-ink">{t(titleKey)}</p>
            <p className="mt-0.5 text-cova-mute">
              {t(messageKey, { actual: issue.extension, expected: issue.expected })}
            </p>
          </div>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t("file.action.dismiss")}
            className="rounded-lg p-1 text-cova-mute hover:bg-cova-pale hover:text-cova-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs text-cova-mute">{t("file.selectedFile")}</dt>
          <dd className="truncate font-medium text-cova-ink">{issue.fileName}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-cova-mute">{t("file.currentSize")}</dt>
          <dd className="font-medium text-cova-ink">{formatKB(issue.actualKB, locale)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-cova-mute">{t("file.maxSize")}</dt>
          <dd className="font-medium text-cova-ink">{formatKB(issue.maxKB, locale)}</dd>
        </div>
        {issue.actualKB > issue.maxKB && (
          <div className="min-w-0">
            <dt className="text-xs text-cova-mute">{t("file.difference")}</dt>
            <dd className="font-medium text-cova-error">
              {formatKB(issue.actualKB - issue.maxKB, locale)}
            </dd>
          </div>
        )}
        <div className="min-w-0">
          <dt className="text-xs text-cova-mute">{t("file.actualType")}</dt>
          <dd className="truncate font-medium text-cova-ink">{issue.actualType}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-cova-mute">{t("file.expectedType")}</dt>
          <dd className="truncate font-medium text-cova-ink">{issue.expected}</dd>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <dt className="text-xs text-cova-mute">{t("file.destination")}</dt>
          <dd className="font-medium text-cova-ink">{destination}</dd>
        </div>
      </dl>

      {issue.signatureMismatch && (
        <p className="mt-3 rounded-lg bg-cova-pale px-3 py-2 text-xs text-cova-ink">
          {t("file.signature.mismatch", { expected: issue.expected })}
        </p>
      )}

      <p className="mt-3 text-xs text-cova-mute">
        {issue.kind === "wrong_type" ? t(hintKey) : t(hintKey)}
      </p>
      {issue.kind !== "too_large" && (
        <p className="mt-1 text-xs text-cova-mute">{t("file.master.explain")}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {onChooseAnother && (
          <Button variant="secondary" onClick={onChooseAnother}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t("file.action.choose")}
          </Button>
        )}
        {issue.kind !== "wrong_type" && (
          <Button onClick={() => window.open(fileMasterUrl(), "_blank", "noopener,noreferrer")}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {t("file.action.compress")}
          </Button>
        )}
        {issue.kind !== "too_large" && (
          <Button onClick={() => window.open(fileMasterUrl(), "_blank", "noopener,noreferrer")}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {t("file.action.convert")}
          </Button>
        )}
      </div>
    </div>
  );
}
