"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { useT } from "@/i18n/client";
import { LessonSectionsView, titledSections, type LessonSection } from "@/components/learning/lesson-blocks";
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
  content_blocks: unknown[];
  objectives: string | null;
  duration_minutes: number | null;
}

/** Dedicated reading page for one lesson: sections on the left, the titled
 *  sections as real anchor links (#section-<id>) on the right, previous/next. */
export function LessonView({
  courseTitle,
  lesson,
  sections,
  previous,
  next,
  isOwner,
}: {
  courseTitle: string;
  lesson: LessonMeta;
  sections: LessonSection[];
  previous: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
  isOwner: boolean;
}) {
  const t = useT();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const outline = useMemo(() => titledSections(sections), [sections]);
  const native = lesson.lesson_type === "native";

  // Scroll-spy: the section covering the top of the viewport is the active one.
  useEffect(() => {
    if (!native || outline.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: "-96px 0px -55% 0px", threshold: 0 },
    );
    for (const entry of outline) {
      const element = document.getElementById(entry.anchor);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [native, outline]);

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
              <LessonSectionsView sections={sections} />
            </CardBody>
          </Card>
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <button
              type="button"
              className="mb-2 w-full rounded-lg border border-cova-line bg-white px-3 py-2 text-sm font-medium lg:hidden"
              aria-expanded={outlineOpen}
              onClick={() => setOutlineOpen((open) => !open)}
            >
              {t("lessons.editor.outline")}
            </button>
            <nav aria-label={t("lessons.editor.outline")} className={outlineOpen ? "" : "hidden lg:block"}>
              <Card>
                <CardBody>
                  <h2 className="mb-2 text-sm font-semibold">{t("lessons.editor.outline")}</h2>
                  {outline.length === 0 ? (
                    <p className="text-sm text-cova-mute">{t("lessons.editor.outlineEmpty")}</p>
                  ) : (
                    <ul className="max-h-[70vh] space-y-1 overflow-y-auto text-sm">
                      {outline.map((entry) => (
                        <li key={entry.id}>
                          <a
                            href={`#${entry.anchor}`}
                            onClick={() => setOutlineOpen(false)}
                            aria-current={activeId === entry.anchor ? "true" : undefined}
                            className={`block rounded px-2 py-1 hover:bg-cova-bg ${activeId === entry.anchor ? "bg-cova-pale font-semibold" : "text-cova-mute"}`}
                          >
                            {entry.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            </nav>
          </aside>
        </div>
      ) : (
        <Card>
          <CardBody>
            {lesson.content && <p className="whitespace-pre-wrap text-sm leading-7">{lesson.content}</p>}
            {lesson.content && <p className="mt-1 text-xs text-cova-mute">{t("lessons.view.materialsHint")}</p>}
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
