"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUp, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { LessonCreateModal } from "@/components/learning/LessonCreateModal";

interface LessonRow {
  id: string;
  course_id: string;
  title: string;
  summary: string | null;
  lesson_type: "external" | "native";
  position: number;
  lesson_status: string;
  duration_minutes: number | null;
}

interface ActivityRow {
  id: string;
  title: string;
  due_at: string | null;
  lesson_id: string | null;
  mode: string;
  points: number;
}

/** Teacher management for one module: lessons (add/reorder/delete), files via
 *  the lesson editor, and the module's activities. */
export function ModuleWorkspace({ courseId }: { courseId: string }) {
  const t = useT();
  const toast = useToast();
  const [lessons, setLessons] = useState<LessonRow[] | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const supabase = getSupabase();
      const { data: auth } = await supabase.auth.getUser();
      const [lessonsResult, activitiesResult, courseResult] = await Promise.all([
        supabase.from("lessons").select("id,course_id,title,summary,lesson_type,position,lesson_status,duration_minutes").eq("course_id", courseId).order("position").order("created_at"),
        supabase.from("assignments").select("id,title,due_at,lesson_id,mode,points").eq("course_id", courseId).order("due_at"),
        supabase.from("courses").select("created_by").eq("id", courseId).maybeSingle(),
      ]);
      if (lessonsResult.error) throw lessonsResult.error;
      setIsOwner(courseResult.data?.created_by === auth.user?.id);
      setLessons((lessonsResult.data ?? []) as LessonRow[]);
      setActivities((activitiesResult.data ?? []) as ActivityRow[]);
    } catch (error) {
      console.error("Unable to load the module workspace:", error);
      setLessons([]);
    }
  }, [courseId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount into component state
    void load();
  }, [load]);

  async function move(lesson: LessonRow, direction: -1 | 1) {
    if (!lessons) return;
    const index = lessons.findIndex((item) => item.id === lesson.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= lessons.length) return;
    const a = lessons[index];
    const b = lessons[target];
    if (!a || !b) return;
    const supabase = getSupabase();
    try {
      await Promise.all([
        supabase.from("lessons").update({ position: b.position || target + 1 }).eq("id", a.id),
        supabase.from("lessons").update({ position: a.position || index + 1 }).eq("id", b.id),
      ]);
      await load();
    } catch (error) {
      console.error("Unable to reorder lessons:", error);
      toast.push(t("lessons.workspace.reorderError"));
    }
  }

  async function toggleStatus(lesson: LessonRow) {
    const next = lesson.lesson_status === "published" ? "draft" : "published";
    const { error } = await getSupabase().from("lessons").update({ lesson_status: next }).eq("id", lesson.id);
    if (error) {
      toast.push(t("lessons.create.error"));
      return;
    }
    await load();
  }

  async function remove(lesson: LessonRow) {
    try {
      const supabase = getSupabase();
      const { data: files } = await supabase.from("lesson_files").select("storage_path").eq("lesson_id", lesson.id);
      const paths = ((files ?? []) as Array<{ storage_path: string }>).map((file) => file.storage_path);
      if (paths.length) await supabase.storage.from("lesson-files").remove(paths);
      await supabase.from("lesson_files").delete().eq("lesson_id", lesson.id);
      await supabase.from("lessons").delete().eq("id", lesson.id);
      await load();
    } catch (error) {
      console.error("Unable to delete the lesson:", error);
      toast.push(t("lessons.create.error"));
    }
  }

  const lessonTitle = (lessonId: string | null) => lessons?.find((lesson) => lesson.id === lessonId)?.title ?? null;

  if (!isOwner) return null;

  return (
    <Card>
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("lessons.workspace.lessons")}</h2>
          <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" aria-hidden="true" />{t("lessons.workspace.addLesson")}</Button>
        </div>

        {!lessons ? (
          <p className="text-sm text-cova-mute">{t("assignments.loading")}</p>
        ) : lessons.length === 0 ? (
          <p className="rounded-lg border border-dashed border-cova-line p-4 text-sm text-cova-mute">{t("lessons.workspace.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {lessons.map((lesson, index) => (
              <li key={lesson.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cova-line p-3">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cova-pale text-xs font-semibold">{index + 1}</span>
                    <Link href={`/courses/${courseId}/lessons/${lesson.id}`} className="truncate font-medium hover:underline">{lesson.title}</Link>
                    <Badge tone="outline">{lesson.lesson_type === "native" ? t("lessons.editor.native") : t("lessons.editor.external")}</Badge>
                    <Badge tone={lesson.lesson_status === "published" ? "soft" : "pale"}>{lesson.lesson_status === "published" ? t("lessons.editor.published") : t("assignments.detail.draft")}</Badge>
                  </span>
                  {lesson.summary && <span className="mt-0.5 block truncate text-xs text-cova-mute">{lesson.summary}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="ghost" aria-label={t("assignments.runner.moveUp")} disabled={index === 0} onClick={() => void move(lesson, -1)}><ArrowUp className="h-4 w-4" aria-hidden="true" /></Button>
                  <Button size="sm" variant="ghost" aria-label={t("assignments.runner.moveDown")} disabled={index === lessons.length - 1} onClick={() => void move(lesson, 1)}><ArrowUp className="h-4 w-4 rotate-180" aria-hidden="true" /></Button>
                  <Button size="sm" variant="secondary" onClick={() => void toggleStatus(lesson)}>{lesson.lesson_status === "published" ? t("assignments.create.saveDraft") : t("assignments.detail.publish")}</Button>
                  <Link href={`/courses/${courseId}/lessons/${lesson.id}/edit`} className="inline-flex h-8 items-center rounded-lg border border-cova-line px-3 text-sm font-medium hover:bg-cova-pale">{t("lessons.view.editLesson")}</Link>
                  <Button size="sm" variant="ghost" onClick={() => void remove(lesson)} aria-label={t("lessons.files.delete")}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-cova-line pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-md font-semibold">{t("lessons.workspace.activities")}</h3>
            <Link href={`/assignments?create=1&course=${courseId}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cova-line px-3 text-sm font-medium hover:bg-cova-pale">
              <Plus className="h-4 w-4" aria-hidden="true" />{t("lessons.workspace.addActivity")}
            </Link>
          </div>
          {activities.length === 0 ? (
            <p className="mt-2 text-sm text-cova-mute">{t("lessons.workspace.noActivities")}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {activities.map((activity) => (
                <li key={activity.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cova-line p-3 text-sm">
                  <span className="min-w-0">
                    <Link href={`/assignments/${activity.id}`} className="truncate font-medium hover:underline">{activity.title}</Link>
                    {activity.lesson_id && lessonTitle(activity.lesson_id) && (
                      <span className="ms-2 text-xs text-cova-mute">· {lessonTitle(activity.lesson_id)}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {activity.mode === "interactive" && <Badge tone="soft">{t("assignments.runner.interactive")}</Badge>}
                    <span className="text-xs text-cova-mute">{activity.due_at ? new Date(activity.due_at).toLocaleDateString() : "—"}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>

      <LessonCreateModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        modules={[]}
        courseId={courseId}
        onCreated={() => void load()}
      />
    </Card>
  );
}
