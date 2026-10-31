"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TextAreaField, TextField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";

/**
 * "Create a course" flow: pick External (materials ready outside COVA) or
 * Native (build lessons inside COVA), fill the shared module information, then
 * land on the module page to add lessons. Both types contain lessons.
 */
export function ModuleCreateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: () => void }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState("");
  const [language, setLanguage] = useState("");
  const [objectives, setObjectives] = useState("");
  const [prerequisites, setPrerequisites] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [status, setStatus] = useState<"draft" | "published">("published");

  function reset() {
    setTitle("");
    setSummary("");
    setDescription("");
    setCategory("");
    setLevel("");
    setLanguage("");
    setObjectives("");
    setPrerequisites("");
    setEstimatedMinutes("");
    setDifficulty("");
    setVisibility("public");
    setStatus("published");
  }

  function close() {
    if (saving) return;
    onClose();
    reset();
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (title.trim().length < 3) {
      toast.push(t("modules.create.titleMin"));
      return;
    }
    setSaving(true);
    try {
      const supabase = getSupabase();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error(t("modules.create.needSignin"));
      const courseId = `course-${crypto.randomUUID()}`;
      const { error } = await supabase.from("courses").insert({
        id: courseId,
        title: title.trim(),
        description: description.trim(),
        level: level.trim(),
        category: category.trim() || "General",
        instructor: auth.user.user_metadata?.full_name || auth.user.user_metadata?.name || auth.user.email?.split("@")[0] || "Teacher",
        tags: [],
        published: status === "published" && visibility === "public",
        created_by: auth.user.id,
        summary: summary.trim(),
        language: language.trim(),
        objectives: objectives.trim(),
        prerequisites: prerequisites.trim(),
        estimated_minutes: estimatedMinutes ? Number(estimatedMinutes) : null,
        difficulty: difficulty || null,
        visibility,
        module_status: status,
      });
      if (error) throw error;
      toast.push(t("modules.create.success"));
      onCreated?.();
      router.push(`/courses/${courseId}`);
    } catch (error) {
      console.error("Unable to create the module:", error);
      toast.push((error as Error).message || t("courses.create.failure"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title={t("modules.create.title")}>
      <form onSubmit={create} className="space-y-4">
        <TextField id="module-title" label={t("modules.create.moduleTitle")} value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} />
        <TextField id="module-summary" label={t("modules.create.summary")} value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={200} />
        <TextAreaField id="module-description" label={t("modules.create.description")} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={10000} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="module-category" label={t("assignments.create.category")} value={category} onChange={(event) => setCategory(event.target.value)} />
          <TextField id="module-level" label={t("assignments.create.level")} value={level} onChange={(event) => setLevel(event.target.value)} />
          <TextField id="module-language" label={t("modules.create.language")} value={language} onChange={(event) => setLanguage(event.target.value)} />
          <TextField id="module-duration" type="number" label={t("assignments.create.estimatedDuration")} value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(event.target.value)} min={1} />
        </div>
        <TextAreaField id="module-objectives" label={t("modules.create.objectives")} value={objectives} onChange={(event) => setObjectives(event.target.value)} maxLength={3000} />
        <TextAreaField id="module-prerequisites" label={t("modules.create.prerequisites")} value={prerequisites} onChange={(event) => setPrerequisites(event.target.value)} maxLength={2000} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="module-difficulty" className="mb-1.5 block text-sm font-medium">{t("assignments.create.difficulty")}</label>
            <select id="module-difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="h-10 w-full rounded-lg border border-cova-line bg-white px-3 text-sm">
              <option value="">{t("assignments.create.none")}</option>
              <option value="easy">{t("assignments.create.easy")}</option>
              <option value="medium">{t("assignments.create.medium")}</option>
              <option value="hard">{t("assignments.create.hard")}</option>
            </select>
          </div>
          <div>
            <label htmlFor="module-visibility" className="mb-1.5 block text-sm font-medium">{t("modules.create.visibility")}</label>
            <select id="module-visibility" value={visibility} onChange={(event) => setVisibility(event.target.value as "public" | "private")} className="h-10 w-full rounded-lg border border-cova-line bg-white px-3 text-sm">
              <option value="public">{t("settings.vis.public")}</option>
              <option value="private">{t("settings.vis.private")}</option>
            </select>
          </div>
        </div>
        <div className="flex justify-between gap-2 pt-2">
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={saving} onClick={() => { setStatus("draft"); void create({ preventDefault: () => undefined } as FormEvent); }}>
              {t("assignments.create.saveDraft")}
            </Button>
            <Button type="submit" disabled={saving}>{saving ? t("settings.saving") : t("assignments.create.publish")}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
