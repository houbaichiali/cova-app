"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TextAreaField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";

const CATEGORIES = ["spam", "harassment", "inappropriate", "other"] as const;

const CATEGORY_KEYS = {
  spam: "report.cat_spam",
  harassment: "report.cat_harassment",
  inappropriate: "report.cat_inappropriate",
  other: "report.cat_other",
} as const;

/**
 * "Report content" button + dialog. Writes through the student-facing
 * report_content() RPC (20261115000003) into the moderation_reports queue the
 * Admin Center already triages. The reporter's identity is attached
 * server-side; nothing here is trusted beyond the category and description.
 */
export function ReportButton({
  contentRef,
  reportedUser,
  label,
}: {
  /** Structured reference, e.g. "space_post:<uuid>". */
  contentRef: string;
  /** Author of the reported content, when known. */
  reportedUser?: string;
  label?: string;
}) {
  const t = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("spam");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(false);
    setDescription("");
    setBusy(false);
  }

  async function submit() {
    setBusy(true);
    try {
      const { error } = await getSupabase().rpc("report_content", {
        p_category: category,
        p_description: description,
        p_reported_user: reportedUser ?? null,
        p_content_ref: contentRef,
      });
      if (error) throw error;
      toast.push(t("report.sent"));
      close();
    } catch (err) {
      toast.push(
        err instanceof Error && err.message
          ? err.message
          : t("report.error"),
      );
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={label ?? t("report.action")}
        onClick={() => setOpen(true)}
        className="h-8 w-8 shrink-0 rounded-lg p-1.5 text-cova-mute hover:bg-cova-pale hover:text-cova-ink"
      >
        <Flag className="h-5 w-5" aria-hidden="true" />
      </button>
      <Modal
        open={open}
        onClose={close}
        title={t("report.title")}
        description={t("report.desc")}
      >
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t("report.category")}</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
              className="w-full rounded-lg border border-cova-line bg-white px-3 py-2 text-sm dark:bg-cova-ink"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(CATEGORY_KEYS[c])}
                </option>
              ))}
            </select>
          </label>
          <TextAreaField
            id="report-details"
            label={t("report.details")}
            value={description}
            maxLength={1000}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={close}>
              {t("dm.cancel")}
            </Button>
            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? t("report.sending") : t("report.submit")}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
