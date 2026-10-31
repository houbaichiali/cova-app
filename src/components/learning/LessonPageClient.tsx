"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { LessonEditor } from "@/components/learning/LessonEditor";
import { LessonView, type LessonMeta } from "@/components/learning/LessonView";
import { newSection, stripHtml, type LessonSection } from "@/components/learning/lesson-blocks";

interface LessonRow extends LessonMeta {
  created_by?: string;
}

/** Client fallback: turns the legacy flat content (content_blocks / content)
 *  into sections, for lessons saved before the sections migration ran. */
function sectionsFromLegacy(lesson: LessonRow): LessonSection[] {
  const blocks = (lesson.content_blocks ?? []) as Array<{ id?: string; type?: string; html?: string; rows?: string[][] }>;
  if (blocks.length > 0) {
    const sections: LessonSection[] = [];
    for (const block of blocks) {
      if (block.type && ["h1", "h2", "h3"].includes(block.type)) {
        const title = stripHtml(block.html ?? "");
        sections.push({ id: block.id || crypto.randomUUID(), title, html: "" });
      } else if (block.type === "table" && Array.isArray(block.rows)) {
        const [head = [], ...body] = block.rows;
        const html = `<table class="cova-table"><thead><tr>${head.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead><tbody>${body
          .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`;
        sections.push({ id: block.id || crypto.randomUUID(), title: "", html });
      } else {
        sections.push({ id: block.id || crypto.randomUUID(), title: "", html: block.html ?? "" });
      }
    }
    return sections;
  }
  if (lesson.content) return [{ id: crypto.randomUUID(), title: "", html: lesson.content }];
  return [newSection()];
}

/** Loads one lesson, its sections and its neighbours, then renders the editor
 *  (owner, /edit) or the reading view (students). */
export function LessonPageClient({ courseId, lessonId, edit }: { courseId: string; lessonId: string; edit?: boolean }) {
  const t = useT();
  const [course, setCourse] = useState<{ id: string; title: string; created_by: string } | null>(null);
  const [lesson, setLesson] = useState<LessonRow | null>(null);
  const [sections, setSections] = useState<LessonSection[] | null>(null);
  const [previous, setPrevious] = useState<{ id: string; title: string } | null>(null);
  const [next, setNext] = useState<{ id: string; title: string } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
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
      const lessonResult = lessonRow as LessonRow;
      setCourse(courseRow as { id: string; title: string; created_by: string });
      setUserId(auth.user?.id ?? null);
      setLesson(lessonResult);

      const { data: sectionRows, error: sectionsError } = await supabase
        .from("lesson_sections")
        .select("id,lesson_id,title,content_html,position")
        .eq("lesson_id", lessonId)
        .order("position");
      if (sectionsError) {
        setSections(sectionsFromLegacy(lessonResult));
      } else if ((sectionRows ?? []).length > 0) {
        setSections(
          (sectionRows ?? []).map((row) => ({
            id: row.id as string,
            title: (row.title as string | null) ?? "",
            html: (row.content_html as string) ?? "",
          })),
        );
      } else {
        setSections(sectionsFromLegacy(lessonResult));
      }

      const { data: siblings } = await supabase
        .from("lessons")
        .select("id,title,position,lesson_status")
        .eq("course_id", courseId)
        .order("position");
      const rows = (siblings ?? []) as Array<{ id: string; title: string; position: number; lesson_status: string }>;
      const isOwner = courseRow.created_by === auth.user?.id;
      const visible = rows.filter((row) => isOwner || row.lesson_status === "published");
      const index = visible.findIndex((row) => row.id === lessonId);
      setPrevious(index > 0 ? visible[index - 1] ?? null : null);
      setNext(index >= 0 && index < visible.length - 1 ? visible[index + 1] ?? null : null);
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

  const isOwner = useMemo(() => course?.created_by === userId, [course, userId]);

  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error || !lesson || !course || !sections) {
    return (
      <Card><CardBody>
        <h1 className="text-xl font-semibold">{t("lessons.view.unavailable")}</h1>
        <p className="mt-2 text-sm text-cova-mute">{t("lessons.view.unavailableHint")}</p>
        <div className="mt-4"><Button variant="secondary" onClick={() => void load()}>{t("common.tryAgain")}</Button></div>
      </CardBody></Card>
    );
  }

  if (edit && isOwner) {
    return (
      <LessonEditor
        courseId={courseId}
        lesson={{
          id: lesson.id,
          title: lesson.title,
          summary: lesson.summary,
          objectives: lesson.objectives,
          duration_minutes: lesson.duration_minutes,
          lesson_status: lesson.lesson_status,
        }}
        initialSections={sections}
        onSaved={() => void load()}
      />
    );
  }

  return <LessonView courseTitle={course.title} lesson={lesson} sections={sections} previous={previous} next={next} isOwner={isOwner} />;
}
