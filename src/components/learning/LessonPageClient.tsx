"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { LessonEditor } from "@/components/learning/LessonEditor";
import { LessonView, type LessonMeta } from "@/components/learning/LessonView";
import type { LessonBlock } from "@/components/learning/lesson-blocks";

type LessonRow = LessonMeta;

/** Loads one lesson + its neighbours, then renders the editor (owner) or the
 *  reading view (students, and the owner's preview). */
export function LessonPageClient({ courseId, lessonId, edit }: { courseId: string; lessonId: string; edit?: boolean }) {
  const t = useT();
  const [course, setCourse] = useState<{ id: string; title: string; created_by: string } | null>(null);
  const [lesson, setLesson] = useState<LessonRow | null>(null);
  const [previous, setPrevious] = useState<{ id: string; title: string } | null>(null);
  const [next, setNext] = useState<{ id: string; title: string } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getSupabase();
      const [{ data: auth }, { data: courseRow, error: courseError }, { data: lessonRow, error: lessonError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("courses").select("id,title,created_by").eq("id", courseId).maybeSingle(),
        supabase.from("lessons").select("id,course_id,title,summary,content,lesson_type,position,lesson_status,content_blocks,objectives,duration_minutes").eq("id", lessonId).maybeSingle(),
      ]);
      if (courseError) throw courseError;
      if (lessonError) throw lessonError;
      if (!courseRow || !lessonRow || (lessonRow as LessonRow).course_id !== courseId) {
        setError(true);
        return;
      }
      setCourse(courseRow as { id: string; title: string; created_by: string });
      setUserId(auth.user?.id ?? null);
      setLesson(lessonRow as LessonRow);
      const { data: siblings } = await supabase
        .from("lessons")
        .select("id,title,position,lesson_status")
        .eq("course_id", courseId)
        .order("position");
      const rows = (siblings ?? []) as Array<{ id: string; title: string; position: number; lesson_status: string }>;
      const current = rows.find((row) => row.id === lessonId);
      const isOwner = courseRow.created_by === auth.user?.id;
      const visible = rows.filter((row) => isOwner || row.lesson_status === "published");
      const index = visible.findIndex((row) => row.id === lessonId);
      setPrevious(index > 0 ? visible[index - 1] ?? null : null);
      setNext(index >= 0 && index < visible.length - 1 ? visible[index + 1] ?? null : null);
      if (!current) setError(true);
    } catch (loadError) {
      console.error("Unable to load the lesson:", loadError);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [courseId, lessonId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount into component state
    void load();
  }, [load]);

  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error || !lesson || !course) {
    return (
      <Card><CardBody>
        <h1 className="text-xl font-semibold">{t("lessons.view.unavailable")}</h1>
        <p className="mt-2 text-sm text-cova-mute">{t("lessons.view.unavailableHint")}</p>
        <div className="mt-4"><Button variant="secondary" onClick={() => void load()}>{t("common.tryAgain")}</Button></div>
      </CardBody></Card>
    );
  }

  const isOwner = course.created_by === userId;
  const blocks = (lesson.content_blocks ?? []) as LessonBlock[];

  if ((edit || !isOwner) && !isOwner) {
    // Students always read; the editor is owner-only.
    return <LessonView courseTitle={course.title} lesson={lesson} previous={previous} next={next} isOwner={false} />;
  }

  if (edit && isOwner) {
    return (
      <LessonEditor
        courseId={courseId}
        lesson={{ ...lesson, content_blocks: blocks }}
        onSaved={() => void load()}
      />
    );
  }

  return <LessonView courseTitle={course.title} lesson={lesson} previous={previous} next={next} isOwner={isOwner} />;
}
