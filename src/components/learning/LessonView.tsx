"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { useT } from "@/i18n/client";
import { buildToc, LessonBlocksView, type LessonBlock } from "@/components/learning/lesson-blocks";
import { LessonFilesManager } from "@/components/learning/LessonFilesManager";

export interface LessonMeta {
  id: string;
  course_id: string;
  title: string;
  summary: string | null;
  content: string | null;
  lesson_type: "external" | "native";
  position: number;
  lesson_status: string;
  content_blocks: LessonBlock[];
  objectives: string | null;
  duration_minutes: number | null;
}

/** Reading view for one lesson: native content with the outline on the right,
 *  or the external files, plus previous/next navigation. */
export function LessonView({
  courseTitle,
  lesson,
  previous,
  next,
  isOwner,
}: {
  courseTitle: string;
  lesson: LessonMeta;
  previous: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
  isOwner: boolean;
}) {
  const t = useT();
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const toc = useMemo(() => buildToc(lesson.content_blocks ?? []), [lesson.content_blocks]);
  const native = lesson.lesson_type === "native";

  // Scroll spy: highlight the heading closest to the top of the viewport.
  useEffect(() => {
    if (!native) return;
    function onScroll() {
      let current: string | null = null;
      for (const entry of toc) {
        const element = document.querySelector(`[data-bid="${entry.blockId}"]`);
        if (element && element.getBoundingClientRect().top < 140) current = entry.blockId;
      }
      setActiveHeading(current);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [native, toc]);

  function goTo(entryBlockId: string) {
    setActiveHeading(entryBlockId);
    document.querySelector(`[data-bid="${entryBlockId}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setOutlineOpen(false);
  }

  return (
    <div className="space-y-4">
      <Link href={`/courses/${lesson.course_id}`} className="inline-flex items-center gap-2 text-sm font-medium text-cova-mute hover:text-cova-ink">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /> {courseTitle}
      </Link>

      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="soft">{native ? t("lessons.editor.native") : t("lessons.editor.external")}</Badge>
            {lesson.duration_minutes ? <Badge tone="outline">{t("assignments.runner.timeLimit", { minutes: lesson.duration_minutes })}</Badge> : null}
            {lesson.lesson_status === "draft" && <Badge tone="pale">{t("assignments.detail.draft")}</Badge>}
          </div>
          <h1 className="text-2xl font-semibold">{lesson.title}</h1>
          {lesson.summary && <p className="text-sm text-cova-mute">{lesson.summary}</p>}
          {lesson.objectives && (
            <div className="rounded-lg bg-cova-bg p-3 text-sm">
              <p className="font-semibold">{t("modules.create.objectives")}</p>
              <p className="mt-1 whitespace-pre-wrap">{lesson.objectives}</p>
            </div>
          )}
        </CardBody>
      </Card>

      {native ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
          <Card>
            <CardBody>
              <LessonBlocksView blocks={lesson.content_blocks ?? []} />
            </CardBody>
          </Card>
          <aside className="lg:sticky lg:top-24">
            <button type="button" className="mb-2 w-full rounded-lg border border-cova-line bg-white px-3 py-2 text-sm font-medium lg:hidden" onClick={() => setOutlineOpen((open) => !open)}>
              {t("lessons.editor.outline")}
            </button>
            <Card className={outlineOpen ? "" : "hidden lg:block"}>
              <CardBody>
                <h2 className="mb-2 text-sm font-semibold">{t("lessons.editor.outline")}</h2>
                {toc.length === 0 ? (
                  <p className="text-sm text-cova-mute">{t("lessons.editor.outlineEmpty")}</p>
                ) : (
                  <ul className="max-h-96 space-y-1 overflow-y-auto text-sm">
                    {toc.map((entry) => (
                      <li key={entry.blockId} style={{ paddingInlineStart: `${(entry.level - 1) * 0.9}rem` }}>
                        <button
                          type="button"
                          onClick={() => goTo(entry.blockId)}
                          className={`w-full truncate rounded px-2 py-1 text-start hover:bg-cova-bg ${activeHeading === entry.blockId ? "bg-cova-pale font-semibold" : entry.level === 1 ? "font-semibold" : "text-cova-mute"}`}
                        >
                          <span className="me-1.5 font-mono text-xs text-cova-muted">{entry.number}</span>
                          {entry.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </aside>
        </div>
      ) : (
        <Card>
          <CardBody>
            {lesson.content && <p className="whitespace-pre-wrap text-sm leading-7">{lesson.content}</p>}
            {lesson.content && !lesson.content_blocks?.length && <p className="mt-1 text-xs text-cova-mute">{t("lessons.view.materialsHint")}</p>}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <h2 className="mb-3 text-lg font-semibold">{t("lessons.resources")}</h2>
          <LessonFilesManager lessonId={lesson.id} canEdit={isOwner} />
        </CardBody>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:justify-between">
        {previous ? (
          <Link href={`/courses/${lesson.course_id}/lessons/${previous.id}`} className="flex-1 rounded-xl border border-cova-line bg-white p-3 text-sm hover:bg-cova-bg">
            <span className="flex items-center gap-1 text-xs text-cova-mute"><ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />{t("lessons.view.previous")}</span>
            <span className="mt-1 block truncate font-medium">{previous.title}</span>
          </Link>
        ) : <span className="flex-1" />}
        {next ? (
          <Link href={`/courses/${lesson.course_id}/lessons/${next.id}`} className="flex-1 rounded-xl border border-cova-line bg-white p-3 text-sm hover:bg-cova-bg sm:text-end">
            <span className="flex items-center gap-1 text-xs text-cova-mute sm:justify-end">{t("lessons.view.next")}<ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" /></span>
            <span className="mt-1 block truncate font-medium">{next.title}</span>
          </Link>
        ) : <span className="flex-1" />}
      </div>

      {isOwner && (
        <p className="text-center text-xs text-cova-mute">
          {t("lessons.view.ownerHint")} <Link href={`/courses/${lesson.course_id}/lessons/${lesson.id}/edit`} className="underline">{t("lessons.view.editLesson")}</Link>
        </p>
      )}
    </div>
  );
}
