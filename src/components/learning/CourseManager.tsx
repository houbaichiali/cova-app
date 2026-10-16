
"use client";

import { useState } from "react";
import { Plus, Trash2, BookOpen, Copy, Loader2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import type { LessonType } from "@/types";

type LessonDraft = {
  title: string;
  type: LessonType;
  minutes: number;
  summary: string;
  content: string;
};

const emptyLesson = (): LessonDraft => ({
  title: "",
  type: "reading",
  minutes: 10,
  summary: "",
  content: "",
});

export function CourseManager() {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState("Beginner");
  const [category, setCategory] = useState("General");
  const [visibility, setVisibility] = useState("private");
  const [lessons, setLessons] = useState<LessonDraft[]>([emptyLesson()]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  function updateLesson(index: number, changes: Partial<LessonDraft>) {
    setLessons((current) =>
      current.map((lesson, i) =>
        i === index ? { ...lesson, ...changes } : lesson,
      ),
    );
  }

  async function createCourse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setInviteCode("");

    if (!title.trim()) {
      setMessage("Please enter a course title.");
      return;
    }

    if (lessons.some((lesson) => !lesson.title.trim())) {
      setMessage("Please give every lesson a title.");
      return;
    }

    setLoading(true);

    try {
      const supabase = getSupabase();
      const { data: auth, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;
      if (!auth.user) throw new Error("Please sign in first.");

      const courseId = `course-${crypto.randomUUID()}`;

      const { error: courseError } = await supabase.from("courses").insert({
        id: courseId,
        title: title.trim(),
        description: description.trim(),
        level,
        category: category.trim() || "General",
        instructor:
          auth.user.user_metadata?.full_name ||
          auth.user.user_metadata?.name ||
          auth.user.email?.split("@")[0] ||
          "Student",
        tags: [],
        published: visibility === "public",
        created_by: auth.user.id,
      });

      if (courseError) throw courseError;

      const lessonRows = lessons.map((lesson, index) => ({
        id: `${courseId}-lesson-${index + 1}`,
        course_id: courseId,
        title: lesson.title.trim(),
        type: lesson.type,
        minutes: Math.max(1, Number(lesson.minutes) || 10),
        summary: lesson.summary.trim(),
        content: lesson.content.trim(),
        position: index + 1,
      }));

      const { error: lessonError } = await supabase
        .from("course_lessons")
        .insert(lessonRows);

      if (lessonError) {
        await supabase.from("courses").delete().eq("id", courseId);
        throw lessonError;
      }

      if (visibility === "private") {
        const { data: code, error: inviteError } = await supabase.rpc(
          "create_course_invite",
          { p_course_id: courseId },
        );

        if (inviteError) {
          throw new Error(
            "Course created, but the invitation code could not be generated. Please refresh and check your courses.",
          );
        }

        setInviteCode(String(code));
      }

      setMessage("Course created successfully.");
      setTitle("");
      setDescription("");
      setLevel("Beginner");
      setCategory("General");
      setLessons([emptyLesson()]);
    } catch (error) {
      console.error("Course creation failed:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not create the course. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mb-6">
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
        >
          <Plus className="mr-2 h-4 w-4" />
          {isOpen ? "Close form" : "Create a course"}
        </Button>
      </div>

      {isOpen && (
        <div className="mt-4 rounded-xl border border-cova-line p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-lg bg-cova-soft p-2">
              <BookOpen className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Create a course</h2>
              <p className="text-sm text-cova-mute">
                Share what you know with the COVA community.
              </p>
            </div>
          </div>

          <form onSubmit={createCourse} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Course title
                <input
                  required
                  maxLength={120}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-cova-line bg-transparent px-3 py-2"
                  placeholder="e.g. Introduction to Python"
                />
              </label>

              <label className="block text-sm font-medium">
                Category
                <input
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-cova-line bg-transparent px-3 py-2"
                  placeholder="Programming"
                />
              </label>
            </div>

            <label className="block text-sm font-medium">
              Description
              <textarea
                required
                maxLength={2000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className="mt-1.5 w-full rounded-lg border border-cova-line bg-transparent px-3 py-2"
                placeholder="What will students learn?"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Level
                <select
                  value={level}
                  onChange={(event) => setLevel(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-cova-line bg-transparent px-3 py-2"
                >
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>
              </label>

              <label className="block text-sm font-medium">
                Access
                <select
                  value={visibility}
                  onChange={(event) => setVisibility(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-cova-line bg-transparent px-3 py-2"
                >
                  <option value="private">Private — invitation code</option>
                  <option value="public">Public — visible in the catalogue</option>
                </select>
              </label>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">Lessons</h3>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setLessons((current) => [...current, emptyLesson()])
                  }
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add lesson
                </Button>
              </div>

              {lessons.map((lesson, index) => (
                <div
                  key={index}
                  className="space-y-3 rounded-lg border border-cova-line p-4"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">
                      Lesson {index + 1}
                    </h4>
                    {lessons.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove lesson ${index + 1}`}
                        onClick={() =>
                          setLessons((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                        className="rounded p-1 text-cova-mute hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <label className="block text-sm font-medium">
                    Lesson title
                    <input
                      required
                      value={lesson.title}
                      onChange={(event) =>
                        updateLesson(index, { title: event.target.value })
                      }
                      className="mt-1.5 w-full rounded-lg border border-cova-line bg-transparent px-3 py-2"
                      placeholder="Lesson title"
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-medium">
                      Type
                      <select
                        value={lesson.type}
                        onChange={(event) =>
                          updateLesson(index, {
                            type: event.target.value as LessonType,
                          })
                        }
                        className="mt-1.5 w-full rounded-lg border border-cova-line bg-transparent px-3 py-2"
                      >
                        <option value="reading">Reading</option>
                        <option value="video">Video</option>
                        <option value="exercise">Exercise</option>
                      </select>
                    </label>

                    <label className="block text-sm font-medium">
                      Duration (minutes)
                      <input
                        type="number"
                        min={1}
                        max={600}
                        value={lesson.minutes}
                        onChange={(event) =>
                          updateLesson(index, {
                            minutes: Number(event.target.value),
                          })
                        }
                        className="mt-1.5 w-full rounded-lg border border-cova-line bg-transparent px-3 py-2"
                      />
                    </label>
                  </div>

                  <label className="block text-sm font-medium">
                    Summary
                    <textarea
                      value={lesson.summary}
                      onChange={(event) =>
                        updateLesson(index, { summary: event.target.value })
                      }
                      rows={2}
                      className="mt-1.5 w-full rounded-lg border border-cova-line bg-transparent px-3 py-2"
                      placeholder="A short overview of the lesson"
                    />
                  </label>
                </div>
              ))}
            </div>

            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create course"
              )}
            </Button>
          </form>

          {message && (
            <p role="status" className="mt-4 text-sm">
              {message}
            </p>
          )}

          {inviteCode && (
            <div className="mt-4 rounded-lg border border-cova-line p-4">
              <p className="font-semibold">Your invitation code</p>
              <p className="my-2 font-mono text-2xl tracking-widest">
                {inviteCode}
              </p>
              <p className="mb-3 text-sm text-cova-mute">
                Share this code with the students you want to invite.
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(inviteCode);
                  setMessage("Invitation code copied.");
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy code
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
