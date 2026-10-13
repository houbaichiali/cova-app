"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, BookText, CheckCircle2, Circle, Code2, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useToast } from "@/components/ui/Toast";
import { assignments } from "@/data/assignments";
import { demoActions, useDemoState } from "@/lib/demo-store";
import { courseProgress } from "@/lib/progress";
import { cn, dueLabel } from "@/lib/utils";
import type { Course, LessonType } from "@/types";

const lessonIcon = { video: PlayCircle, reading: BookText, exercise: Code2 } satisfies Record<
  LessonType,
  unknown
>;

export function CourseDetail({ course }: { course: Course }) {
  const toast = useToast();
  const { enrolledCourses, completedLessons } = useDemoState();
  const enrolled = enrolledCourses.includes(course.id);
  const progress = courseProgress(course, completedLessons);
  const [openLesson, setOpenLesson] = useState<string | null>(course.lessons[0]?.id ?? null);
  const related = assignments.filter((a) => a.courseId === course.id);

  return (
    <>
      <Link
        href="/courses"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-cova-mute hover:text-cova-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to courses
      </Link>

      <Card>
        <CardBody className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="soft">{course.level}</Badge>
              <Badge tone="outline">{course.category}</Badge>
            </div>
            <h1 className="mt-3 text-2xl font-semibold">{course.title}</h1>
            <p className="mt-1.5 text-sm text-cova-mute">{course.description}</p>
            <p className="mt-3 text-sm text-cova-mute">
              Taught by {course.instructor} · {course.learners.toLocaleString("en-US")} learners
            </p>
          </div>
          <div className="w-full md:w-60">
            {enrolled && (
              <div className="mb-3">
                <div className="mb-1.5 flex justify-between text-xs text-cova-mute">
                  <span>Progress</span>
                  <span>{progress.pct}%</span>
                </div>
                <ProgressBar value={progress.pct} label="Course progress" />
              </div>
            )}
            <Button
              className="w-full"
              variant={enrolled ? "secondary" : "primary"}
              onClick={() => {
                demoActions.toggleEnrollment(course.id);
                toast.push(
                  enrolled ? `Unenrolled from ${course.title}` : `Enrolled in ${course.title}`,
                );
              }}
            >
              {enrolled ? "Unenrol" : "Enrol in course"}
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="lessons-heading" className="lg:col-span-2">
          <h2 id="lessons-heading" className="mb-3 text-base font-semibold">
            Lessons ({course.lessons.length})
          </h2>
          <ul className="space-y-2">
            {course.lessons.map((lesson, i) => {
              const done = completedLessons.includes(lesson.id);
              const Icon = lessonIcon[lesson.type];
              const open = openLesson === lesson.id;
              return (
                <li key={lesson.id}>
                  <Card className={cn(open && "border-cova-soft")}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenLesson(open ? null : lesson.id)}
                      className="flex w-full items-center gap-3 p-4 text-start"
                    >
                      {done ? (
                        <CheckCircle2
                          className="h-5 w-5 shrink-0 text-cova-muted"
                          aria-label="Completed"
                        />
                      ) : (
                        <Circle
                          className="h-5 w-5 shrink-0 text-cova-line"
                          aria-label="Not completed"
                        />
                      )}
                      <span className="flex-1">
                        <span className="block text-sm font-medium">
                          {i + 1}. {lesson.title}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-cova-mute">
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {lesson.type} ·{" "}
                          {lesson.minutes} min
                        </span>
                      </span>
                    </button>
                    {open && (
                      <div className="border-t border-cova-line px-4 pb-4 pt-3">
                        <p className="text-sm text-cova-mute">{lesson.summary}</p>
                        {enrolled ? (
                          <Button
                            size="sm"
                            className="mt-3"
                            variant={done ? "secondary" : "primary"}
                            onClick={() => {
                              demoActions.toggleLesson(lesson.id);
                              toast.push(
                                done ? "Lesson marked as not done" : "Lesson complete: +15 XP",
                              );
                            }}
                          >
                            {done ? "Mark as not done" : "Mark as complete"}
                          </Button>
                        ) : (
                          <p className="mt-3 text-xs text-cova-mute">
                            Enrol in the course to track your progress.
                          </p>
                        )}
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-cova-mute">
            Demo only: lesson content is a short summary. Videos and full lesson bodies are not
            included.
          </p>
        </section>

        <aside aria-labelledby="related-heading">
          <h2 id="related-heading" className="mb-3 text-base font-semibold">
            Assignments
          </h2>
          <Card>
            <CardBody>
              {related.length === 0 ? (
                <p className="text-sm text-cova-mute">No assignments for this course yet.</p>
              ) : (
                <ul className="space-y-3">
                  {related.map((a) => (
                    <li key={a.id}>
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="text-xs text-cova-mute">
                        {dueLabel(a.due)} · {a.points} pts
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href="/assignments"
                className="mt-4 inline-block text-sm font-medium underline-offset-2 hover:underline"
              >
                Open assignments
              </Link>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
