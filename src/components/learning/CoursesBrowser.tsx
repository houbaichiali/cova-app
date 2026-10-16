
"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, SearchX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SelectFilter } from "@/components/ui/FormField";
import { SearchInput } from "@/components/ui/SearchInput";
import { Tabs } from "@/components/ui/Tabs";
import { CourseCard } from "@/components/learning/CourseCard";
import { matchesQuery, pluralize } from "@/lib/utils";
import { getSupabase } from "@/lib/supabase/client";
import type { Course, LessonType } from "@/types";

const TABS = ["All courses", "My courses", "Created Courses"] as const;
const ALL = "All levels";
const levels = [ALL, "Beginner", "Intermediate", "Advanced"];

type CourseRow = {
  id: string;
  title: string;
  description: string;
  level: string;
  category: string;
  instructor: string;
  tags: string[] | null;
  created_by: string | null;
};

type LessonRow = {
  id: string;
  course_id: string;
  title: string;
  type: LessonType;
  minutes: number;
  summary: string;
  position: number;
};

export function CoursesBrowser() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledCourses, setEnrolledCourses] = useState<string[]>([]);
  const [ownedCourses, setOwnedCourses] = useState<string[]>([]);
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]>("All courses");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState(ALL);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadCourses() {
      setLoading(true);
      setErrorMessage("");

      try {
        const supabase = getSupabase();
        const { data: authData, error: authError } =
          await supabase.auth.getUser();

        if (authError) throw authError;

        if (!authData.user) {
          if (active) {
            setCourses([]);
            setEnrolledCourses([]);
            setOwnedCourses([]);
            setCompletedLessons([]);
          }
          return;
        }

        const userId = authData.user.id;

        const [courseResult, lessonResult, enrollmentResult, completionResult] =
          await Promise.all([
            supabase
              .from("courses")
              .select(
                "id, title, description, level, category, instructor, tags, created_by",
              )
              .order("created_at", { ascending: false }),

            supabase
              .from("course_lessons")
              .select("id, course_id, title, type, minutes, summary, position")
              .order("position", { ascending: true }),

            supabase
              .from("course_enrollments")
              .select("course_id")
              .eq("user_id", userId),

            supabase
              .from("lesson_completions")
              .select("lesson_id")
              .eq("user_id", userId),
          ]);

        if (courseResult.error) throw courseResult.error;
        if (lessonResult.error) throw lessonResult.error;
        if (enrollmentResult.error) throw enrollmentResult.error;
        if (completionResult.error) throw completionResult.error;

        const courseRows = (courseResult.data ?? []) as CourseRow[];
        const lessonRows = (lessonResult.data ?? []) as LessonRow[];

        const loadedCourses: Course[] = courseRows.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
          level: row.level as Course["level"],
          category: row.category,
          instructor: row.instructor,
          tags: row.tags ?? [],
          learners: 0,
          lessons: lessonRows
            .filter((lesson) => lesson.course_id === row.id)
            .map((lesson) => ({
              id: lesson.id,
              title: lesson.title,
              type: lesson.type,
              minutes: lesson.minutes,
              summary: lesson.summary,
            })),
        }));

        const enrolledIds = (enrollmentResult.data ?? []).map(
          (row) => row.course_id,
        );

        const ownedIds = courseRows
          .filter((row) => row.created_by === userId)
          .map((row) => row.id);

        if (active) {
          setCourses(loadedCourses);
          setEnrolledCourses(enrolledIds);
          setOwnedCourses(ownedIds);
          setCompletedLessons(
            (completionResult.data ?? []).map((row) => row.lesson_id),
          );
        }
      } catch (error) {
        console.error("Erreur de chargement des cours :", error);

        if (active) {
          setErrorMessage(
            "Impossible de charger les cours. Vérifie ta connexion puis réessaie.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadCourses();

    return () => {
      active = false;
    };
  }, []);

  const myCourseIds = useMemo(
    () => Array.from(new Set([...enrolledCourses, ...ownedCourses])),
    [enrolledCourses, ownedCourses],
  );

  const results = useMemo(
    () =>
      courses.filter((course) => {
        const belongsToTab =
          tab === "All courses"
            ? true
            : tab === "My courses"
              ? myCourseIds.includes(course.id)
              : ownedCourses.includes(course.id);

        return (
          belongsToTab &&
          (level === ALL || course.level === level) &&
          matchesQuery(
            query,
            course.title,
            course.description,
            course.tags,
            course.category,
            course.instructor,
          )
        );
      }),
    [courses, tab, myCourseIds, ownedCourses, level, query],
  );

  if (loading) {
    return (
      <div className="rounded-xl border border-cova-line p-6">
        <p className="text-sm text-cova-mute">Loading courses...</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <EmptyState
        icon={SearchX}
        title="Courses unavailable"
        description={errorMessage}
        action={
          <Button
            variant="secondary"
            onClick={() => window.location.reload()}
          >
            Try again
          </Button>
        }
      />
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          tabs={TABS}
          value={tab}
          onChange={setTab}
          label="Courses view"
          counts={{
            "My courses": myCourseIds.length,
            "Created Courses": ownedCourses.length,
          }}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            label="Search courses"
            placeholder="Search courses, topics or instructors"
            value={query}
            onChange={setQuery}
            className="sm:w-72"
          />

          <SelectFilter
            label="Level"
            options={levels}
            value={level}
            onChange={(event) => setLevel(event.target.value)}
          />
        </div>
      </div>

      <p className="mb-4 text-sm text-cova-mute" aria-live="polite">
        {pluralize(results.length, "course")} found
      </p>

      {results.length === 0 ? (
        <EmptyState
          icon={courses.length === 0 ? BookOpen : SearchX}
          title={
            courses.length === 0
              ? "No courses available yet"
              : tab === "My courses"
                ? "No courses in your learning space yet"
                : tab === "Created Courses"
                  ? "You haven't created any courses yet"
                  : "No courses match your search"
          }
          description={
            courses.length === 0
              ? "Public courses and private courses shared with you will appear here."
              : tab === "My courses"
                ? "Courses you create or join will appear here."
                : tab === "Created Courses"
                  ? "Courses you create will appear here."
                  : "Try different keywords or choose another level."
          }
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setLevel(ALL);
                setTab("All courses");
              }}
            >
              Show all courses
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              enrolled={enrolledCourses.includes(course.id)}
              completedLessons={completedLessons}
            />
          ))}
        </div>
      )}
    </>
  );
}
