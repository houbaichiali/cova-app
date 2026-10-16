
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { CoursesBrowser } from "@/components/learning/CoursesBrowser";
import { CourseManager } from "@/components/learning/CourseManager";
import { JoinCourse } from "@/components/learning/JoinCourse";

export const metadata: Metadata = { title: "Courses" };

export default function CoursesPage() {
  return (
    <>
      <PageHeader
        title="Courses"
        description="Explore courses, share your knowledge, and learn with fellow students."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start">
        <div className="min-w-0">
          <CourseManager />
        </div>

        <div className="min-w-0">
          <JoinCourse />
        </div>
      </div>

      <CoursesBrowser />
    </>
  );
}
