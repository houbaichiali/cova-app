"use client";

import { useMemo, useState } from "react";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SelectFilter } from "@/components/ui/FormField";
import { SearchInput } from "@/components/ui/SearchInput";
import { Tabs } from "@/components/ui/Tabs";
import { CourseCard } from "@/components/learning/CourseCard";
import { courses } from "@/data/courses";
import { useDemoState } from "@/lib/demo-store";
import { matchesQuery, pluralize } from "@/lib/utils";

const TABS = ["All courses", "My courses"] as const;
const ALL = "All levels";
const levels = [ALL, "Beginner", "Intermediate", "Advanced"];

export function CoursesBrowser() {
  const { enrolledCourses, completedLessons } = useDemoState();
  const [tab, setTab] = useState<(typeof TABS)[number]>("All courses");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState(ALL);

  const results = useMemo(
    () =>
      courses.filter(
        (c) =>
          (tab === "All courses" || enrolledCourses.includes(c.id)) &&
          (level === ALL || c.level === level) &&
          matchesQuery(query, c.title, c.description, c.tags, c.category, c.instructor),
      ),
    [tab, enrolledCourses, level, query],
  );

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          tabs={TABS}
          value={tab}
          onChange={setTab}
          label="Courses view"
          counts={{ "My courses": enrolledCourses.length }}
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
            onChange={(e) => setLevel(e.target.value)}
          />
        </div>
      </div>
      <p className="mb-4 text-sm text-cova-mute" aria-live="polite">
        {pluralize(results.length, "course")} found
      </p>
      {results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={
            tab === "My courses"
              ? "You haven't enrolled in any courses"
              : "No courses match your search"
          }
          description={
            tab === "My courses"
              ? "Enrol in a course to see your progress here."
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
          {results.map((c) => (
            <CourseCard
              key={c.id}
              course={c}
              enrolled={enrolledCourses.includes(c.id)}
              completedLessons={completedLessons}
            />
          ))}
        </div>
      )}
    </>
  );
}
