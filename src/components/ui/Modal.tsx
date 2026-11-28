"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { useT } from "@/i18n/client";
import { EASE_PREMIUM } from "@/lib/motion";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** "md" (default, max-w-lg) or "lg" (max-w-2xl, rich content like the badge progression). */
  size?: "md" | "lg";
}

/** Accessible modal built on the native <dialog> element (focus trap, Escape to close). */
export function Modal({ open, onClose, title, description, children, size = "md" }: ModalProps) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="modal-title"
      className={`m-auto w-[calc(100%-2rem)] rounded-xl border border-cova-line bg-white p-0 text-cova-ink ${
        size === "lg" ? "max-w-2xl" : "max-w-lg"
      }`}
    >
      {/* Balanced & Premium entrance: the panel rises subtly from its trigger
          side; the native <dialog> keeps the focus trap and Escape handling. */}
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.22, ease: EASE_PREMIUM }}
          className="p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="modal-title" className="text-lg font-semibold">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-cova-mute">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.closeDialog")}
              className="rounded-lg p-1.5 text-cova-mute hover:bg-cova-pale hover:text-cova-ink"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-5">{children}</div>
        </motion.div>
      )}
    </dialog>
  );
}
