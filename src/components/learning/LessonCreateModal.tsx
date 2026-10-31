"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TextAreaField, TextField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";

export interface ModuleOption {
  id: string;
  title: string;
}

const LESSON_FILES_BUCKET = "lesson-files";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * "Add a lesson" flow. External and Native are LESSON types; the lesson always
 * belongs to a module (selected here when not opened from a module page).
 * External lessons upload their files inside this very form.
 */
export function LessonCreateModal({
  open,
  onClose,
  modules,
  courseId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Teacher's modules — required when the modal is opened outside a module. */
  modules: ModuleOption[];
  /** Fixed module when opened from a module management page. */
  courseId?: string;
  onCreated: (lessonId: string, lessonType: "external" | "native") => void;
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [step, setStep] = useState<"choose" | "form">("choose");
  const [lessonType, setLessonType] = useState<"external" | "native">("external");
  const [selectedModule, setSelectedModule] = useState(courseId ?? "");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [objectives, setObjectives] = useState("");
  const [duration, setDuration] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const needsModulePick = !courseId;
  const resolvedCourseId = useMemo(() => courseId ?? selectedModule, [courseId, selectedModule]);

  function reset() {
    setStep("choose");
    setTitle("");
    setSummary("");
    setObjectives("");
    setDuration("");
    setFiles([]);
    if (!courseId) setSelectedModule("");
  }

  function close() {
    if (saving) return;
    onClose();
    reset();
  }

  async function create() {
    if (saving) return;
    if (title.trim().length < 2) {
      toast.push(t("lessons.create.titleMin"));
      return;
    }
    if (!resolvedCourseId) {
      toast.push(t("lessons.create.moduleRequired"));
      return;
    }
    setSaving(true);
    let lessonId = "";
    const storagePaths: string[] = [];
    try {
      const supabase = getSupabase();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error(t("modules.create.needSignin"));

      const { data: existing } = await supabase
        .from("lessons")
        .select("position")
        .eq("course_id", resolvedCourseId)
        .order("position", { ascending: false })
        .limit(1);
      const position = (((existing ?? []) as Array<{ position: number }>)[0]?.position ?? 0) + 1;

      const { data: inserted, error } = await supabase
        .from("lessons")
        .insert({
          course_id: resolvedCourseId,
          title: title.trim(),
          summary: summary.trim(),
          content: lessonType === "external" ? summary.trim() : "",
          lesson_type: lessonType,
          position,
          lesson_status: "published",
          objectives: objectives.trim(),
          duration_minutes: duration ? Number(duration) : null,
        })
        .select("id")
        .single();
      if (error) throw error;
      lessonId = (inserted as { id: string }).id;

      // External lesson: files upload right here, straight into Storage.
      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          toast.push(t("lessons.files.tooBig"));
          continue;
        }
        const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, "-");
        const path = `${lessonId}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from(LESSON_FILES_BUCKET)
          .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
        if (uploadError) throw uploadError;
        storagePaths.push(path);
        const { error: rowError } = await supabase.from("lesson_files").insert({
          lesson_id: lessonId,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || "application/octet-stream",
          file_size: file.size,
          position: storagePaths.length - 1,
        });
        if (rowError) throw rowError;
      }

      toast.push(t("lessons.create.success"));
      onCreated(lessonId, lessonType);
      if (lessonType === "native") {
        router.push(`/courses/${resolvedCourseId}/lessons/${lessonId}/edit`);
      }
      close();
    } catch (error) {
      console.error("Unable to create the lesson:", error);
      // Roll the uploaded files back so no orphans stay in Storage.
      if (storagePaths.length) {
        try {
          await getSupabase().storage.from(LESSON_FILES_BUCKET).remove(storagePaths);
        } catch {
          // Best-effort cleanup.
        }
      }
      if (lessonId) {
        try {
          await getSupabase().from("lesson_files").delete().eq("lesson_id", lessonId);
          await getSupabase().from("lessons").delete().eq("id", lessonId);
        } catch {
          // Best-effort cleanup.
        }
      }
      toast.push((error as Error).message || t("lessons.create.error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title={step === "choose" ? t("lessons.create.title") : lessonType === "external" ? t("lessons.create.externalTitle") : t("lessons.create.nativeTitle")}>
      {step === "choose" ? (
        <div className="space-y-4">
          {needsModulePick && (
            <div>
              <label htmlFor="lesson-module" className="mb-1.5 block text-sm font-medium">{t("lessons.create.moduleLabel")}</label>
              <select
                id="lesson-module"
                value={selectedModule}
                onChange={(event) => setSelectedModule(event.target.value)}
                required
                className="h-10 w-full rounded-lg border border-cova-line bg-white px-3 text-sm"
              >
                <option value="">{t("lessons.create.modulePlaceholder")}</option>
                {modules.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}
              </select>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              disabled={needsModulePick && !selectedModule}
              onClick={() => { setLessonType("external"); setStep("form"); }}
              className="flex flex-col items-start gap-3 rounded-xl border-2 border-cova-line p-5 text-start transition-colors hover:border-cova-muted hover:bg-cova-pale/40 disabled:opacity-50"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cova-pale"><FileUp className="h-5 w-5 text-cova-muted" aria-hidden="true" /></span>
              <span className="font-semibold">{t("lessons.create.externalTitle")}</span>
              <span className="text-sm text-cova-mute">{t("lessons.create.externalDescription")}</span>
            </button>
            <button
              type="button"
              disabled={needsModulePick && !selectedModule}
              onClick={() => { setLessonType("native"); setStep("form"); }}
              className="flex flex-col items-start gap-3 rounded-xl border-2 border-cova-line p-5 text-start transition-colors hover:border-cova-muted hover:bg-cova-pale/40 disabled:opacity-50"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cova-pale"><Gamepad2 className="h-5 w-5 text-cova-muted" aria-hidden="true" /></span>
              <span className="font-semibold">{t("lessons.create.nativeTitle")}</span>
              <span className="text-sm text-cova-mute">{t("lessons.create.nativeDescription")}</span>
            </button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <TextField id="lesson-create-title" label={t("lessons.editor.lessonTitle")} value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} />
          <TextAreaField id="lesson-create-summary" label={t("modules.create.summary")} value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={500} />
          <TextAreaField id="lesson-create-objectives" label={t("modules.create.objectives")} value={objectives} onChange={(event) => setObjectives(event.target.value)} maxLength={2000} />
          <TextField id="lesson-create-duration" type="number" label={t("assignments.create.estimatedDuration")} value={duration} onChange={(event) => setDuration(event.target.value)} min={1} />

          {lessonType === "external" && (
            <div>
              <label htmlFor="lesson-create-files" className="mb-1.5 block text-sm font-medium">{t("lessons.files.upload")}</label>
              <input
                id="lesson-create-files"
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.webp"
                onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                className="block w-full rounded-lg border border-cova-line bg-white p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-cova-pale file:px-3 file:py-1.5"
              />
              <p className="mt-1 text-xs text-cova-mute">{t("lessons.files.formatsHint")}</p>
              {files.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-cova-mute">
                  {files.map((file, index) => <li key={index}>• {file.name} ({Math.max(1, Math.round(file.size / 1024))} KB)</li>)}
                </ul>
              )}
            </div>
          )}

          {lessonType === "native" && <p className="rounded-lg bg-cova-pale p-3 text-sm">{t("lessons.create.nativeHint")}</p>}

          <div className="flex justify-between gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setStep("choose")}>{t("assignments.create.back")}</Button>
            <Button type="submit" disabled={saving}>
              {saving ? t("settings.saving") : lessonType === "external" ? t("lessons.create.createWithFiles") : t("lessons.create.create")}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
